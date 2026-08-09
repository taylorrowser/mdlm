import { existsSync } from "node:fs";
import { join } from "node:path";
import { appendAgentLog, createAgentRunner } from "./frontier-agent-runner.mjs";
import { commandOutput as baseCommandOutput, commandResult as baseCommandResult } from "./frontier-command.mjs";
import {
  actionProgressed,
  contractReviewRecoveryState,
  isRemoteValidationFailure,
  isTransientInfrastructureFailure,
  parsePullRequestNumber,
  resumesAtValidation,
  validatedHeadMatches,
  validationFailureAction,
} from "./frontier-loop-core.mjs";
import { referencedParentNumber } from "./frontier-issue-contract.mjs";
import { editingAgentPrompt } from "./frontier-prompts.mjs";
import { sleep } from "./frontier-time.mjs";

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

  function executeAgentAction(issue, prepared, issueLog, paths, state, action, transition = {}) {
    const descriptions = {
      implementation: "implementation",
      remediation: "broad remediation",
      diagnosis: "independent diagnosis",
      simplification: "design simplification",
      "contract-review": "autonomous contract review",
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
    });
    agentRunner.runImplementation(prepared.worktree, prompt, issueLog, `${action.resumed ? "resumed " : ""}${description}`);
    const after = actionSnapshot(issue, prepared.worktree);
    const noProgressHead = actionProgressed(before, after) ? null : after.head;
    if (noProgressHead) appendAgentLog(issueLog, "no-op editing pass", "The agent changed neither repository bytes nor issue comments; any validation and review already cached at this SHA will be reused.\n");
    return writeState(paths, state, { pendingAction: null, noProgressHead });
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
      if (isTransientInfrastructureFailure(new Error(output))) throw new Error(output);
      const latest = commandResult("gh", ["pr", "checks", String(prNumber), "--json", "name,state,bucket"], { cwd: worktree });
      let latestChecks = [];
      try {
        latestChecks = latest.stdout.trim() ? JSON.parse(latest.stdout) : [];
      } catch {
        latestChecks = [];
      }
      if (latestChecks.some((check) => check.bucket === "fail")) fail(`Remote checks failed for PR #${prNumber}; inspect ${logPath}`);
      throw new Error(`Remote check command failed without a failing check bucket for PR #${prNumber}: ${[latest.stdout, latest.stderr, output].filter(Boolean).join("\n")}`);
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

  function publishAndMerge(issue, worktree, branch, logPath, validatedHead, preferredPullRequest, onPullRequest) {
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
      commandOutput("git", ["push", "--set-upstream", "origin", branch], { cwd: worktree });
      if (pullRequest?.state === "CLOSED") {
        commandOutput("gh", ["pr", "reopen", String(pullRequest.number)], { cwd: worktree });
        pullRequest = { ...pullRequest, state: "OPEN" };
      }
      if (!pullRequest) {
        const body = `Closes #${issue.number}\n\nImplemented and independently validated by the MDLM frontier loop.`;
        const url = commandOutput("gh", ["pr", "create", "--base", base, "--head", branch, "--title", issue.title, "--body", body], { cwd: worktree });
        pullRequest = { number: parsePullRequestNumber(url), url, state: "OPEN" };
      }
    }

    const prNumber = pullRequest.number;
    onPullRequest(prNumber);
    appendAgentLog(logPath, "pull request", `${pullRequest.url}\n`);
    if (pullRequest.state !== "MERGED") {
      if (pullRequestHead(prNumber, worktree) !== validatedHead) fail(`Remote PR #${prNumber} does not point at validated commit ${validatedHead}`);
      waitForPullRequestChecks(prNumber, worktree, logPath);
      if (pullRequestHead(prNumber, worktree) !== validatedHead) fail(`Remote PR #${prNumber} changed after validation`);
      commandOutput("gh", ["pr", "merge", String(prNumber), "--merge", "--match-head-commit", validatedHead], { cwd: worktree });
    }
    waitForMergedPullRequest(prNumber, worktree, logPath);
    deleteRemoteBranch(worktree, branch);
    for (let attempt = 0; attempt < 15 && issueOpen(issue.number); attempt += 1) sleep(2_000);
    if (issueOpen(issue.number)) {
      commandOutput("gh", ["issue", "close", String(issue.number), "--comment", `Implemented and confirmed merged in PR #${prNumber}.`]);
    }
    return prNumber;
  }

  function betweenTicketsPatch() {
    return {
      phase: "between-tickets",
      currentIssue: null,
      currentIssueTitle: null,
      branch: null,
      worktree: null,
      issueLog: null,
      pullRequest: null,
      remediationUsed: false,
      diagnosticEscalations: 0,
      designEscalations: 0,
      contractReviews: 0,
      complexityReviewedHead: null,
      commandsInFlightHead: null,
      commandsAttemptedHead: null,
      commandsValidatedHead: null,
      reviewedHead: null,
      reviewedEvidenceFingerprint: null,
      pendingAction: null,
      validatedHead: null,
      noProgressHead: null,
      lastError: null,
    };
  }

  function mergeValidatedIssue(issue, paths, state, prepared, issueLog) {
    const head = commandOutput("git", ["rev-parse", "HEAD"], { cwd: prepared.worktree });
    if (!validatedHeadMatches(state, head)) fail(`Validated branch changed before publication for #${issue.number}`);
    state = writeState(paths, state, { phase: "merging", message: `Publishing and merging #${issue.number}` });
    log(state.message);
    const prNumber = publishAndMerge(
      issue,
      prepared.worktree,
      prepared.branch,
      issueLog,
      head,
      state.pullRequest,
      (pullRequest) => {
        state = writeState(paths, state, { pullRequest });
      },
    );
    state = writeState(paths, state, { pullRequest: prNumber, message: `Merged #${issue.number} in PR #${prNumber}` });
    log(state.message);
    removeWorktree(prepared.worktree, prepared.branch);
    return writeState(paths, state, betweenTicketsPatch());
  }

  function reconcileCurrentIssue(plan, paths, state) {
    if (!state.currentIssue) return state;
    const current = [...plan.children, ...plan.backlog].find((issue) => issue.number === state.currentIssue);
    const cwd = state.worktree && existsSync(state.worktree) ? state.worktree : repositoryRoot;
    let merged = [];
    if (state.pullRequest) {
      const detail = commandJson("gh", ["pr", "view", String(state.pullRequest), "--json", "number,state"], { cwd });
      if (detail?.state === "MERGED") merged = [detail];
    } else if (state.branch) {
      merged = commandJson("gh", ["pr", "list", "--head", state.branch, "--state", "merged", "--json", "number"], { cwd }) ?? [];
    }
    if (merged.length === 0) {
      if (current?.state === "CLOSED") fail(`Issue #${state.currentIssue} closed without a confirmed merged PR; preserving its branch and worktree`);
      return state;
    }
    const prNumber = merged[0].number;
    if (current?.state === "OPEN") {
      commandOutput("gh", ["issue", "close", String(state.currentIssue), "--comment", `Implemented and confirmed merged in PR #${prNumber}.`], { cwd });
    }
    if (state.worktree && existsSync(state.worktree)) {
      const dirty = commandOutput("git", ["status", "--porcelain"], { cwd: state.worktree });
      if (dirty) fail(`Merged issue #${state.currentIssue} has a dirty preserved worktree: ${state.worktree}`);
    }
    deleteRemoteBranch(cwd, state.branch);
    removeWorktree(state.worktree, state.branch);
    log(`Reconciled confirmed merged issue #${state.currentIssue} after interrupted publication or cleanup`);
    return writeState(paths, state, betweenTicketsPatch());
  }

  function processIssue(issue, paths, state) {
    const continuingIssue = state?.currentIssue === issue.number;
    const prepared = prepareWorktree(issue, paths, state);
    const issueLog = join(paths.root, `issue-${issue.number}.log`);
    const currentHead = commandOutput("git", ["rev-parse", "HEAD"], { cwd: prepared.worktree });
    const pendingAction = continuingIssue ? state.pendingAction ?? null : null;
    const resumeValidated = !pendingAction && validatedHeadMatches(state, currentHead);
    let remediationUsed = continuingIssue ? state.remediationUsed ?? false : false;
    let diagnosticEscalations = continuingIssue ? state.diagnosticEscalations ?? 0 : 0;
    let designEscalations = continuingIssue ? state.designEscalations ?? 0 : 0;
    let contractReviews = continuingIssue ? state.contractReviews ?? 0 : 0;
    let complexityReviewedHead = continuingIssue ? state.complexityReviewedHead ?? null : null;
    let commandsInFlightHead = continuingIssue ? state.commandsInFlightHead ?? null : null;
    let commandsAttemptedHead = continuingIssue ? state.commandsAttemptedHead ?? null : null;
    let commandsValidatedHead = continuingIssue ? state.commandsValidatedHead ?? null : null;
    let reviewedHead = continuingIssue ? state.reviewedHead ?? null : null;
    let reviewedEvidenceFingerprint = continuingIssue ? state.reviewedEvidenceFingerprint ?? null : null;
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
      complexityReviewedHead,
      commandsInFlightHead,
      commandsAttemptedHead,
      commandsValidatedHead,
      reviewedHead,
      reviewedEvidenceFingerprint,
      validatedHead: resumeValidated ? currentHead : null,
      lastError: null,
    });
    const login = viewerLogin();
    if (!issue.assignees.some((assignee) => assignee.login === login)) {
      commandOutput("gh", ["issue", "edit", String(issue.number), "--add-assignee", "@me"]);
    }
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
        complexityReviewedHead,
        commandsInFlightHead,
        commandsAttemptedHead,
        commandsValidatedHead,
        message: `Validating #${issue.number} (remediation ${remediationUsed ? "used" : "available"}, diagnostics ${diagnosticEscalations}/${maximumDiagnosticEscalations}, simplifications ${designEscalations}/${maximumDesignEscalations}, contract reviews ${contractReviews})`,
      });
      log(state.message);
      const commitCount = Number(commandOutput("git", ["rev-list", "--count", `origin/${defaultBranch()}..HEAD`], { cwd: prepared.worktree }));
      const clean = commandOutput("git", ["status", "--porcelain"], { cwd: prepared.worktree }) === "";
      let commandsPass = commitCount > 0 && clean && commandsValidatedHead === headBeforeValidation;
      const cachedFailedValidation = commandsAttemptedHead === headBeforeValidation
        && commandsValidatedHead !== headBeforeValidation;
      if (!commandsPass && commitCount > 0 && clean && !cachedFailedValidation) {
        commandsInFlightHead = headBeforeValidation;
        commandsValidatedHead = null;
        state = writeState(paths, state, {
          phase: "validating",
          pendingAction: { kind: "validation" },
          commandsInFlightHead,
          commandsValidatedHead,
        });
        commandsPass = agentRunner.validate(prepared.worktree, issueLog, defaultBranch());
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
        log(`Reusing failed command validation already recorded at ${headBeforeValidation}; advancing the correction ladder for #${issue.number}`);
      }
      let review = { retry: false, passed: false, simplify: false };
      const evidence = commandsPass
        ? agentRunner.reviewEvidence(issue, prepared.worktree, issueLog, defaultBranch())
        : null;
      const unchangedActionAlreadyReviewed = commandsPass
        && state.noProgressHead === headBeforeValidation
        && commandsValidatedHead === headBeforeValidation
        && reviewedHead === headBeforeValidation
        && reviewedEvidenceFingerprint === evidence.fingerprint;
      if (unchangedActionAlreadyReviewed) {
        state = writeState(paths, state, { noProgressHead: null });
        log(`Skipping unchanged validation and review for #${issue.number}; advancing the correction ladder`);
      } else if (commandsPass) {
        state = writeState(paths, state, { phase: "reviewing", pendingAction: { kind: "review" } });
        review = agentRunner.review(prepared.worktree, issueLog, evidence);
        if (!review.retry) {
          reviewedHead = headBeforeValidation;
          reviewedEvidenceFingerprint = review.evidenceFingerprint;
          state = writeState(paths, state, { reviewedHead, reviewedEvidenceFingerprint });
        }
      }
      if (commandsPass && review.retry) {
        state = writeState(paths, state, {
          phase: "retrying-review",
          pendingAction: { kind: "review" },
          message: `Reviewer/provider did not return a valid verdict for #${issue.number}; returning control to the supervisor without changing product code`,
        });
        log(state.message);
        fail(`Independent reviewer exhausted its bounded attempts for #${issue.number}`);
      }
      if (commandsPass && review.passed && !review.simplify) {
        const validatedHead = commandOutput("git", ["rev-parse", "HEAD"], { cwd: prepared.worktree });
        state = writeState(paths, state, { pendingAction: null, validatedHead });
        return mergeValidatedIssue(issue, paths, state, prepared, issueLog);
      }

      let action = validationFailureAction({
        remediationUsed,
        diagnosticEscalations,
        maximumDiagnosticEscalations,
        designEscalations,
        maximumDesignEscalations,
      });
      if (review.simplify && designEscalations < maximumDesignEscalations) action = "simplify";

      if (action === "remediate") {
        remediationUsed = true;
        state = executeAgentAction(issue, prepared, issueLog, paths, state, { kind: "remediation" }, { remediationUsed });
        continue;
      }

      if (action === "diagnose") {
        diagnosticEscalations += 1;
        state = executeAgentAction(issue, prepared, issueLog, paths, state, { kind: "diagnosis" }, { diagnosticEscalations });
        continue;
      }

      if (action === "simplify") {
        designEscalations += 1;
        state = executeAgentAction(issue, prepared, issueLog, paths, state, { kind: "simplification", reasons: complexityReasons }, { designEscalations });
        complexityReviewedHead = commandOutput("git", ["rev-parse", "HEAD"], { cwd: prepared.worktree });
        state = writeState(paths, state, { complexityReviewedHead });
        continue;
      }

      ({ remediationUsed, diagnosticEscalations, designEscalations, contractReviews, complexityReviewedHead } = contractReviewRecoveryState({
        remediationUsed,
        diagnosticEscalations,
        designEscalations,
        contractReviews,
        complexityReviewedHead,
      }));
      state = executeAgentAction(issue, prepared, issueLog, paths, state, { kind: "contract-review" }, {
        remediationUsed,
        diagnosticEscalations,
        designEscalations,
        contractReviews,
        complexityReviewedHead,
      });
    }
  }


  return { processIssue, reconcileCurrentIssue };
}
