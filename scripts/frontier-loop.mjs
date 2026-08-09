#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { commandOutput as baseCommandOutput, commandResult as baseCommandResult } from "./frontier-command.mjs";
import {
  bodyBlockedByNumbers,
  bodyReferencesParent,
  failureBaseState,
  findFrontier,
  findReadyItem,
  isRemoteValidationFailure,
  isTransientInfrastructureFailure,
  panesAreRunning,
  parsePullRequestNumber,
  priorityIssueSnapshot,
  selectOlderReadyBacklog,
  selectSnapshottedIssues,
  validatedHeadMatches,
  validationFailureAction,
} from "./frontier-loop-core.mjs";
import { appendAgentLog, createAgentRunner } from "./frontier-agent-runner.mjs";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const defaultParent = 83;
const defaultPollSeconds = 60;
const maximumDiagnosticEscalations = 2;
const maximumDesignEscalations = 2;
const maximumAgentInfrastructureAttempts = 4;
const defaultMaximumChangedFiles = 24;
const defaultMaximumChangedLines = 1_800;
const defaultMaximumLifecycleModules = 12;
const agentRunner = createAgentRunner({
  repositoryRoot,
  maximumInfrastructureAttempts: maximumAgentInfrastructureAttempts,
  complexityBudget: {
    maximumChangedFiles: Number(process.env.MDLM_FRONTIER_MAX_CHANGED_FILES ?? defaultMaximumChangedFiles),
    maximumChangedLines: Number(process.env.MDLM_FRONTIER_MAX_CHANGED_LINES ?? defaultMaximumChangedLines),
    maximumLifecycleModules: Number(process.env.MDLM_FRONTIER_MAX_LIFECYCLE_MODULES ?? defaultMaximumLifecycleModules),
  },
});

function fail(message) {
  throw new Error(message);
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

function commandOptions(command, args, options) {
  return {
    ...options,
    cwd: options.cwd ?? repositoryRoot,
    onRetry: ({ attempt, maximumAttempts }) => {
      process.stdout.write(`[${isoNow()}] Transient infrastructure failure; retrying ${command} ${args.join(" ")} (${attempt}/${maximumAttempts})\n`);
    },
  };
}

function commandResult(command, args, options = {}) {
  return baseCommandResult(command, args, commandOptions(command, args, options));
}

function commandOutput(command, args, options = {}) {
  return baseCommandOutput(command, args, commandOptions(command, args, options));
}

function commandJson(command, args, options = {}) {
  const output = commandOutput(command, args, options);
  return output ? JSON.parse(output) : null;
}

function ghJson(args, options = {}) {
  return commandJson("gh", [...args, "--json", options.fields], options);
}

function sleep(milliseconds) {
  execFileSync(process.execPath, ["-e", `setTimeout(() => {}, ${milliseconds})`]);
}

function isoNow() {
  return new Date().toISOString();
}

function loopPaths(parent) {
  const root = resolve(process.env.MDLM_FRONTIER_DIR ?? join(repositoryRoot, "artifacts", `frontier-loop-${parent}`));
  return {
    root,
    state: join(root, "status.json"),
    stop: join(root, "STOP"),
    runnerLog: join(root, "runner.log"),
    worktrees: join(root, "worktrees"),
  };
}

function sessionName(parent) {
  return process.env.MDLM_FRONTIER_SESSION ?? `mdlm-frontier-${parent}`;
}

function readState(paths) {
  if (!existsSync(paths.state)) return null;
  return JSON.parse(readFileSync(paths.state, "utf8"));
}

function writeState(paths, current, patch) {
  mkdirSync(paths.root, { recursive: true });
  const next = { ...current, ...patch, updatedAt: isoNow() };
  const temporary = `${paths.state}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, paths.state);
  return next;
}

function log(message) {
  process.stdout.write(`[${isoNow()}] ${message}\n`);
}

function issueDetails(summary, issueStates) {
  const detail = ghJson(["issue", "view", String(summary.number)], {
    fields: "number,title,state,url,assignees,blockedBy,labels,body",
  });
  const nativeBlockers = detail.blockedBy?.nodes ?? [];
  const blockedBy = nativeBlockers.length > 0
    ? nativeBlockers
    : bodyBlockedByNumbers(detail.body).map((number) => ({ number, state: issueStates.get(number) ?? "UNKNOWN" }));
  return {
    number: detail.number,
    title: detail.title,
    state: detail.state,
    url: detail.url,
    assignees: detail.assignees ?? [],
    blockedBy,
    labels: detail.labels ?? [],
    body: detail.body ?? "",
  };
}

function allIssueSummaries() {
  return ghJson(["issue", "list", "--state", "all", "--limit", "1000"], {
    fields: "number,title,state,url,assignees,labels,body",
  }) ?? [];
}

function parentIssues(parent, summaries = allIssueSummaries(), issueNumbers = null) {
  const issueStates = new Map(summaries.map((issue) => [issue.number, issue.state]));
  const selected = issueNumbers
    ? selectSnapshottedIssues(issueNumbers, summaries)
    : summaries.filter((issue) => bodyReferencesParent(issue.body, parent));
  return selected.map((issue) => issueDetails(issue, issueStates));
}

function readyBacklog(parent, summaries, children, issueNumbers = null) {
  const issueStates = new Map(summaries.map((issue) => [issue.number, issue.state]));
  const selected = issueNumbers
    ? selectSnapshottedIssues(issueNumbers, summaries)
    : selectOlderReadyBacklog(parent, summaries, children);
  return selected.map((issue) => issueDetails(issue, issueStates));
}

function deliveryPlan(parent, priorityIssueNumbers = null, backlogIssueNumbers = null) {
  const summaries = allIssueSummaries();
  const children = parentIssues(parent, summaries, priorityIssueNumbers);
  const primaryOpen = children.filter((issue) => issue.state === "OPEN");
  const backlog = readyBacklog(parent, summaries, children, backlogIssueNumbers);
  const pool = primaryOpen.length > 0 ? children : backlog;
  return {
    children,
    primaryOpen,
    backlog,
    pool,
    open: pool.filter((issue) => issue.state === "OPEN"),
    next: primaryOpen.length > 0 ? findFrontier(pool) : findReadyItem(pool),
    scope: primaryOpen.length > 0 ? "priority-map frontier" : "older ready backlog",
  };
}

function viewerLogin() {
  return commandOutput("gh", ["api", "user", "--jq", ".login"]);
}

function defaultBranch() {
  const local = commandResult("git", ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
  if (local.status === 0) return local.stdout.trim().replace(/^origin\//, "");
  return commandOutput("gh", ["repo", "view", "--json", "defaultBranchRef", "--jq", ".defaultBranchRef.name"]);
}

function ensurePrerequisites() {
  for (const [command, args] of [["tmux", ["-V"]], ["pi", ["--version"]], ["gh", ["auth", "status"]], ["git", ["--version"]], ["npm", ["--version"]]]) {
    const result = commandResult(command, args);
    if (result.status !== 0) fail(`Required command is unavailable or not configured: ${command}`);
  }
  const dirty = commandOutput("git", ["status", "--porcelain"]);
  if (dirty) fail("Refusing to start from a dirty control checkout. Commit and push the frontier-loop files and any planning docs first.");
  const branch = defaultBranch();
  commandOutput("git", ["fetch", "origin", branch]);
  let localHead = commandOutput("git", ["rev-parse", "HEAD"]);
  const remoteHead = commandOutput("git", ["rev-parse", `origin/${branch}`]);
  if (localHead !== remoteHead) {
    const canFastForward = commandResult("git", ["merge-base", "--is-ancestor", localHead, remoteHead]).status === 0;
    if (!canFastForward) fail(`Control checkout must be pushed or safely fast-forwardable to origin/${branch} before starting the autonomous merge loop.`);
    commandOutput("git", ["merge", "--ff-only", `origin/${branch}`]);
    localHead = commandOutput("git", ["rev-parse", "HEAD"]);
  }
  if (localHead !== remoteHead) fail(`Control checkout HEAD does not match origin/${branch} after fast-forward.`);
}

function tmuxSessionExists(parent) {
  return commandResult("tmux", ["has-session", "-t", sessionName(parent)]).status === 0;
}

function tmuxAlive(parent) {
  if (!tmuxSessionExists(parent)) return false;
  const result = commandResult("tmux", ["list-panes", "-t", sessionName(parent), "-F", "#{pane_dead}"]);
  return result.status === 0 && panesAreRunning(result.stdout.trim().split("\n").filter(Boolean));
}

function start(parent) {
  ensurePrerequisites();
  if (tmuxAlive(parent)) fail(`tmux session ${sessionName(parent)} is already running`);
  if (tmuxSessionExists(parent)) commandResult("tmux", ["kill-session", "-t", sessionName(parent)]);
  const paths = loopPaths(parent);
  mkdirSync(paths.worktrees, { recursive: true });
  rmSync(paths.stop, { force: true });
  const script = fileURLToPath(import.meta.url);
  const command = `exec ${shellQuote(process.execPath)} ${shellQuote(script)} supervise --parent ${parent}`;
  commandOutput("tmux", ["new-session", "-d", "-s", sessionName(parent), "-c", repositoryRoot, command]);
  commandOutput("tmux", ["set-option", "-t", sessionName(parent), "remain-on-exit", "on"]);
  commandOutput("tmux", ["pipe-pane", "-o", "-t", sessionName(parent), `cat >> ${shellQuote(paths.runnerLog)}`]);
  process.stdout.write(`Started ${sessionName(parent)}.\n`);
  process.stdout.write(`Check progress with: npm run frontier:status\n`);
  process.stdout.write(`Watch live with:      npm run frontier:attach\n`);
}

function issueOpen(number) {
  return commandOutput("gh", ["issue", "view", String(number), "--json", "state", "--jq", ".state"]) === "OPEN";
}

function removeWorktree(worktree, branch) {
  if (worktree && existsSync(worktree)) commandOutput("git", ["worktree", "remove", "--force", worktree]);
  if (branch) commandResult("git", ["branch", "-D", branch]);
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

function remediationPrompt(issue, reasonLog) {
  return `/skill:implement Continue implementing GitHub issue #${issue.number} on the current branch. An independent validation pass failed; inspect ${reasonLog}, the complete issue and comments, parent spec, existing commits, and any uncommitted work. Reproduce every finding at the narrowest agreed seam, fix its root cause, rerun focused and full validation, invoke code review, and commit the corrections. Prefer deleting accidental complexity over adding flags, callbacks, state, or compatibility layers. Work autonomously. Do not push, create or merge a PR, or close the issue; the tmux orchestrator owns those steps.`;
}

function implementationPrompt(issue, resumed) {
  const action = resumed ? "Continue and finish" : "Implement";
  return `/skill:implement ${action} GitHub issue #${issue.number} (${issue.title}) on the current branch. Read the complete issue and comments, any parent spec, repository instructions, glossary, and relevant ADRs. Treat the issue acceptance criteria as the implementation boundary; parent constraints remain authoritative and open siblings remain deferred. Use TDD where possible at the agreed public-process seam. Keep MDLM lifecycle-neutral and modules deep; simplify before allowing implementation complexity to fan out. Claiming has already been handled. Run focused checks regularly and the full suite at the end, invoke code review, and commit all work with issue #${issue.number} in the commit message. Do not push, create or merge a PR, or close the issue; the tmux orchestrator owns those steps.`;
}

function diagnosisPrompt(issue, reasonLog) {
  return `/skill:implement Diagnose and fix the repeatedly failing implementation of GitHub issue #${issue.number} (${issue.title}) on the current branch. Explicitly use the diagnosing-bugs method. The latest failed command validation, explicit VALIDATION: FAIL, or remote PR check in ${reasonLog} is the red-capable signal; inspect failed Actions logs when applicable and reproduce each finding before changing code. Read the complete issue/comments, any parent spec, instructions, glossary, ADRs, branch commits, and validation history. Generate ranked falsifiable hypotheses, then proceed autonomously through regression tests, root-cause repair, cleanup, focused checks, the full suite, and code review. Revert or redesign earlier work rather than layering patches. Preserve the user-visible contract and sibling boundaries. Commit every completed fix with issue #${issue.number}. Do not push, create or merge a PR, or close issues; the tmux orchestrator owns those steps.`;
}

function simplificationPrompt(issue, reasonLog, reasons) {
  const trigger = reasons.length > 0 ? reasons.join("; ") : "independent review found disproportionate complexity";
  return `/skill:implement Simplify and finish GitHub issue #${issue.number} (${issue.title}) on the current branch. Explicitly apply the codebase-design and grilling skills before editing. Complexity escalation was triggered by: ${trigger}. Inspect ${reasonLog}, the complete issue/comments and parent constraints, and the entire diff. Preserve every user-visible invariant and acceptance outcome while deleting accidental machinery, speculative generality, workflow state, recovery knobs, duplicated logic, or shallow interfaces. Prefer a smaller deep module and the existing public test seam. Revert or replace prior work when that is cleaner. Then run focused checks, the full suite, code review, and commit the simplification with issue #${issue.number}. Do not push, open/merge a PR, or close issues.`;
}

function contractReviewPrompt(issue, reasonLog) {
  return `/skill:implement Resolve a repeated complexity deadlock for GitHub issue #${issue.number} (${issue.title}) and finish it autonomously. Explicitly apply grilling, codebase-design, and diagnosing-bugs. Read ${reasonLog}, the complete issue/comments, parent spec, glossary, ADRs, and full branch history. First try to replace the implementation with a substantially simpler design that preserves the written contract. If and only if a criterion itself forces unbounded analysis, a generic workflow engine, cross-owner atomicity, or similarly disproportionate machinery, choose the smallest user-goal-preserving contract clarification. Never waive atomic publication, one canonical writer, package neutrality, harness neutrality, independent judgment, tests, or review. Record any clarification as an auditable GitHub comment on the active issue naming retained behavior, intentionally given-up behavior, and why the simpler contract still satisfies the parent goal; do not rewrite history or close issues. Implement that clarified contract, add regression evidence, run focused and full checks, invoke code review, and commit all work with issue #${issue.number}. Do not push or create/merge a PR.`;
}

function executeAgentAction(issue, prepared, issueLog, paths, state, action) {
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
    phase: action.kind,
    pendingAction: action,
    message: `${action.resumed ? "Resuming" : "Running"} ${description} for #${issue.number}`,
    validatedHead: null,
  });
  log(state.message);
  let prompt;
  if (action.kind === "implementation") prompt = implementationPrompt(issue, prepared.resumed || action.resumed);
  else if (action.kind === "remediation") prompt = remediationPrompt(issue, issueLog);
  else if (action.kind === "diagnosis") prompt = diagnosisPrompt(issue, issueLog);
  else if (action.kind === "simplification") prompt = simplificationPrompt(issue, issueLog, action.reasons ?? []);
  else prompt = contractReviewPrompt(issue, issueLog);
  agentRunner.runImplementation(prepared.worktree, prompt, issueLog, `${action.resumed ? "resumed " : ""}${description}`);
  return writeState(paths, state, { pendingAction: null });
}

function waitForPullRequestChecks(prNumber, worktree, logPath) {
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

function pullRequestHead(prNumber, worktree) {
  return commandOutput("gh", ["pr", "view", String(prNumber), "--json", "headRefOid", "--jq", ".headRefOid"], { cwd: worktree });
}

function waitForMergedPullRequest(prNumber, worktree, logPath) {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    const detail = commandJson("gh", ["pr", "view", String(prNumber), "--json", "state,mergeCommit"], { cwd: worktree });
    if (detail?.state === "MERGED") {
      appendAgentLog(logPath, "merge confirmation", `PR #${prNumber} merged as ${detail.mergeCommit?.oid ?? "unknown"}.\n`);
      return;
    }
    sleep(10_000);
  }
  fail(`PR #${prNumber} did not reach confirmed MERGED state; publication will resume without closing the issue`);
}

function publishAndMerge(issue, worktree, branch, logPath, validatedHead) {
  const base = defaultBranch();
  const localHead = commandOutput("git", ["rev-parse", "HEAD"], { cwd: worktree });
  if (localHead !== validatedHead) fail(`Local head changed after validation for #${issue.number}`);
  commandOutput("git", ["push", "--set-upstream", "origin", branch], { cwd: worktree });
  const existing = commandJson("gh", ["pr", "list", "--head", branch, "--state", "open", "--json", "number,url"], { cwd: worktree }) ?? [];
  let url;
  let prNumber;
  if (existing.length > 0) {
    ({ number: prNumber, url } = existing[0]);
  } else {
    const body = `Closes #${issue.number}\n\nImplemented and independently validated by the MDLM frontier loop.`;
    url = commandOutput("gh", ["pr", "create", "--base", base, "--head", branch, "--title", issue.title, "--body", body], { cwd: worktree });
    prNumber = parsePullRequestNumber(url);
  }
  appendAgentLog(logPath, "pull request", `${url}\n`);
  if (pullRequestHead(prNumber, worktree) !== validatedHead) fail(`Remote PR #${prNumber} does not point at validated commit ${validatedHead}`);
  waitForPullRequestChecks(prNumber, worktree, logPath);
  if (pullRequestHead(prNumber, worktree) !== validatedHead) fail(`Remote PR #${prNumber} changed after validation`);
  commandOutput("gh", ["pr", "merge", String(prNumber), "--merge", "--match-head-commit", validatedHead], { cwd: worktree });
  waitForMergedPullRequest(prNumber, worktree, logPath);
  commandResult("git", ["push", "origin", "--delete", branch], { cwd: worktree });
  for (let attempt = 0; attempt < 15 && issueOpen(issue.number); attempt += 1) sleep(2_000);
  if (issueOpen(issue.number)) {
    commandOutput("gh", ["issue", "close", String(issue.number), "--comment", `Implemented and merged in PR #${prNumber}.`]);
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
    commandsValidatedHead: null,
    pendingAction: null,
    validatedHead: null,
    lastError: null,
  };
}

function mergeValidatedIssue(issue, paths, state, prepared, issueLog) {
  const head = commandOutput("git", ["rev-parse", "HEAD"], { cwd: prepared.worktree });
  if (!validatedHeadMatches(state, head)) fail(`Validated branch changed before publication for #${issue.number}`);
  state = writeState(paths, state, { phase: "merging", message: `Publishing and merging #${issue.number}` });
  log(state.message);
  const prNumber = publishAndMerge(issue, prepared.worktree, prepared.branch, issueLog, head);
  state = writeState(paths, state, { pullRequest: prNumber, message: `Merged #${issue.number} in PR #${prNumber}` });
  log(state.message);
  removeWorktree(prepared.worktree, prepared.branch);
  return writeState(paths, state, betweenTicketsPatch());
}

function reconcileClosedCurrentIssue(plan, paths, state) {
  if (!state.currentIssue) return state;
  const current = [...plan.children, ...plan.backlog].find((issue) => issue.number === state.currentIssue);
  if (current?.state !== "CLOSED") return state;
  if (state.worktree && existsSync(state.worktree)) {
    const merged = commandJson("gh", ["pr", "list", "--head", state.branch, "--state", "merged", "--json", "number"] , { cwd: state.worktree }) ?? [];
    if (merged.length === 0) fail(`Issue #${state.currentIssue} closed without a confirmed merged PR; preserving ${state.worktree}`);
    const dirty = commandOutput("git", ["status", "--porcelain"], { cwd: state.worktree });
    if (dirty) fail(`Closed issue #${state.currentIssue} has a dirty preserved worktree: ${state.worktree}`);
    removeWorktree(state.worktree, state.branch);
  }
  log(`Reconciled confirmed merged issue #${state.currentIssue} after interrupted cleanup`);
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
  let commandsValidatedHead = continuingIssue ? state.commandsValidatedHead ?? null : null;
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
    pullRequest: null,
    pendingAction,
    remediationUsed,
    diagnosticEscalations,
    designEscalations,
    contractReviews,
    complexityReviewedHead,
    commandsValidatedHead,
    validatedHead: resumeValidated ? currentHead : null,
    lastError: null,
  });
  const login = viewerLogin();
  if (!issue.assignees.some((assignee) => assignee.login === login)) {
    commandOutput("gh", ["issue", "edit", String(issue.number), "--add-assignee", "@me"]);
  }
  log(state.message);
  if (resumeValidated) return mergeValidatedIssue(issue, paths, state, prepared, issueLog);
  state = executeAgentAction(
    issue,
    prepared,
    issueLog,
    paths,
    state,
    pendingAction ? { ...pendingAction, resumed: true } : { kind: "implementation" },
  );

  while (true) {
    const headBeforeValidation = commandOutput("git", ["rev-parse", "HEAD"], { cwd: prepared.worktree });
    const complexityReasons = agentRunner.complexityReasons(prepared.worktree, defaultBranch());
    if (complexityReasons.length > 0 && complexityReviewedHead !== headBeforeValidation && designEscalations < maximumDesignEscalations) {
      designEscalations += 1;
      state = writeState(paths, state, { designEscalations });
      state = executeAgentAction(issue, prepared, issueLog, paths, state, { kind: "simplification", reasons: complexityReasons });
      complexityReviewedHead = commandOutput("git", ["rev-parse", "HEAD"], { cwd: prepared.worktree });
      state = writeState(paths, state, { complexityReviewedHead });
      continue;
    }

    state = writeState(paths, state, {
      phase: "validating",
      pendingAction: null,
      remediationUsed,
      diagnosticEscalations,
      designEscalations,
      contractReviews,
      complexityReviewedHead,
      commandsValidatedHead,
      message: `Validating #${issue.number} (remediation ${remediationUsed ? "used" : "available"}, diagnostics ${diagnosticEscalations}/${maximumDiagnosticEscalations}, simplifications ${designEscalations}/${maximumDesignEscalations}, contract reviews ${contractReviews})`,
    });
    log(state.message);
    const commitCount = Number(commandOutput("git", ["rev-list", "--count", `origin/${defaultBranch()}..HEAD`], { cwd: prepared.worktree }));
    const clean = commandOutput("git", ["status", "--porcelain"], { cwd: prepared.worktree }) === "";
    let commandsPass = commitCount > 0 && clean && commandsValidatedHead === headBeforeValidation;
    if (!commandsPass && commitCount > 0 && clean) {
      commandsPass = agentRunner.validate(prepared.worktree, issueLog, defaultBranch());
      commandsValidatedHead = commandsPass ? headBeforeValidation : null;
      state = writeState(paths, state, { commandsValidatedHead });
    }
    const review = commandsPass ? agentRunner.review(issue, prepared.worktree, issueLog, defaultBranch()) : { retry: false, passed: false, simplify: false };
    if (commandsPass && review.retry) {
      state = writeState(paths, state, {
        phase: "retrying-review",
        message: `Reviewer/provider did not return a valid verdict for #${issue.number}; retrying without rerunning validated commands or changing product code`,
      });
      log(state.message);
      sleep(30_000);
      continue;
    }
    if (commandsPass && review.passed && !review.simplify) {
      const validatedHead = commandOutput("git", ["rev-parse", "HEAD"], { cwd: prepared.worktree });
      state = writeState(paths, state, { validatedHead });
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
      state = writeState(paths, state, { remediationUsed });
      state = executeAgentAction(issue, prepared, issueLog, paths, state, { kind: "remediation" });
      continue;
    }

    if (action === "diagnose") {
      diagnosticEscalations += 1;
      state = writeState(paths, state, { diagnosticEscalations });
      state = executeAgentAction(issue, prepared, issueLog, paths, state, { kind: "diagnosis" });
      continue;
    }

    if (action === "simplify") {
      designEscalations += 1;
      state = writeState(paths, state, { designEscalations });
      state = executeAgentAction(issue, prepared, issueLog, paths, state, { kind: "simplification", reasons: complexityReasons });
      complexityReviewedHead = commandOutput("git", ["rev-parse", "HEAD"], { cwd: prepared.worktree });
      state = writeState(paths, state, { complexityReviewedHead });
      continue;
    }

    contractReviews += 1;
    remediationUsed = false;
    diagnosticEscalations = 0;
    designEscalations = 0;
    complexityReviewedHead = null;
    state = writeState(paths, state, {
      remediationUsed,
      diagnosticEscalations,
      designEscalations,
      contractReviews,
      complexityReviewedHead,
    });
    state = executeAgentAction(issue, prepared, issueLog, paths, state, { kind: "contract-review" });
  }
}

function stopped(paths) {
  return existsSync(paths.stop);
}

function runLoop(parent) {
  const paths = loopPaths(parent);
  mkdirSync(paths.worktrees, { recursive: true });
  let state = readState(paths) ?? writeState(paths, {}, {
    schemaVersion: 2,
    parentIssue: parent,
    session: sessionName(parent),
    phase: "starting",
    message: "Starting frontier loop",
    startedAt: isoNow(),
    currentIssue: null,
  });
  try {
    if (!Array.isArray(state.priorityIssueNumbers) || !Array.isArray(state.backlogIssueNumbers)) {
      const summaries = allIssueSummaries();
      const priorityIssueNumbers = priorityIssueSnapshot(parent, summaries);
      if (priorityIssueNumbers.length === 0) fail(`Parent #${parent} has no discoverable implementation children; refusing to snapshot an empty priority map`);
      const prioritySummaries = selectSnapshottedIssues(priorityIssueNumbers, summaries);
      const backlogIssueNumbers = selectOlderReadyBacklog(parent, summaries, prioritySummaries).map((issue) => issue.number).sort((left, right) => left - right);
      state = writeState(paths, state, {
        priorityIssueNumbers,
        backlogIssueNumbers,
        message: `Snapshotted ${priorityIssueNumbers.length} priority-map and ${backlogIssueNumbers.length} older backlog tickets`,
      });
      log(state.message);
    }
    while (!stopped(paths)) {
      try {
        const plan = deliveryPlan(parent, state.priorityIssueNumbers, state.backlogIssueNumbers);
        state = reconcileClosedCurrentIssue(plan, paths, state);
        if (plan.primaryOpen.length === 0 && plan.backlog.every((issue) => issue.state === "CLOSED")) {
          state = writeState(paths, state, {
            phase: "complete",
            message: `All ${plan.children.length} priority-map tickets and all older ready backlog tickets are closed`,
            completedAt: isoNow(),
            lastError: null,
          });
          log(state.message);
          return;
        }
        let issue;
        if (state.currentIssue && state.worktree && existsSync(state.worktree)) {
          issue = plan.pool.find((candidate) => candidate.number === state.currentIssue && candidate.state === "OPEN");
        }
        issue ??= plan.next;
        if (!issue) {
          state = writeState(paths, state, { phase: "waiting", message: `${plan.open.length} ${plan.scope} tickets remain, but no unassigned item is available` });
          log(`${state.message}; polling again in ${defaultPollSeconds}s`);
          sleep(defaultPollSeconds * 1_000);
          continue;
        }
        state = processIssue(issue, paths, state);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (isRemoteValidationFailure(error) && !stopped(paths)) {
          state = failureBaseState(state, readState(paths));
          const diagnosticEscalations = state.diagnosticEscalations ?? 0;
          if (diagnosticEscalations < maximumDiagnosticEscalations) {
            state = writeState(paths, state, {
              phase: "failed",
              diagnosticEscalations: diagnosticEscalations + 1,
              pendingAction: { kind: "diagnosis" },
              message: "Remote validation failed; scheduling an independent diagnostic instance",
              validatedHead: null,
              lastError: message,
            });
          } else {
            state = writeState(paths, state, {
              phase: "failed",
              remediationUsed: false,
              diagnosticEscalations: 0,
              designEscalations: 0,
              contractReviews: (state.contractReviews ?? 0) + 1,
              complexityReviewedHead: null,
              pendingAction: { kind: "contract-review" },
              message: "Remote validation exhausted diagnosis; scheduling autonomous contract review",
              validatedHead: null,
              lastError: message,
            });
          }
          log(`${state.message}: ${message}`);
          continue;
        }
        if (!isTransientInfrastructureFailure(error) || stopped(paths)) throw error;
        state = failureBaseState(state, readState(paths));
        state = writeState(paths, state, {
          phase: "retrying-infrastructure",
          message: "Transient infrastructure failure; retrying automatically in 30 seconds",
          lastError: message,
        });
        log(`${state.message}: ${message}`);
        sleep(30_000);
      }
    }
    state = writeState(paths, state, { phase: "stopped", message: "Stopped by request" });
    log(state.message);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const phase = stopped(paths) ? "stopped" : "failed";
    state = failureBaseState(state, readState(paths));
    state = writeState(paths, state, { phase, message: phase === "stopped" ? "Stopped by request" : "Frontier loop stopped on failure", lastError: message });
    log(`${state.message}: ${message}`);
    process.exitCode = phase === "failed" ? 1 : 0;
  }
}

function supervise(parent) {
  const paths = loopPaths(parent);
  let restarts = readState(paths)?.supervisorRestarts ?? 0;
  while (!stopped(paths)) {
    const script = fileURLToPath(import.meta.url);
    const result = spawnSync(process.execPath, [script, "run", "--parent", String(parent)], {
      cwd: repositoryRoot,
      env: process.env,
      stdio: "inherit",
    });
    const state = readState(paths);
    if (stopped(paths) || state?.phase === "complete") return;
    restarts += 1;
    writeState(paths, state ?? {}, {
      phase: "supervisor-restarting",
      supervisorRestarts: restarts,
      message: `Supervisor restarting the autonomous loop in 30 seconds after exit ${result.status ?? "unknown"}`,
      lastError: state?.lastError ?? result.error?.message ?? `runner exited ${result.status ?? "unknown"}`,
    });
    log(`Supervisor restart ${restarts}; preserved worktree and state`);
    sleep(30_000);
  }
}

function tail(path, count) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").trimEnd().split("\n").slice(-count);
}

function status(parent) {
  const paths = loopPaths(parent);
  const state = readState(paths);
  const alive = tmuxAlive(parent);
  process.stdout.write(`Frontier loop: ${alive ? "running" : "not running"}\n`);
  process.stdout.write(`Session:       ${sessionName(parent)}\n`);
  process.stdout.write(`Parent:        #${parent}\n`);
  if (state) {
    process.stdout.write(`Phase:         ${state.phase}\n`);
    process.stdout.write(`Message:       ${state.message ?? "-"}\n`);
    if (state.currentIssue) process.stdout.write(`Current:       #${state.currentIssue} ${state.currentIssueTitle ?? ""}\n`);
    if (state.pendingAction) process.stdout.write(`Pending:       ${state.pendingAction.kind}\n`);
    let pullRequest = state.pullRequest;
    if (!pullRequest && state.branch) {
      try {
        const open = commandJson("gh", ["pr", "list", "--head", state.branch, "--state", "open", "--json", "number"]) ?? [];
        pullRequest = open[0]?.number;
      } catch {
        // The rest of status remains useful when PR lookup is unavailable.
      }
    }
    if (pullRequest) process.stdout.write(`Pull request:  #${pullRequest}\n`);
    if (state.worktree) process.stdout.write(`Worktree:      ${state.worktree}\n`);
    if (state.issueLog) process.stdout.write(`Issue log:     ${state.issueLog}\n`);
    if (state.diagnosticEscalations || state.designEscalations || state.contractReviews) {
      process.stdout.write(`Escalations:   diagnostic=${state.diagnosticEscalations ?? 0}, design=${state.designEscalations ?? 0}, contract=${state.contractReviews ?? 0}\n`);
    }
    if (state.supervisorRestarts) process.stdout.write(`Restarts:      ${state.supervisorRestarts}\n`);
    if (state.lastError) process.stdout.write(`Last error:    ${state.lastError}\n`);
    process.stdout.write(`Updated:       ${state.updatedAt}\n`);
  } else {
    process.stdout.write("Phase:         never started\n");
  }
  try {
    const plan = deliveryPlan(parent, state?.priorityIssueNumbers ?? null, state?.backlogIssueNumbers ?? null);
    const closed = plan.children.filter((issue) => issue.state === "CLOSED").length;
    process.stdout.write(`Priority map:  ${closed}/${plan.children.length} tickets closed\n`);
    const backlogOpen = plan.backlog.filter((issue) => issue.state === "OPEN").length;
    process.stdout.write(`Older backlog: ${backlogOpen}/${plan.backlog.length} snapshotted ticket(s) open\n`);
    process.stdout.write(`Next item:     ${plan.next ? `#${plan.next.number} ${plan.next.title}` : "none"}\n`);
  } catch (error) {
    process.stdout.write(`GitHub status: unavailable (${error instanceof Error ? error.message : String(error)})\n`);
  }
  const lines = state?.issueLog ? tail(state.issueLog, 12) : tail(paths.runnerLog, 12);
  if (lines.length > 0) process.stdout.write(`\nRecent log:\n${lines.join("\n")}\n`);
}

function watch(parent) {
  while (true) {
    process.stdout.write(`\n===== ${isoNow()} =====\n`);
    status(parent);
    sleep(30_000);
  }
}

function health(parent) {
  const paths = loopPaths(parent);
  const state = readState(paths);
  const healthy = state?.phase === "complete" || tmuxAlive(parent);
  process.stdout.write(`${healthy ? "healthy" : "unhealthy"}: ${state?.phase ?? "never-started"}\n`);
  if (!healthy) process.exitCode = 1;
}

function attach(parent) {
  if (!tmuxAlive(parent)) fail(`tmux session ${sessionName(parent)} is not running`);
  const result = spawnSync("tmux", ["attach-session", "-t", sessionName(parent)], { stdio: "inherit" });
  if (result.error || result.status !== 0) process.exitCode = result.status ?? 1;
}

function stop(parent) {
  const paths = loopPaths(parent);
  mkdirSync(paths.root, { recursive: true });
  writeFileSync(paths.stop, `${isoNow()}\n`);
  if (!tmuxAlive(parent)) {
    if (tmuxSessionExists(parent)) commandResult("tmux", ["kill-session", "-t", sessionName(parent)]);
    process.stdout.write("Frontier loop is not running. Stop marker recorded.\n");
    return;
  }
  commandResult("tmux", ["send-keys", "-t", sessionName(parent), "C-c"]);
  sleep(2_000);
  if (tmuxSessionExists(parent)) commandResult("tmux", ["kill-session", "-t", sessionName(parent)]);
  process.stdout.write("Frontier loop stopped.\n");
}

function parseArguments(argv) {
  const command = argv[0];
  let parent = Number(process.env.MDLM_FRONTIER_PARENT ?? defaultParent);
  for (let index = 1; index < argv.length; index += 1) {
    if (argv[index] === "--parent") {
      parent = Number(argv[index + 1]);
      index += 1;
    } else fail(`Unknown argument: ${argv[index]}`);
  }
  if (!Number.isSafeInteger(parent) || parent <= 0) fail("Parent issue must be a positive integer");
  return { command, parent };
}

function usage() {
  process.stdout.write("Usage: node scripts/frontier-loop.mjs start|supervise|run|status|watch|health|attach|stop [--parent ISSUE]\n");
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    const { command, parent } = parseArguments(process.argv.slice(2));
    if (command === "start") start(parent);
    else if (command === "supervise") supervise(parent);
    else if (command === "run") runLoop(parent);
    else if (command === "status") status(parent);
    else if (command === "watch") watch(parent);
    else if (command === "health") health(parent);
    else if (command === "attach") attach(parent);
    else if (command === "stop") stop(parent);
    else {
      usage();
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`frontier-loop: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
