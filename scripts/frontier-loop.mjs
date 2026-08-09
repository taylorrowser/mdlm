#!/usr/bin/env node

import { spawnSync } from "node:child_process";
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
  failureBaseState,
  isPublicationRetryFailure,
  isRemoteValidationFailure,
  isTransientInfrastructureFailure,
  panesAreRunning,
  validationFailureAction,
} from "./frontier-loop-core.mjs";
import {
  bodyBlockedByNumbers,
  bodyReferencesParent,
  findFrontier,
  findReadyItem,
  normalizeNativeBlockers,
  priorityIssueSnapshot,
  selectOlderReadyBacklog,
  selectSnapshottedIssues,
} from "./frontier-issue-contract.mjs";
import { createTicketRunner } from "./frontier-ticket-runner.mjs";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const defaultParent = 83;
const defaultPollSeconds = 60;
const maximumDiagnosticEscalations = 2;
const maximumDesignEscalations = 2;
const maximumAgentInfrastructureAttempts = 4;
const defaultMaximumChangedFiles = 24;
const defaultMaximumChangedLines = 1_800;
const defaultMaximumLifecycleModules = 12;
const ticketRunner = createTicketRunner({
  repositoryRoot,
  writeState,
  log,
  defaultBranch,
  maximumDiagnosticEscalations,
  maximumDesignEscalations,
  maximumAgentInfrastructureAttempts,
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
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
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
  const nativeBlockers = normalizeNativeBlockers(detail.blockedBy);
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


function stopped(paths) {
  return existsSync(paths.stop);
}

function runLoop(parent) {
  const paths = loopPaths(parent);
  mkdirSync(paths.worktrees, { recursive: true });
  let state = readState(paths) ?? writeState(paths, {}, {
    schemaVersion: 3,
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
        state = ticketRunner.reconcileClosedCurrentIssue(plan, paths, state);
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
        state = ticketRunner.processIssue(issue, paths, state);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (isRemoteValidationFailure(error) && !stopped(paths)) {
          state = failureBaseState(state, readState(paths));
          let remediationUsed = state.remediationUsed ?? false;
          let diagnosticEscalations = state.diagnosticEscalations ?? 0;
          let designEscalations = state.designEscalations ?? 0;
          let contractReviews = state.contractReviews ?? 0;
          const action = validationFailureAction({
            remediationUsed,
            diagnosticEscalations,
            maximumDiagnosticEscalations,
            designEscalations,
            maximumDesignEscalations,
          });
          let pendingAction;
          if (action === "remediate") {
            remediationUsed = true;
            pendingAction = { kind: "remediation" };
          } else if (action === "diagnose") {
            diagnosticEscalations += 1;
            pendingAction = { kind: "diagnosis" };
          } else if (action === "simplify") {
            designEscalations += 1;
            pendingAction = { kind: "simplification", reasons: [message] };
          } else {
            remediationUsed = false;
            diagnosticEscalations = 0;
            designEscalations = 0;
            contractReviews += 1;
            pendingAction = { kind: "contract-review" };
          }
          state = writeState(paths, state, {
            phase: "failed",
            remediationUsed,
            diagnosticEscalations,
            designEscalations,
            contractReviews,
            complexityReviewedHead: action === "contract-review" ? null : state.complexityReviewedHead,
            pendingAction,
            message: `Remote validation failed; scheduling ${pendingAction.kind}`,
            validatedHead: null,
            lastError: message,
          });
          log(`${state.message}: ${message}`);
          continue;
        }
        if (isPublicationRetryFailure(error) && !stopped(paths)) {
          state = failureBaseState(state, readState(paths));
          state = writeState(paths, state, {
            phase: "retrying-publication",
            message: "Publication state is not yet confirmable; retrying without changing code in 30 seconds",
            lastError: message,
          });
          log(`${state.message}: ${message}`);
          sleep(30_000);
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
    if (state.branch) process.stdout.write(`Branch:        ${state.branch}\n`);
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
