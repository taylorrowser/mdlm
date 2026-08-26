import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AgentProcessTimeoutError, appendAgentLog, createAgentRunner } from "./frontier-agent-runner.mjs";
import { commandOutput as baseCommandOutput, commandResult as baseCommandResult } from "./frontier-command.mjs";
import { failureFingerprint, recordFailureFingerprint } from "./frontier-failure-evidence.mjs";
import {
  actionProgressed,
  agentTimeoutTransition,
  failureEvidenceMatches,
  isRemoteValidationFailure,
  isTransientInfrastructureFailure,
  mergedPullRequestMatchesValidatedHead,
  parsePullRequestNumber,
  publicationReconciliationAllowed,
  resumesAtValidation,
  reviewedVerdictAt,
  scheduleFailureAction,
  validatedHeadMatches,
} from "./frontier-loop-core.mjs";
import {
  bodyBlockedByNumbers,
  ISSUE_DETAIL_FIELDS,
  issueLabelNames,
  nativeBlockerApiArguments,
  normalizeNativeBlockers,
  referencedParentNumber,
  WAITING_TRIAGE_LABELS,
} from "./frontier-issue-contract.mjs";
import { editingAgentPrompt } from "./frontier-prompts.mjs";
import { sleep } from "./frontier-time.mjs";

function quarantineCommonRecord(issue, state) {
  return {
    issue: issue.number,
    title: issue.title,
    branch: state.branch,
    worktree: state.worktree,
    pullRequest: state.pullRequest ?? null,
    remediationUsed: state.remediationUsed ?? false,
    diagnosticEscalations: state.diagnosticEscalations ?? 0,
    designEscalations: state.designEscalations ?? 0,
    contractReviews: state.contractReviews ?? 0,
    targetedRepairCount: state.targetedRepairCount ?? 0,
    agentTimeoutCount: state.agentTimeoutCount ?? 0,
    quarantinedAt: state.quarantineStartedAt ?? state.quarantinedAt ?? new Date().toISOString(),
  };
}

export function quarantineIssueRecord(issue, state) {
  const common = quarantineCommonRecord(issue, state);
  if (state.pendingAction?.quarantineClass === "agent-infrastructure-timeout") {
    return {
      ...common,
      class: "agent-infrastructure-timeout",
      reason: `agent infrastructure timed out twice; final action was ${state.pendingAction.timeoutAction}`,
      timeoutAction: state.pendingAction.timeoutAction,
      timeoutEvidence: state.pendingAction.timeoutEvidence,
      timeoutLog: state.pendingAction.timeoutLog,
      timeoutOccurrences: state.agentTimeoutOccurrences ?? [],
    };
  }
  return {
    ...common,
    class: "product-correction-exhausted",
    reason: `targeted repair budget exhausted at fingerprint ${state.currentFailureFingerprint}`,
    failureFingerprint: state.currentFailureFingerprint,
    previousFailureFingerprint: state.previousFailureFingerprint ?? null,
    failureRepeatCount: state.failureRepeatCount ?? 0,
    failureEvidencePath: state.failureEvidencePath,
    failureEvidenceIdentity: state.failureEvidenceIdentity,
  };
}

export function quarantineIssueComment(marker, record) {
  if (record.class === "agent-infrastructure-timeout") {
    return `${marker}\nFrontier automation quarantined this open ticket because agent infrastructure timed out twice.\n\nClass: \`agent-infrastructure-timeout\`\nFinal timed-out action: \`${record.timeoutAction}\`\nTimeout evidence: ${record.timeoutEvidence}\nAgent log: \`${record.timeoutLog}\`\nPreserved branch: \`${record.branch}\`\nPreserved worktree: \`${record.worktree}\`\n\nNo product validation or review finding was manufactured. These timeouts consumed no additional product correction budget. This issue was not closed or merged.`;
  }
  return `${marker}\nFrontier automation quarantined this open ticket after its targeted repair budget was exhausted.\n\nClass: \`product-correction-exhausted\`\nFinal fingerprint: \`${record.failureFingerprint}\`\nReason: ${record.reason}\nPreserved branch: \`${record.branch}\`\nPreserved worktree: \`${record.worktree}\`\nFailure evidence: \`${record.failureEvidencePath}\`\n\nThis issue was not closed or merged.`;
}

export function publishQuarantineCommentOnce({ commandOutput, issueNumber, comments, marker, record }) {
  if (comments?.some((comment) => String(comment.body ?? "").includes(marker))) return "observed";
  commandOutput(
    "gh",
    ["issue", "comment", String(issueNumber), "--body", quarantineIssueComment(marker, record)],
    { maximumAttempts: 1 },
  );
  return "published";
}

export function claimIssueEdit(issue, login, { continuingClaimAuthorized = false } = {}) {
  if (issue.state !== "OPEN") throw new Error("Cannot claim a closed issue");
  const labels = issueLabelNames(issue);
  const owners = (issue.assignees ?? []).map((assignee) => assignee.login);
  const ownedSolelyByViewer = owners.length === 1 && owners[0] === login;
  const waitingRoles = WAITING_TRIAGE_LABELS.filter((label) => labels.has(label));
  if ((issue.blockedBy ?? []).some((blocker) => blocker.state !== "CLOSED")) {
    throw new Error("Issue has an open blocker");
  }
  if (labels.has("agent:in-progress")) {
    if (continuingClaimAuthorized && ownedSolelyByViewer && waitingRoles.length === 0) return null;
    throw new Error("Issue already has an active agent claim");
  }
  if (owners.length > 0) throw new Error("Issue already has another owner");
  if (!(waitingRoles.length === 1 && waitingRoles[0] === "ready-for-agent")) {
    throw new Error("Issue is not exclusively ready-for-agent");
  }
  return [
    "--add-label", "agent:in-progress",
    ...(labels.has("ready-for-agent") ? ["--remove-label", "ready-for-agent"] : []),
    ...(!ownedSolelyByViewer ? ["--add-assignee", "@me"] : []),
  ];
}

export function releaseIssueEdit(issue, login, nextTriage = null) {
  const labels = issueLabelNames(issue);
  const owners = (issue.assignees ?? []).map((assignee) => assignee.login);
  if (owners.length > 0 && !(owners.length === 1 && owners[0] === login)) {
    throw new Error("Cannot release another owner's issue");
  }
  const args = [];
  if (labels.has("agent:in-progress")) args.push("--remove-label", "agent:in-progress");
  if ((issue.assignees ?? []).some((assignee) => assignee.login === login)) {
    args.push("--remove-assignee", login);
  }
  for (const label of WAITING_TRIAGE_LABELS) {
    if (labels.has(label) && label !== nextTriage) args.push("--remove-label", label);
  }
  if (nextTriage && !labels.has(nextTriage)) args.push("--add-label", nextTriage);
  return args;
}

export function claimReleaseIntent(issueNumber, nextTriage, reason, pullRequest = null) {
  return { issue: issueNumber, nextTriage, reason, pullRequest };
}

function releaseIntentsMatch(actual, expected) {
  return actual?.issue === expected.issue
    && actual?.nextTriage === expected.nextTriage
    && actual?.reason === expected.reason
    && actual?.pullRequest === expected.pullRequest;
}

export function claimReleaseDisposition(issue, state, login, expectedIntent) {
  if (!releaseIntentsMatch(state.claimRelease, expectedIntent)) {
    throw new Error(`Issue #${expectedIntent.issue} claim release has no matching durable intent`);
  }
  const labels = issueLabelNames(issue);
  const waitingRoles = WAITING_TRIAGE_LABELS.filter((label) => labels.has(label));
  const owners = (issue.assignees ?? []).map((assignee) => assignee.login);
  const activelyClaimed = (expectedIntent.reason === "merged" || issue.state === "OPEN")
    && labels.has("agent:in-progress")
    && waitingRoles.length === 0
    && owners.length === 1
    && owners[0] === login;
  if (activelyClaimed) return "release";

  const exactReleasedState = expectedIntent.nextTriage
    ? issue.state === "OPEN" && waitingRoles.length === 1 && waitingRoles[0] === expectedIntent.nextTriage
    : issue.state === "CLOSED" && waitingRoles.length === 0;
  if (!labels.has("agent:in-progress") && owners.length === 0 && exactReleasedState) return "released";
  throw new Error(`Issue #${expectedIntent.issue} does not match its active or released claim state`);
}

export function durablePublicationClaimMatches(state, expected) {
  return state.currentIssue === expected.issue
    && state.claimedIssue === expected.issue
    && state.claimedBy === expected.login
    && state.branch === expected.branch
    && state.worktree === expected.worktree
    && state.validatedHead === expected.validatedHead;
}

export function publishWithClaimRevalidation(revalidateClaim, publish) {
  revalidateClaim();
  return publish();
}

export function releaseClaimAfterPersistence(persistIntent, releaseClaim) {
  const state = persistIntent();
  releaseClaim(state);
  return state;
}

export function betweenTicketsPatch() {
  return {
    phase: "between-tickets",
    currentIssue: null,
    currentIssueTitle: null,
    claimedIssue: null,
    claimedBy: null,
    claimRelease: null,
    branch: null,
    worktree: null,
    issueLog: null,
    pullRequest: null,
    remediationUsed: false,
    diagnosticEscalations: 0,
    designEscalations: 0,
    contractReviews: 0,
    targetedRepairCount: 0,
    agentTimeoutCount: 0,
    agentTimeoutOccurrences: [],
    agentAttempt: null,
    lastAgentTimeout: null,
    currentFailureFingerprint: null,
    previousFailureFingerprint: null,
    failureRepeatCount: 0,
    failureEvidencePath: null,
    failureEvidenceIdentity: null,
    quarantineStartedAt: null,
    complexityReviewedHead: null,
    commandsInFlightHead: null,
    commandsAttemptedHead: null,
    commandsValidatedHead: null,
    reviewedHead: null,
    reviewedEvidenceFingerprint: null,
    reviewedPassed: null,
    reviewedSimplify: null,
    pendingAction: null,
    validatedHead: null,
    noProgressHead: null,
    lastError: null,
  };
}

export function reconcileMergedIssueState(state, pullRequest) {
  if (!mergedPullRequestMatchesValidatedHead(state, pullRequest)) {
    throw new Error(`Merged PR #${pullRequest?.number} head does not match the validated head for #${state.currentIssue}; preserving its branch and worktree`);
  }
  return { ...state, ...betweenTicketsPatch() };
}

export function createTicketRunner({
  repositoryRoot,
  writeState,
  log,
  defaultBranch,
  maximumDiagnosticEscalations,
  maximumDesignEscalations,
  maximumAgentInfrastructureAttempts,
  complexityBudget,
}) {
  const agentRunner = createAgentRunner({
    repositoryRoot,
    maximumInfrastructureAttempts: maximumAgentInfrastructureAttempts,
    complexityBudget,
  });

  function commandResult(command, args, options = {}) {
    return baseCommandResult(command, args, { ...options, cwd: options.cwd ?? repositoryRoot });
  }

  function commandOutput(command, args, options = {}) {
    return baseCommandOutput(command, args, { ...options, cwd: options.cwd ?? repositoryRoot });
  }

  function commandJson(command, args, options = {}) {
    const output = commandOutput(command, args, options);
    return output ? JSON.parse(output) : null;
  }

  function fail(message) {
    throw new Error(message);
  }

  function publicationRetry(message) {
    const error = new Error(message);
    error.name = "PublicationRetryError";
    return error;
  }

  function viewerLogin() {
    return commandOutput("gh", ["api", "user", "--jq", ".login"]);
  }

  function issueOpen(number) {
    return commandOutput("gh", ["issue", "view", String(number), "--json", "state", "--jq", ".state"]) === "OPEN";
  }

  function worktreeFingerprint(worktree) {
    const status = commandOutput("git", ["status", "--porcelain=v2", "-z"], { cwd: worktree });
    const trackedBytes = commandOutput("git", ["diff", "--binary", "HEAD"], { cwd: worktree });
    const untracked = commandOutput("git", ["ls-files", "--others", "--exclude-standard", "-z"], { cwd: worktree })
      .split("\0")
      .filter(Boolean)
      .sort()
      .map((path) => `${path}:${commandOutput("git", ["hash-object", "--", path], { cwd: worktree })}`)
      .join("\n");
    return `${status}\n${trackedBytes}\n${untracked}`;
  }

  function issueActivityFingerprint(issue) {
    const fields = "number,title,body,comments";
    const active = commandOutput("gh", ["issue", "view", String(issue.number), "--json", fields]);
    const parentNumber = referencedParentNumber(JSON.parse(active).body);
    const parent = parentNumber
      ? commandOutput("gh", ["issue", "view", String(parentNumber), "--json", fields])
      : "";
    return `${active}\n${parent}`;
  }

  function actionSnapshot(issue, worktree) {
    return {
      head: commandOutput("git", ["rev-parse", "HEAD"], { cwd: worktree }),
      worktree: worktreeFingerprint(worktree),
      issueActivity: issueActivityFingerprint(issue),
    };
  }

  function deleteRemoteBranch(cwd, branch) {
    if (!branch) return;
    const remote = commandOutput("git", ["ls-remote", "--heads", "origin", `refs/heads/${branch}`], { cwd });
    if (remote) commandOutput("git", ["push", "origin", "--delete", branch], { cwd });
  }

  function removeWorktree(worktree, branch) {
    if (worktree && existsSync(worktree)) commandOutput("git", ["worktree", "remove", "--force", worktree]);
    if (branch && commandResult("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]).status === 0) {
      commandOutput("git", ["branch", "-D", branch]);
    }
  }

  function atomicWrite(path, content) {
    const temporary = `${path}.tmp-${process.pid}`;
    writeFileSync(temporary, content.endsWith("\n") ? content : `${content}\n`, { mode: 0o600 });
    renameSync(temporary, path);
  }

  function persistFailureEvidence(issueNumber, paths, state, failure, evidenceIdentity) {
    let fingerprintState;
    let content;
    if (failure) {
      const fingerprint = failureFingerprint(failure);
      fingerprintState = recordFailureFingerprint(state, fingerprint);
      content = [
        `COMMAND: ${failure.commandIdentity}`,
        `FINGERPRINT: ${fingerprint}`,
        `REPEATED: ${fingerprintState.failureRepeated ? "yes" : "no"}`,
        "",
        "EXACT OUTPUT:",
        String(failure.output ?? ""),
      ].join("\n");
    } else {
      if (!state.currentFailureFingerprint || !state.failureEvidencePath) fail(`Cannot repeat a failure for #${issueNumber} without durable evidence`);
      fingerprintState = recordFailureFingerprint(state, state.currentFailureFingerprint);
      content = readFileSync(state.failureEvidencePath, "utf8")
        .replace(/^REPEATED: (?:yes|no)$/m, `REPEATED: ${fingerprintState.failureRepeated ? "yes" : "no"}`);
    }
    const evidencePath = join(
      paths.root,
      `issue-${issueNumber}.failure-${fingerprintState.currentFailureFingerprint}-${fingerprintState.failureRepeatCount}.md`,
    );
    atomicWrite(evidencePath, content);
    return {
      ...fingerprintState,
      failureEvidencePath: evidencePath,
      failureEvidenceIdentity: evidenceIdentity ?? state.failureEvidenceIdentity,
    };
  }

  function scheduleProductFailure(issueNumber, paths, state, failure, {
    forceSimplification = false,
    reasons = [],
    evidenceIdentity,
  } = {}) {
    const failureState = { ...state, ...persistFailureEvidence(issueNumber, paths, state, failure, evidenceIdentity) };
    let scheduled;
    if (forceSimplification && (failureState.designEscalations ?? 0) < maximumDesignEscalations) {
      scheduled = {
        ...failureState,
        designEscalations: (failureState.designEscalations ?? 0) + 1,
        pendingAction: { kind: "simplification", reasons },
      };
    } else {
      scheduled = scheduleFailureAction(failureState, {
        maximumDiagnosticEscalations,
        maximumDesignEscalations,
      });
    }
    const action = scheduled.pendingAction?.kind ?? "unknown correction";
    return writeState(paths, state, {
      ...scheduled,
      phase: action === "quarantine" ? "quarantining" : "failed",
      quarantineStartedAt: action === "quarantine" ? scheduled.quarantineStartedAt ?? new Date().toISOString() : scheduled.quarantineStartedAt ?? null,
      message: action === "quarantine"
        ? `Targeted repair budget exhausted for #${issueNumber}; quarantining preserved work`
        : `Recorded product failure for #${issueNumber}; scheduled ${action}`,
      validatedHead: null,
    });
  }

  function quarantineRecords(paths) {
    const recordPath = paths.quarantineRecords ?? join(paths.root, "quarantines.json");
    if (!existsSync(recordPath)) return [];
    return JSON.parse(readFileSync(recordPath, "utf8"));
  }

  function appendQuarantineRecord(paths, record) {
    const recordPath = paths.quarantineRecords ?? join(paths.root, "quarantines.json");
    const records = quarantineRecords(paths);
    if (!records.some((candidate) => candidate.issue === record.issue)) records.push(record);
    atomicWrite(recordPath, JSON.stringify(records, null, 2));
    return records.find((candidate) => candidate.issue === record.issue) ?? record;
  }

  function liveIssue(issueNumber, cwd = repositoryRoot) {
    const issue = commandJson(
      "gh",
      ["issue", "view", String(issueNumber), "--json", ISSUE_DETAIL_FIELDS],
      { cwd },
    );
    const nativeBlockers = normalizeNativeBlockers(
      commandJson("gh", nativeBlockerApiArguments(issueNumber), { cwd }),
    );
    issue.blockedBy = nativeBlockers.length > 0
      ? nativeBlockers
      : bodyBlockedByNumbers(issue.body ?? "").map((number) => ({
        number,
        state: commandJson("gh", ["issue", "view", String(number), "--json", "state"], { cwd }).state,
      }));
    return issue;
  }

  function claimIssue(issue, continuingClaimAuthorized) {
    const login = viewerLogin();
    let live = liveIssue(issue.number);
    const edit = claimIssueEdit(live, login, { continuingClaimAuthorized });
    if (edit) commandOutput("gh", ["issue", "edit", String(issue.number), ...edit]);
    live = liveIssue(issue.number);
    const labels = issueLabelNames(live);
    const owners = (live.assignees ?? []).map((assignee) => assignee.login);
    if (live.state !== "OPEN" || !labels.has("agent:in-progress")
      || WAITING_TRIAGE_LABELS.some((label) => labels.has(label))
      || owners.length !== 1 || owners[0] !== login
      || (live.blockedBy ?? []).some((blocker) => blocker.state !== "CLOSED")) {
      fail(`Issue #${issue.number} claim was not durably observed`);
    }
  }

  function assertLocalClaim(issueNumber, state, cwd = repositoryRoot) {
    const login = viewerLogin();
    if (state.claimedIssue !== issueNumber || state.claimedBy !== login) {
      fail(`Issue #${issueNumber} is not bound to this controller's durable claim`);
    }
    const live = liveIssue(issueNumber, cwd);
    const labels = issueLabelNames(live);
    const owners = (live.assignees ?? []).map((assignee) => assignee.login);
    if (live.state !== "OPEN"
      || !labels.has("agent:in-progress")
      || WAITING_TRIAGE_LABELS.some((label) => labels.has(label))
      || owners.length !== 1 || owners[0] !== login
      || (live.blockedBy ?? []).some((blocker) => blocker.state !== "CLOSED")) {
      fail(`Issue #${issueNumber} no longer matches this controller's durable claim`);
    }
    return live;
  }

  function releaseIssueClaim(issueNumber, state, expectedIntent, cwd = repositoryRoot) {
    const login = viewerLogin();
    let live = liveIssue(issueNumber, cwd);
    const disposition = claimReleaseDisposition(live, state, login, expectedIntent);
    if (disposition === "release") {
      const edit = releaseIssueEdit(live, login, expectedIntent.nextTriage);
      if (edit.length > 0) commandOutput("gh", ["issue", "edit", String(issueNumber), ...edit], { cwd });
      live = liveIssue(issueNumber, cwd);
    }
    if (claimReleaseDisposition(live, state, login, expectedIntent) !== "released") {
      fail(`Issue #${issueNumber} claim release was not durably observed`);
    }
  }

  function quarantineIssue(issue, paths, state) {
    const intent = claimReleaseIntent(issue.number, "needs-info", "quarantine");
    if (!state.claimRelease) assertLocalClaim(issue.number, state);
    const marker = `<!-- mdlm-frontier-quarantine:${state.parentIssue}:${issue.number} -->`;
    const record = quarantineIssueRecord(issue, state);
    state = writeState(paths, state, {
      phase: "quarantining",
      pendingAction: { ...state.pendingAction, kind: "quarantine" },
      message: `Quarantining #${issue.number}; branch and worktree will be preserved`,
    });
    const live = commandJson("gh", ["issue", "view", String(issue.number), "--json", "comments,assignees"]);
    const commentStatus = publishQuarantineCommentOnce({
      commandOutput,
      issueNumber: issue.number,
      comments: live.comments,
      marker,
      record,
    });
    if (commentStatus === "published") {
      throw publicationRetry(`Published quarantine comment for #${issue.number}; waiting to observe its durable marker before continuing`);
    }
    const durableRecord = appendQuarantineRecord(paths, record);
    const quarantines = [...(state.quarantines ?? []).filter((candidate) => candidate.issue !== issue.number), durableRecord]
      .sort((left, right) => left.issue - right.issue);
    state = releaseClaimAfterPersistence(
      () => writeState(paths, state, {
        claimRelease: intent,
        quarantines,
        message: `Recorded quarantine for #${issue.number}; releasing its claim`,
      }),
      (durableState) => releaseIssueClaim(issue.number, durableState, intent),
    );
    log(`Quarantined #${issue.number} as ${record.class}; preserved ${record.branch} at ${record.worktree}`);
    return writeState(paths, state, {
      ...betweenTicketsPatch(),
      quarantines,
      phase: "between-tickets",
      message: `Quarantined #${issue.number} as ${record.class}; preserved its branch/worktree and continuing fixed scope`,
    });
  }

  function prepareWorktree(issue, paths, resumeState) {
    if (resumeState?.currentIssue === issue.number && resumeState.worktree && existsSync(resumeState.worktree)) {
      return { worktree: resumeState.worktree, branch: resumeState.branch, resumed: true };
    }
    const branch = `agent/issue-${issue.number}-${Date.now()}`;
    const worktree = join(paths.worktrees, `issue-${issue.number}`);
    if (existsSync(worktree)) fail(`Unrecognized existing worktree: ${worktree}`);
    const base = defaultBranch();
    commandOutput("git", ["fetch", "origin", base]);
    commandOutput("git", ["worktree", "add", "-b", branch, worktree, `origin/${base}`]);
    return { worktree, branch, resumed: false };
  }

  function beginAgentAttempt(paths, state, actionKind) {
    const existing = state.agentAttempt;
    const existingOccurrence = existing
      ? JSON.stringify([existing.actionKind, existing.attemptStartIdentity])
      : null;
    const canResumeExisting = existing?.actionKind === actionKind
      && !(state.agentTimeoutOccurrences ?? []).includes(existingOccurrence);
    const agentAttempt = canResumeExisting
      ? existing
      : {
          actionKind,
          attemptStartIdentity: randomUUID(),
          startedAt: new Date().toISOString(),
        };
    return writeState(paths, state, { agentAttempt });
  }

  function persistAgentTimeout(paths, state, error) {
    const transitioned = agentTimeoutTransition(state, {
      actionKind: error.actionKind,
      attemptStartIdentity: error.attemptStartIdentity,
      evidence: error.evidence,
      logPath: error.logPath,
    });
    if (transitioned === state) return state;
    const quarantining = transitioned.pendingAction?.kind === "quarantine";
    return writeState(paths, state, {
      ...transitioned,
      phase: quarantining ? "quarantining" : "retrying-agent-timeout",
      quarantineStartedAt: quarantining
        ? transitioned.quarantineStartedAt ?? new Date().toISOString()
        : transitioned.quarantineStartedAt ?? null,
      message: quarantining
        ? `Agent infrastructure timed out twice for #${state.currentIssue}; quarantining preserved work`
        : `Agent infrastructure timeout 1/2 for #${state.currentIssue}; retrying the same ${error.actionKind} action once`,
      lastError: error.message,
    });
  }

  function executeAgentAction(issue, prepared, issueLog, paths, state, action, transition = {}) {
    const descriptions = {
      implementation: "implementation",
      remediation: "broad remediation",
      diagnosis: "independent diagnosis",
      simplification: "design simplification",
      "contract-review": "autonomous contract review",
      "targeted-repair": "targeted repair",
    };
    const description = descriptions[action.kind];
    if (!description) fail(`Unknown pending agent action: ${action.kind}`);
    state = writeState(paths, state, {
      ...transition,
      phase: action.kind,
      pendingAction: action,
      message: `${action.resumed ? "Resuming" : "Running"} ${description} for #${issue.number}`,
      validatedHead: null,
    });
    log(state.message);
    const before = actionSnapshot(issue, prepared.worktree);
    const prompt = editingAgentPrompt(action.kind, {
      issue,
      resumed: action.kind === "implementation" && (prepared.resumed || action.resumed),
      reasonLog: issueLog,
      reasons: action.reasons ?? [],
      evidencePath: action.evidencePath,
      failureFingerprint: action.failureFingerprint,
      failureRepeated: action.failureRepeated,
    });
    state = beginAgentAttempt(paths, state, action.kind);
    try {
      agentRunner.runImplementation(
        prepared.worktree,
        prompt,
        issueLog,
        `${action.resumed ? "resumed " : ""}${description}`,
        state.agentAttempt,
      );
    } catch (error) {
      if (error instanceof AgentProcessTimeoutError) persistAgentTimeout(paths, state, error);
      throw error;
    }
    const after = actionSnapshot(issue, prepared.worktree);
    const noProgressHead = actionProgressed(before, after) ? null : after.head;
    if (noProgressHead) appendAgentLog(issueLog, "no-op editing pass", "The agent changed neither repository bytes nor issue comments; any validation and review already cached at this SHA will be reused.\n");
    return writeState(paths, state, { pendingAction: { kind: "validation" }, agentAttempt: null, noProgressHead });
  }

  function inspectPullRequestChecks(prNumber, worktree, logPath) {
    const checksExpected = existsSync(join(worktree, ".github", "workflows"));
    const discoveryAttempts = checksExpected ? 12 : 1;
    let checks = [];
    for (let attempt = 1; attempt <= discoveryAttempts; attempt += 1) {
      const result = commandResult("gh", ["pr", "checks", String(prNumber), "--json", "name,state,bucket"], { cwd: worktree });
      try {
        checks = result.stdout.trim() ? JSON.parse(result.stdout) : [];
      } catch {
        checks = [];
      }
      if (result.status !== 0 && checks.length === 0 && !/no checks reported/i.test(result.stderr ?? "")) {
        throw new Error(`Remote check discovery infrastructure failure for PR #${prNumber}: ${result.stderr || result.stdout}`);
      }
      if (checks.length > 0) break;
      if (attempt < discoveryAttempts) sleep(10_000);
    }
    if (checks.length === 0 && !checksExpected) {
      appendAgentLog(logPath, "remote checks", "No repository workflows or registered checks exist; local independent validation is authoritative.\n");
      return;
    }
    if (checks.length === 0) fail(`Expected remote checks did not register for PR #${prNumber}; publication will retry without changing code`);
    const watched = commandResult("gh", ["pr", "checks", String(prNumber), "--watch", "--fail-fast"], { cwd: worktree });
    const output = [watched.stdout, watched.stderr].filter(Boolean).join("\n");
    appendAgentLog(logPath, "remote checks", output);
    if (watched.status !== 0) {
      const latest = commandResult("gh", ["pr", "checks", String(prNumber), "--json", "name,state,bucket"], { cwd: worktree });
      let latestChecks = [];
      try {
        latestChecks = latest.stdout.trim() ? JSON.parse(latest.stdout) : [];
      } catch {
        latestChecks = [];
      }
      if (latestChecks.some((check) => check.bucket === "fail")) {
        const failure = new Error(`Remote checks failed for PR #${prNumber}; inspect ${logPath}`);
        failure.failureEvidence = {
          commandIdentity: `gh pr checks ${prNumber} --json name,state,bucket`,
          output: [latest.stdout, latest.stderr].filter(Boolean).join("\n"),
        };
        throw failure;
      }
      const combined = [latest.stdout, latest.stderr, output].filter(Boolean).join("\n");
      if (isTransientInfrastructureFailure(new Error(combined))) throw new Error(combined);
      throw new Error(`Remote check command failed without a failing check bucket for PR #${prNumber}: ${combined}`);
    }
  }

  function waitForPullRequestChecks(prNumber, worktree, logPath) {
    try {
      return inspectPullRequestChecks(prNumber, worktree, logPath);
    } catch (error) {
      if (isRemoteValidationFailure(error)) throw error;
      throw publicationRetry(`Remote-check infrastructure requires publication retry for PR #${prNumber}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function pullRequestHead(prNumber, worktree) {
    return commandOutput("gh", ["pr", "view", String(prNumber), "--json", "headRefOid", "--jq", ".headRefOid"], { cwd: worktree });
  }

  function waitForMergedPullRequest(prNumber, worktree, logPath) {
    try {
      for (let attempt = 1; attempt <= 60; attempt += 1) {
        const detail = commandJson("gh", ["pr", "view", String(prNumber), "--json", "state,mergeCommit"], { cwd: worktree });
        if (detail?.state === "MERGED") {
          appendAgentLog(logPath, "merge confirmation", `PR #${prNumber} merged as ${detail.mergeCommit?.oid ?? "unknown"}.\n`);
          return;
        }
        sleep(10_000);
      }
    } catch (error) {
      throw publicationRetry(`Merge confirmation infrastructure requires retry for PR #${prNumber}: ${error instanceof Error ? error.message : String(error)}`);
    }
    throw publicationRetry(`PR #${prNumber} did not reach confirmed MERGED state; publication will resume without closing the issue`);
  }

  function publishAndMerge(issue, worktree, branch, logPath, validatedHead, preferredPullRequest, onPullRequest, revalidateClaim) {
    const base = defaultBranch();
    const localHead = commandOutput("git", ["rev-parse", "HEAD"], { cwd: worktree });
    if (localHead !== validatedHead) fail(`Local head changed after validation for #${issue.number}`);

    let pullRequest = preferredPullRequest
      ? commandJson("gh", ["pr", "view", String(preferredPullRequest), "--json", "number,url,state"], { cwd: worktree })
      : null;
    if (!pullRequest) {
      const existing = commandJson("gh", ["pr", "list", "--head", branch, "--state", "all", "--limit", "1", "--json", "number,url,state"], { cwd: worktree }) ?? [];
      pullRequest = existing[0] ?? null;
    }

    if (pullRequest?.state !== "MERGED") {
      publishWithClaimRevalidation(
        revalidateClaim,
        () => commandOutput("git", ["push", "--set-upstream", "origin", branch], { cwd: worktree }),
      );
      if (pullRequest?.state === "CLOSED") {
        publishWithClaimRevalidation(
          revalidateClaim,
          () => commandOutput("gh", ["pr", "reopen", String(pullRequest.number)], { cwd: worktree }),
        );
        pullRequest = { ...pullRequest, state: "OPEN" };
      }
      if (!pullRequest) {
        const body = `Closes #${issue.number}\n\nImplemented and independently validated by the MDLM frontier loop.`;
        const url = publishWithClaimRevalidation(
          revalidateClaim,
          () => commandOutput("gh", ["pr", "create", "--base", base, "--head", branch, "--title", issue.title, "--body", body], { cwd: worktree }),
        );
        pullRequest = { number: parsePullRequestNumber(url), url, state: "OPEN" };
      }
    }

    const prNumber = pullRequest.number;
    onPullRequest(prNumber);
    appendAgentLog(logPath, "pull request", `${pullRequest.url}\n`);
    if (pullRequest.state === "MERGED" && pullRequestHead(prNumber, worktree) !== validatedHead) {
      fail(`Merged PR #${prNumber} head does not match validated commit ${validatedHead}; preserving local work`);
    }
    if (pullRequest.state !== "MERGED") {
      if (pullRequestHead(prNumber, worktree) !== validatedHead) fail(`Remote PR #${prNumber} does not point at validated commit ${validatedHead}`);
      waitForPullRequestChecks(prNumber, worktree, logPath);
      if (pullRequestHead(prNumber, worktree) !== validatedHead) fail(`Remote PR #${prNumber} changed after validation`);
      publishWithClaimRevalidation(
        revalidateClaim,
        () => commandOutput("gh", ["pr", "merge", String(prNumber), "--merge", "--match-head-commit", validatedHead], { cwd: worktree }),
      );
    }
    waitForMergedPullRequest(prNumber, worktree, logPath);
    deleteRemoteBranch(worktree, branch);
    return prNumber;
  }

  function durablePublicationClaim(paths, expected, cwd) {
    if (!existsSync(paths.state)) fail(`Missing durable frontier state before publishing #${expected.issue}`);
    const durable = JSON.parse(readFileSync(paths.state, "utf8"));
    if (!durablePublicationClaimMatches(durable, expected)) {
      fail(`Issue #${expected.issue} no longer matches the exact durable local publication claim`);
    }
    return assertLocalClaim(expected.issue, durable, cwd);
  }

  function completeMergedClaimRelease(issueNumber, prNumber, paths, state, cwd) {
    const intent = claimReleaseIntent(issueNumber, null, "merged", prNumber);
    if (state.claimRelease && !releaseIntentsMatch(state.claimRelease, intent)) {
      fail(`Issue #${issueNumber} has a conflicting durable claim release intent`);
    }
    return releaseClaimAfterPersistence(
      () => writeState(paths, state, {
        phase: "releasing-claim",
        pullRequest: prNumber,
        claimRelease: intent,
        message: `Confirmed merge for #${issueNumber}; releasing its claim`,
      }),
      (durableState) => {
        const live = liveIssue(issueNumber, cwd);
        const disposition = claimReleaseDisposition(live, durableState, viewerLogin(), intent);
        if (disposition === "release" && live.state === "OPEN") {
          commandOutput("gh", ["issue", "close", String(issueNumber), "--comment", `Implemented and confirmed merged in PR #${prNumber}.`], { cwd });
        }
        releaseIssueClaim(issueNumber, durableState, intent, cwd);
      },
    );
  }

  function mergeValidatedIssue(issue, paths, state, prepared, issueLog) {
    const head = commandOutput("git", ["rev-parse", "HEAD"], { cwd: prepared.worktree });
    if (!validatedHeadMatches(state, head)) fail(`Validated branch changed before publication for #${issue.number}`);
    state = writeState(paths, state, { phase: "merging", message: `Publishing and merging #${issue.number}` });
    log(state.message);
    const publicationClaim = {
      issue: issue.number,
      login: viewerLogin(),
      branch: prepared.branch,
      worktree: prepared.worktree,
      validatedHead: head,
    };
    let prNumber;
    try {
      prNumber = publishAndMerge(
        issue,
        prepared.worktree,
        prepared.branch,
        issueLog,
        head,
        state.pullRequest,
        (pullRequest) => {
          state = writeState(paths, state, { pullRequest });
        },
        () => durablePublicationClaim(paths, publicationClaim, prepared.worktree),
      );
    } catch (error) {
      if (isRemoteValidationFailure(error)) {
        state = scheduleProductFailure(issue.number, paths, state, error.failureEvidence, {
          evidenceIdentity: `remote:${state.validatedHead ?? "unknown"}:${state.pullRequest ?? "unknown"}`,
        });
        error.productFailureScheduled = true;
      }
      throw error;
    }
    state = completeMergedClaimRelease(issue.number, prNumber, paths, state, prepared.worktree);
    state = writeState(paths, state, { message: `Merged #${issue.number} in PR #${prNumber}` });
    log(state.message);
    removeWorktree(prepared.worktree, prepared.branch);
    return writeState(paths, state, betweenTicketsPatch());
  }

  function reconcileCurrentIssue(plan, paths, state) {
    if (!state.currentIssue || !publicationReconciliationAllowed(state)) return state;
    const current = [...plan.children, ...plan.backlog].find((issue) => issue.number === state.currentIssue);
    const cwd = state.worktree && existsSync(state.worktree) ? state.worktree : repositoryRoot;
    let merged = [];
    if (state.pullRequest) {
      const detail = commandJson("gh", ["pr", "view", String(state.pullRequest), "--json", "number,state,headRefOid"], { cwd });
      if (detail?.state === "MERGED") merged = [detail];
    } else if (state.branch) {
      merged = commandJson("gh", ["pr", "list", "--head", state.branch, "--state", "merged", "--json", "number,state,headRefOid"], { cwd }) ?? [];
    }
    if (merged.length === 0) {
      if (current?.state === "CLOSED") fail(`Issue #${state.currentIssue} closed without a confirmed merged PR; preserving its branch and worktree`);
      return state;
    }
    let reconciledState;
    try {
      reconciledState = reconcileMergedIssueState(state, merged[0]);
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
    const prNumber = merged[0].number;
    state = completeMergedClaimRelease(state.currentIssue, prNumber, paths, state, cwd);
    if (state.worktree && existsSync(state.worktree)) {
      const dirty = commandOutput("git", ["status", "--porcelain"], { cwd: state.worktree });
      if (dirty) fail(`Merged issue #${state.currentIssue} has a dirty preserved worktree: ${state.worktree}`);
    }
    deleteRemoteBranch(cwd, state.branch);
    removeWorktree(state.worktree, state.branch);
    log(`Reconciled confirmed merged issue #${state.currentIssue} after interrupted publication or cleanup`);
    return writeState(paths, state, reconciledState);
  }

  function processIssue(issue, paths, state) {
    const continuingIssue = state?.currentIssue === issue.number;
    if (continuingIssue && state.pendingAction?.kind === "quarantine") {
      return quarantineIssue(issue, paths, state);
    }
    const login = viewerLogin();
    const continuingClaimAuthorized = continuingIssue
      && state.claimedIssue === issue.number
      && state.claimedBy === login;
    claimIssue(issue, continuingClaimAuthorized);
    if (!continuingClaimAuthorized) {
      state = writeState(paths, state, { claimedIssue: issue.number, claimedBy: login });
    }
    const prepared = prepareWorktree(issue, paths, state);
    const issueLog = join(paths.root, `issue-${issue.number}.log`);
    const currentHead = commandOutput("git", ["rev-parse", "HEAD"], { cwd: prepared.worktree });
    const pendingAction = continuingIssue ? state.pendingAction ?? null : null;
    const resumeValidated = !pendingAction && validatedHeadMatches(state, currentHead);
    let remediationUsed = continuingIssue ? state.remediationUsed ?? false : false;
    let diagnosticEscalations = continuingIssue ? state.diagnosticEscalations ?? 0 : 0;
    let designEscalations = continuingIssue ? state.designEscalations ?? 0 : 0;
    let contractReviews = continuingIssue ? state.contractReviews ?? 0 : 0;
    let targetedRepairCount = continuingIssue ? state.targetedRepairCount ?? 0 : 0;
    let complexityReviewedHead = continuingIssue ? state.complexityReviewedHead ?? null : null;
    let commandsInFlightHead = continuingIssue ? state.commandsInFlightHead ?? null : null;
    let commandsAttemptedHead = continuingIssue ? state.commandsAttemptedHead ?? null : null;
    let commandsValidatedHead = continuingIssue ? state.commandsValidatedHead ?? null : null;
    let reviewedHead = continuingIssue ? state.reviewedHead ?? null : null;
    let reviewedEvidenceFingerprint = continuingIssue ? state.reviewedEvidenceFingerprint ?? null : null;
    let reviewedPassed = continuingIssue ? state.reviewedPassed ?? null : null;
    let reviewedSimplify = continuingIssue ? state.reviewedSimplify ?? null : null;
    state = writeState(paths, state, {
      phase: resumeValidated ? "merging" : pendingAction?.kind ?? (prepared.resumed ? "resuming" : "implementing"),
      message: resumeValidated
        ? `Retrying publication for validated #${issue.number}`
        : `${prepared.resumed ? "Resuming" : "Implementing"} #${issue.number}: ${issue.title}`,
      currentIssue: issue.number,
      currentIssueTitle: issue.title,
      branch: prepared.branch,
      worktree: prepared.worktree,
      issueLog,
      pullRequest: continuingIssue ? state.pullRequest ?? null : null,
      pendingAction,
      remediationUsed,
      diagnosticEscalations,
      designEscalations,
      contractReviews,
      targetedRepairCount,
      agentTimeoutCount: continuingIssue ? state.agentTimeoutCount ?? 0 : 0,
      agentTimeoutOccurrences: continuingIssue ? state.agentTimeoutOccurrences ?? [] : [],
      agentAttempt: continuingIssue ? state.agentAttempt ?? null : null,
      lastAgentTimeout: continuingIssue ? state.lastAgentTimeout ?? null : null,
      currentFailureFingerprint: continuingIssue ? state.currentFailureFingerprint ?? null : null,
      previousFailureFingerprint: continuingIssue ? state.previousFailureFingerprint ?? null : null,
      failureRepeatCount: continuingIssue ? state.failureRepeatCount ?? 0 : 0,
      failureEvidencePath: continuingIssue ? state.failureEvidencePath ?? null : null,
      failureEvidenceIdentity: continuingIssue ? state.failureEvidenceIdentity ?? null : null,
      quarantineStartedAt: continuingIssue ? state.quarantineStartedAt ?? null : null,
      complexityReviewedHead,
      commandsInFlightHead,
      commandsAttemptedHead,
      commandsValidatedHead,
      reviewedHead,
      reviewedEvidenceFingerprint,
      reviewedPassed,
      reviewedSimplify,
      validatedHead: resumeValidated ? currentHead : null,
      lastError: null,
    });
    if (pendingAction?.kind === "quarantine") return quarantineIssue(issue, paths, state);
    log(state.message);
    if (resumeValidated) return mergeValidatedIssue(issue, paths, state, prepared, issueLog);
    if (resumesAtValidation(pendingAction)) {
      state = writeState(paths, state, { phase: pendingAction.kind === "review" ? "retrying-review" : "validating" });
    } else {
      state = executeAgentAction(
        issue,
        prepared,
        issueLog,
        paths,
        state,
        pendingAction ? { ...pendingAction, resumed: true } : { kind: "implementation" },
      );
    }

    while (true) {
      const headBeforeValidation = commandOutput("git", ["rev-parse", "HEAD"], { cwd: prepared.worktree });
      const complexityReasons = agentRunner.complexityReasons(prepared.worktree, defaultBranch());
      if (complexityReasons.length > 0 && complexityReviewedHead !== headBeforeValidation && designEscalations < maximumDesignEscalations) {
        designEscalations += 1;
        state = executeAgentAction(issue, prepared, issueLog, paths, state, { kind: "simplification", reasons: complexityReasons }, { designEscalations });
        complexityReviewedHead = commandOutput("git", ["rev-parse", "HEAD"], { cwd: prepared.worktree });
        state = writeState(paths, state, { complexityReviewedHead });
        continue;
      }

      state = writeState(paths, state, {
        phase: "validating",
        pendingAction: commandsValidatedHead === headBeforeValidation ? { kind: "review" } : { kind: "validation" },
        remediationUsed,
        diagnosticEscalations,
        designEscalations,
        contractReviews,
        targetedRepairCount,
        complexityReviewedHead,
        commandsInFlightHead,
        commandsAttemptedHead,
        commandsValidatedHead,
        message: `Validating #${issue.number} (remediation ${remediationUsed ? "used" : "available"}, diagnostics ${diagnosticEscalations}/${maximumDiagnosticEscalations}, simplifications ${designEscalations}/${maximumDesignEscalations}, contract review ${contractReviews}/1, targeted repairs ${targetedRepairCount}/3)`,
      });
      log(state.message);
      const commitCount = Number(commandOutput("git", ["rev-list", "--count", `origin/${defaultBranch()}..HEAD`], { cwd: prepared.worktree }));
      const clean = commandOutput("git", ["status", "--porcelain"], { cwd: prepared.worktree }) === "";
      let commandsPass = commitCount > 0 && clean && commandsValidatedHead === headBeforeValidation;
      let latestFailure = null;
      const commandFailureIdentity = `command:${headBeforeValidation}`;
      const cachedFailedValidation = commitCount > 0
        && clean
        && commandsAttemptedHead === headBeforeValidation
        && commandsValidatedHead !== headBeforeValidation
        && failureEvidenceMatches(state, commandFailureIdentity);
      if (!commandsPass && commitCount > 0 && clean && !cachedFailedValidation) {
        commandsInFlightHead = headBeforeValidation;
        commandsValidatedHead = null;
        state = writeState(paths, state, {
          phase: "validating",
          pendingAction: { kind: "validation" },
          commandsInFlightHead,
          commandsValidatedHead,
        });
        const validation = agentRunner.validate(prepared.worktree, issueLog, defaultBranch());
        commandsPass = validation.passed;
        latestFailure = validation.failure;
        const headAfterCommands = commandOutput("git", ["rev-parse", "HEAD"], { cwd: prepared.worktree });
        const cleanAfterCommands = commandOutput("git", ["status", "--porcelain"], { cwd: prepared.worktree }) === "";
        if (commandsPass && (headAfterCommands !== headBeforeValidation || !cleanAfterCommands)) {
          fail(`Independent command validation mutated #${issue.number}; refusing to review or publish unvalidated bytes`);
        }
        commandsInFlightHead = null;
        commandsAttemptedHead = headBeforeValidation;
        commandsValidatedHead = commandsPass ? headBeforeValidation : null;
        state = writeState(paths, state, {
          commandsInFlightHead,
          commandsAttemptedHead,
          commandsValidatedHead,
          pendingAction: commandsPass ? { kind: "review" } : { kind: "failed-validation" },
        });
      }
      if (cachedFailedValidation) {
        state = writeState(paths, state, { noProgressHead: null });
        log(`Reusing exact failed command evidence already recorded at ${headBeforeValidation}; advancing the bounded correction ladder for #${issue.number}`);
      }
      if (!commandsPass && !latestFailure && !cachedFailedValidation) {
        latestFailure = {
          commandIdentity: "frontier committed-tip validation precondition",
          output: commitCount === 0
            ? "The ticket branch has no commit beyond the base branch."
            : "The ticket worktree is dirty; authoritative validation requires committed bytes.",
        };
      }
      let review = { retry: false, passed: false, simplify: false, failure: null };
      const evidence = commandsPass
        ? agentRunner.reviewEvidence(issue, prepared.worktree, issueLog, defaultBranch())
        : null;
      const reviewFailureIdentity = evidence ? `review:${headBeforeValidation}:${evidence.fingerprint}` : null;
      const cachedReviewVerdict = evidence ? reviewedVerdictAt(state, headBeforeValidation, evidence.fingerprint) : null;
      const unchangedActionAlreadyReviewed = commandsPass
        && state.noProgressHead === headBeforeValidation
        && commandsValidatedHead === headBeforeValidation
        && cachedReviewVerdict;
      if (unchangedActionAlreadyReviewed) {
        review = { retry: false, ...cachedReviewVerdict, failure: null };
        state = writeState(paths, state, { noProgressHead: null });
        log(`Reusing exact independent review for unchanged #${issue.number}`);
      } else if (commandsPass) {
        state = writeState(paths, state, { phase: "reviewing", pendingAction: { kind: "review" } });
        state = beginAgentAttempt(paths, state, "review");
        try {
          review = agentRunner.review(prepared.worktree, issueLog, evidence, state.agentAttempt);
        } catch (error) {
          if (error instanceof AgentProcessTimeoutError) persistAgentTimeout(paths, state, error);
          throw error;
        }
        state = writeState(paths, state, { agentAttempt: null });
        if (!review.retry) {
          reviewedHead = headBeforeValidation;
          reviewedEvidenceFingerprint = review.evidenceFingerprint;
          reviewedPassed = review.passed;
          reviewedSimplify = review.simplify;
          state = writeState(paths, state, { reviewedHead, reviewedEvidenceFingerprint, reviewedPassed, reviewedSimplify });
        }
      }
      if (commandsPass && review.retry) {
        state = writeState(paths, state, {
          phase: "retrying-review",
          pendingAction: { kind: "review" },
          message: `Reviewer/provider did not return a valid verdict for #${issue.number}; returning control to the supervisor without consuming a product correction`,
        });
        log(state.message);
        fail(`Independent reviewer exhausted its bounded infrastructure attempts for #${issue.number}`);
      }
      if (commandsPass && review.passed && !review.simplify) {
        const validatedHead = commandOutput("git", ["rev-parse", "HEAD"], { cwd: prepared.worktree });
        state = writeState(paths, state, { pendingAction: null, validatedHead });
        return mergeValidatedIssue(issue, paths, state, prepared, issueLog);
      }

      latestFailure ??= review.failure;
      state = scheduleProductFailure(issue.number, paths, state, latestFailure, {
        forceSimplification: review.simplify,
        reasons: complexityReasons.length > 0 ? complexityReasons : ["independent reviewer requested protected-architecture simplification"],
        evidenceIdentity: commandsPass ? reviewFailureIdentity : commandFailureIdentity,
      });
      remediationUsed = state.remediationUsed ?? false;
      diagnosticEscalations = state.diagnosticEscalations ?? 0;
      designEscalations = state.designEscalations ?? 0;
      contractReviews = state.contractReviews ?? 0;
      targetedRepairCount = state.targetedRepairCount ?? 0;
      if (state.pendingAction?.kind === "quarantine") return quarantineIssue(issue, paths, state);
      const scheduledAction = state.pendingAction;
      state = executeAgentAction(issue, prepared, issueLog, paths, state, scheduledAction);
      if (scheduledAction.kind === "simplification") {
        complexityReviewedHead = commandOutput("git", ["rev-parse", "HEAD"], { cwd: prepared.worktree });
        state = writeState(paths, state, { complexityReviewedHead });
      }
    }
  }


  function scheduleExternalProductFailure(paths, state, error) {
    if (!state.currentIssue) fail("Cannot schedule an external product failure without an active ticket");
    const failure = error?.failureEvidence ?? {
      commandIdentity: "remote validation",
      output: error instanceof Error ? error.message : String(error),
    };
    return scheduleProductFailure(state.currentIssue, paths, state, failure, {
      evidenceIdentity: `remote:${state.validatedHead ?? "unknown"}:${state.pullRequest ?? "unknown"}`,
    });
  }

  return {
    processIssue,
    reconcileCurrentIssue,
    recordAgentTimeout: persistAgentTimeout,
    scheduleExternalProductFailure,
  };
}
