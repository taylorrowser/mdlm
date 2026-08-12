import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { commandResult } from "./frontier-command.mjs";
import {
  AgentProcessTimeoutError,
  createAgentRunner,
  formatIssueReviewEvidence,
  frontierModel,
  frontierThinkingLevel,
  issueReviewEvidenceArguments,
  piAgentArguments,
  validationCommands,
  validationCommandWasInterrupted,
} from "./frontier-agent-runner.mjs";
import { failureFingerprint, recordFailureFingerprint } from "./frontier-failure-evidence.mjs";
import {
  actionProgressed,
  agentTimeoutTransition,
  complexityReasonsFromStats,
  failureBaseState,
  failureEvidenceMatches,
  isPublicationRetryFailure,
  isRemoteValidationFailure,
  isTransientAgentFailure,
  isTransientInfrastructureFailure,
  mergedPullRequestMatchesValidatedHead,
  migrateFrontierState,
  panesAreRunning,
  parsePullRequestNumber,
  publicationReconciliationAllowed,
  reviewHasComplexityVerdict,
  reviewedVerdictAt,
  reviewerVerdict,
  reviewRequestsSimplification,
  resumesAtValidation,
  scheduleFailureAction,
  supervisorRecognizesTerminalPhase,
  validatedHeadMatches,
  validationFailureAction,
  validationHasVerdict,
  validationPassed,
} from "./frontier-loop-core.mjs";
import {
  bodyBlockedByNumbers,
  bodyReferencesParent,
  findFrontier,
  findReadyItem,
  fixedIdentitiesAreClosed,
  normalizeNativeBlockers,
  priorityIssueSnapshot,
  referencedParentNumber,
  selectFixedScopeCandidate,
  selectOlderReadyBacklog,
  selectSnapshottedIssues,
} from "./frontier-issue-contract.mjs";
import { createMaintenanceController, maintenanceBoundaryIsSafe } from "./frontier-maintenance.mjs";
import { runInProcessGroup } from "./frontier-process-group.mjs";
import { editingAgentPrompt, independentReviewerPrompt } from "./frontier-prompts.mjs";
import {
  createTicketRunner,
  publishQuarantineCommentOnce,
  quarantineIssueComment,
  quarantineIssueRecord,
} from "./frontier-ticket-runner.mjs";
import { sleep } from "./frontier-time.mjs";

function issue(number, { state = "OPEN", assignees = [], blockedBy = [] } = {}) {
  return { number, title: `Issue ${number}`, state, assignees, blockedBy };
}

test("frontier selects the first open unassigned issue whose blockers are closed", () => {
  const issues = [
    issue(44, { blockedBy: [{ number: 43, state: "OPEN" }] }),
    issue(43, { assignees: [{ login: "worker" }] }),
    issue(42, { blockedBy: [{ number: 41, state: "CLOSED" }] }),
    issue(41, { state: "CLOSED" }),
  ];

  assert.equal(findFrontier(issues)?.number, 42);
});

test("frontier is absent when every remaining issue is assigned or blocked", () => {
  const issues = [
    issue(41, { assignees: [{ login: "worker" }] }),
    issue(42, { blockedBy: [{ number: 41, state: "OPEN" }] }),
  ];

  assert.equal(findFrontier(issues), undefined);
});

test("completion requires every fixed identity to be observed closed", () => {
  assert.equal(fixedIdentitiesAreClosed([84, 85], [issue(84, { state: "CLOSED" }), issue(85, { state: "CLOSED" })]), true);
  assert.equal(fixedIdentitiesAreClosed([84, 85], [issue(84, { state: "CLOSED" })]), false);
  assert.equal(fixedIdentitiesAreClosed([84], [issue(84)]), false);
});

test("the priority-map snapshot cannot absorb future children", () => {
  const initial = [
    { number: 84, body: "## Parent\n\n#83" },
    { number: 85, body: "## Parent\n\n#83" },
  ];
  const snapshot = priorityIssueSnapshot(83, initial);
  const later = [
    { ...initial[0], labels: [] },
    initial[1],
    { number: 105, body: "## Parent\n\n#83" },
  ];
  assert.deepEqual(snapshot, [84, 85]);
  assert.deepEqual(selectSnapshottedIssues(snapshot, later).map((candidate) => candidate.number), [84, 85]);
});

test("older backlog selection is separate and cannot absorb future work", () => {
  const summaries = [
    { number: 70, state: "OPEN", labels: [{ name: "ready-for-agent" }] },
    { number: 80, state: "OPEN", labels: [{ name: "ready-for-agent" }] },
    { number: 105, state: "OPEN", labels: [{ name: "ready-for-agent" }] },
    { number: 69, state: "CLOSED", labels: [{ name: "ready-for-agent" }] },
  ];
  const selected = selectOlderReadyBacklog(83, summaries, [{ number: 80 }]);
  assert.deepEqual(selected.map((candidate) => candidate.number), [70]);
  assert.equal(findReadyItem([issue(71), issue(70)])?.number, 70);
});

test("quarantined tickets are never reserved but remain open dependency blockers", () => {
  const issues = [
    issue(84),
    issue(85, { blockedBy: [{ number: 84, state: "OPEN" }] }),
    issue(86),
  ];
  assert.equal(findReadyItem(issues, { excludedIssueNumbers: [84] })?.number, 86);
  assert.equal(findReadyItem(issues.slice(0, 2), { excludedIssueNumbers: [84] }), undefined);
});

test("a blocked priority map may fall through to independently ready snapshotted backlog", () => {
  const priority = [issue(84, { blockedBy: [{ number: 83, state: "OPEN" }] })];
  const backlog = [issue(70), issue(71)];
  assert.deepEqual(selectFixedScopeCandidate(priority, backlog), {
    issue: backlog[0],
    scope: "older ready backlog",
  });
});

test("fixed-scope selection preserves priority and serial order while excluding quarantines", () => {
  const priority = [issue(86), issue(84), issue(85)];
  const backlog = [issue(70)];
  assert.equal(selectFixedScopeCandidate(priority, backlog).issue.number, 84);
  assert.equal(selectFixedScopeCandidate(priority, backlog, { excludedIssueNumbers: [84] }).issue.number, 85);
});

test("native blocker collections accept the installed and array JSON shapes", () => {
  const blocker = { number: 84, state: "OPEN" };
  assert.deepEqual(normalizeNativeBlockers({ nodes: [blocker] }), [blocker]);
  assert.deepEqual(normalizeNativeBlockers([blocker]), [blocker]);
  assert.deepEqual(normalizeNativeBlockers(undefined), []);
});

test("fallback blocking dependencies are parsed only from their explicit section", () => {
  assert.deepEqual(bodyBlockedByNumbers("## Blocked by\n\n- #84\n- https://github.com/taylorrowser/mdlm/issues/85\n\n## Notes\n#99"), [84, 85]);
  assert.deepEqual(bodyBlockedByNumbers("## Blocked by\n\nNone — can start immediately."), []);
});

test("body parent discovery reads only the explicit Parent section", () => {
  assert.equal(bodyReferencesParent("## Parent\n\n[Spec](https://github.com/taylorrowser/mdlm/issues/83)\n\n## What to build\nX", 83), true);
  assert.equal(bodyReferencesParent("## Parent\n\n- #83\n\n## What to build\nX", 83), true);
  assert.equal(bodyReferencesParent("## Further Notes\n\nSee https://github.com/taylorrowser/mdlm/issues/83", 83), false);
  const oldParent = "## Parent\n\n- #57\n\n## Notes\nSee #83";
  assert.equal(bodyReferencesParent(oldParent, 83), false);
  assert.equal(referencedParentNumber(oldParent), 57);
});

test("review evidence requests and preserves the issue body and comments", () => {
  assert.deepEqual(issueReviewEvidenceArguments(84), [
    "issue",
    "view",
    "84",
    "--json",
    "number,title,body,comments",
  ]);
  const evidence = formatIssueReviewEvidence({
    number: 84,
    title: "Shared command application",
    body: "Acceptance criteria are authoritative.",
    comments: [{ author: { login: "operator" }, body: "Contract clarification." }],
  });
  assert.match(evidence, /Acceptance criteria are authoritative/);
  assert.match(evidence, /Comment by operator/);
  assert.match(evidence, /Contract clarification/);
});

test("every Pi agent is pinned to GPT-5.6 Sol with high thinking", () => {
  assert.equal(frontierModel, "openai-codex/gpt-5.6-sol");
  assert.equal(frontierThinkingLevel, "high");
  for (const arguments_ of [piAgentArguments("implement"), piAgentArguments("review", { readOnly: true })]) {
    assert.deepEqual(arguments_.slice(arguments_.indexOf("--model"), arguments_.indexOf("--model") + 2), ["--model", "openai-codex/gpt-5.6-sol"]);
    assert.deepEqual(arguments_.slice(arguments_.indexOf("--thinking"), arguments_.indexOf("--thinking") + 2), ["--thinking", "high"]);
  }
  assert.equal(piAgentArguments("review", { readOnly: true }).includes("--no-extensions"), true);
});

test("agent prompts reserve full validation for the orchestrator and preserve tracer sequencing", () => {
  const issue = { number: 86, title: "Prepare Assignment" };
  const implementation = editingAgentPrompt("implementation", { issue });
  const simplification = editingAgentPrompt("simplification", { issue, reasonLog: "/tmp/issue.log" });
  const targetedRepair = editingAgentPrompt("targeted-repair", {
    issue,
    evidencePath: "/tmp/latest-failure.md",
    failureFingerprint: "abc123",
    failureRepeated: true,
  });
  const editingPrompts = [
    implementation,
    editingAgentPrompt("remediation", { issue, reasonLog: "/tmp/issue.log" }),
    editingAgentPrompt("diagnosis", { issue, reasonLog: "/tmp/issue.log" }),
    simplification,
    editingAgentPrompt("contract-review", { issue, reasonLog: "/tmp/issue.log" }),
    targetedRepair,
  ];
  const reviewer = independentReviewerPrompt("/tmp/evidence.md");
  for (const prompt of editingPrompts) {
    assert.match(prompt, /^\/skill:implement/);
    assert.match(prompt, /do not run the full suite/);
    assert.match(prompt, /do not invoke code review or another Pi agent/);
    assert.match(prompt, /overrides the implementation skill's default completion procedure/);
    assert.doesNotMatch(prompt, /Invoke code review/);
    assert.match(prompt, /deferred sibling work remains deferred/);
  }
  assert.match(simplification, /without pausing for stakeholder confirmation/);
  assert.match(targetedRepair, /diagnosing-bugs/);
  assert.match(targetedRepair, /latest-failure\.md/);
  assert.match(targetedRepair, /smallest root-cause repair/);
  assert.match(targetedRepair, /focused tests and typecheck only/);
  assert.match(targetedRepair, /must not alter the issue contract or broadly redesign/);
  assert.doesNotMatch(targetedRepair, /issue\.log/);
  assert.match(reviewer, /active child acceptance criteria as the current delivery boundary/);
  assert.match(reviewer, /explicitly deferred sibling work/);
  assert.match(reviewer, /delivery-biased gate/);
  assert.match(reviewer, /non-blocking follow-ups/);
});

test("maintenance requires a fully cleared between-ticket boundary", () => {
  assert.equal(maintenanceBoundaryIsSafe({ currentIssue: 86, worktree: null, branch: null }), false);
  assert.equal(maintenanceBoundaryIsSafe({ currentIssue: null, worktree: "/tmp/issue", branch: null }), false);
  assert.equal(maintenanceBoundaryIsSafe({ currentIssue: null, worktree: null, branch: "agent/issue" }), false);
  assert.equal(maintenanceBoundaryIsSafe({ currentIssue: null, worktree: null, branch: null }), true);
});

test("maintenance atomically drains safe state, reserves active work, and honors cancellation", () => {
  const root = mkdtempSync(join(tmpdir(), "mdlm-maintenance-"));
  try {
    const exitedOwner = spawnSync(process.execPath, ["-e", ""], { encoding: "utf8" });
    assert.equal(exitedOwner.status, 0);
    assert.equal(Number.isInteger(exitedOwner.pid), true);
    assert.throws(() => process.kill(exitedOwner.pid, 0), { code: "ESRCH" });
    const stale = spawnSync("shlock", ["-f", join(root, "MAINTENANCE-GATE"), "-p", String(exitedOwner.pid)], { encoding: "utf8" });
    assert.equal(stale.status, 0);
    // shlock compares whole-second ctimes when replacing a stale lock.
    sleep(1_100);
    const maintenance = createMaintenanceController(root, { sleep: () => {} });
    assert.equal(maintenance.requestReload(() => false), false);
    let reservations = 0;
    assert.deepEqual(maintenance.reserveOrDrain({ currentIssue: null, worktree: null, branch: null }, () => ++reservations), { drain: false, stopped: false, value: 1 });
    maintenance.requestReload();
    assert.deepEqual(maintenance.reserveOrDrain({ currentIssue: null, worktree: null, branch: null }, () => ++reservations), { drain: true, stopped: false });
    assert.deepEqual(maintenance.reserveOrDrain({ currentIssue: 86, worktree: "/tmp/issue", branch: "agent/86" }, () => ++reservations), { drain: false, stopped: false, value: 2 });
    assert.equal(maintenance.reloadPermitted(), true);
    assert.equal(maintenance.acknowledgeReload(false), false);
    assert.equal(maintenance.requested(), true);
    assert.equal(maintenance.acknowledgeReload(true), true);
    assert.equal(maintenance.requested(), false);
    assert.equal(maintenance.acknowledgeReload(false), true);
    maintenance.finishAcknowledgement();
    assert.equal(maintenance.acknowledgeReload(false), false);
    maintenance.requestReload();
    maintenance.stop();
    assert.equal(maintenance.acknowledgeReload(true), false);
    assert.deepEqual(maintenance.reserveOrDrain({ currentIssue: null, worktree: null, branch: null }, () => ++reservations), { drain: false, stopped: true });
    assert.throws(() => maintenance.requestReload(), /explicit stop/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("no-op detection includes commits, worktree bytes, and issue activity", () => {
  const before = { head: "abc", worktree: "", issueActivity: "[]" };
  assert.equal(actionProgressed(before, { ...before }), false);
  assert.equal(actionProgressed(before, { ...before, head: "def" }), true);
  assert.equal(actionProgressed(before, { ...before, worktree: " M file" }), true);
  assert.equal(actionProgressed(before, { ...before, issueActivity: "[[1]]" }), true);
});

test("signaled or status-less validation remains an unconfirmed in-flight attempt", () => {
  assert.equal(validationCommandWasInterrupted({ status: null, signal: null }), true);
  assert.equal(validationCommandWasInterrupted({ status: null, signal: "SIGTERM" }), true);
  assert.equal(validationCommandWasInterrupted({ status: 1, signal: null }), false);
  assert.equal(validationCommandWasInterrupted({ status: 0, signal: null }), false);
});

test("completed failed validation resumes without launching another editing agent", () => {
  assert.equal(resumesAtValidation({ kind: "failed-validation" }), true);
  assert.equal(resumesAtValidation({ kind: "validation" }), true);
  assert.equal(resumesAtValidation({ kind: "review" }), true);
  assert.equal(resumesAtValidation({ kind: "implementation" }), false);
});

test("child commands have a finite timeout", () => {
  assert.throws(
    () => commandResult(process.execPath, ["-e", "setTimeout(() => {}, 10000)"], { timeout: 10, maximumAttempts: 1 }),
    /ETIMEDOUT|timed out/i,
  );
});

test("timed-out process groups terminate both child and long-lived grandchild", () => {
  const source = `
    const { spawn } = require("node:child_process");
    const grandchild = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
    process.stdout.write(JSON.stringify({ child: process.pid, grandchild: grandchild.pid }) + "\\n");
    setInterval(() => {}, 1000);
  `;
  const result = runInProcessGroup(process.execPath, ["-e", source], { timeout: 100, terminationGrace: 100 });
  assert.equal(result.timedOut, true);
  assert.equal(result.status, 124);
  assert.match(result.stderr, /FRONTIER_PROCESS_TIMEOUT/);
  const identities = JSON.parse(result.stdout.trim().split("\n")[0]);
  for (const pid of [identities.child, identities.grandchild]) {
    assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
  }
});

test("editing and read-only Pi timeouts are typed at the agent-runner boundary", () => {
  const root = mkdtempSync(join(tmpdir(), "mdlm-agent-timeout-"));
  const logPath = join(root, "issue.log");
  const timedOutResult = {
    error: undefined,
    status: 124,
    signal: null,
    timedOut: true,
    stdout: "",
    stderr: "FRONTIER_PROCESS_TIMEOUT: process group terminated",
  };
  const runner = createAgentRunner({
    repositoryRoot: root,
    maximumInfrastructureAttempts: 4,
    complexityBudget: {
      maximumChangedFiles: 24,
      maximumChangedLines: 1_800,
      maximumLifecycleModules: 12,
    },
    runAgentProcess: () => timedOutResult,
  });
  try {
    assert.throws(
      () => runner.runImplementation(root, "edit", logPath, "implementation", {
        actionKind: "implementation",
        attemptStartIdentity: "edit-attempt-1",
      }),
      (error) => error instanceof AgentProcessTimeoutError
        && error.actionKind === "implementation"
        && error.attemptStartIdentity === "edit-attempt-1",
    );
    assert.throws(
      () => runner.runReadOnlyReviewer(root, "review", logPath, {
        actionKind: "review",
        attemptStartIdentity: "review-attempt-1",
      }),
      (error) => error instanceof AgentProcessTimeoutError
        && error.actionKind === "review"
        && error.attemptStartIdentity === "review-attempt-1",
    );
    const statusOnlyRunner = createAgentRunner({
      repositoryRoot: root,
      maximumInfrastructureAttempts: 4,
      complexityBudget: {
        maximumChangedFiles: 24,
        maximumChangedLines: 1_800,
        maximumLifecycleModules: 12,
      },
      runAgentProcess: () => ({ ...timedOutResult, timedOut: false }),
    });
    assert.throws(
      () => statusOnlyRunner.runReadOnlyReviewer(root, "review", logPath, {
        actionKind: "review",
        attemptStartIdentity: "review-attempt-status-124",
      }),
      AgentProcessTimeoutError,
    );
    const thrownTimeout = new AgentProcessTimeoutError({
      actionKind: "review",
      attemptStartIdentity: "review-attempt-2",
      evidence: "FRONTIER_PROCESS_TIMEOUT",
      logPath,
    });
    const throwingRunner = createAgentRunner({
      repositoryRoot: root,
      maximumInfrastructureAttempts: 4,
      complexityBudget: {
        maximumChangedFiles: 24,
        maximumChangedLines: 1_800,
        maximumLifecycleModules: 12,
      },
      runAgentProcess: () => { throw thrownTimeout; },
    });
    assert.throws(
      () => throwingRunner.runReadOnlyReviewer(root, "review", logPath, {
        actionKind: "review",
        attemptStartIdentity: "review-attempt-2",
      }),
      (error) => error === thrownTimeout,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("typed agent process timeout is not a provider transient", () => {
  assert.equal(isTransientAgentFailure(new AgentProcessTimeoutError({
    actionKind: "review",
    attemptStartIdentity: "review-attempt-1",
    evidence: "timed out",
    logPath: "/tmp/issue.log",
  })), false);
});

test("first agent timeout durably retries the same action without consuming product correction", () => {
  const state = {
    pendingAction: { kind: "review" },
    commandsValidatedHead: "validated-head",
    remediationUsed: false,
    diagnosticEscalations: 0,
    designEscalations: 0,
    contractReviews: 0,
    targetedRepairCount: 0,
    currentFailureFingerprint: null,
    failureEvidencePath: null,
  };
  const transition = agentTimeoutTransition(state, {
    actionKind: "review",
    attemptStartIdentity: "review-attempt-1",
    evidence: "FRONTIER_PROCESS_TIMEOUT after 100ms",
    logPath: "/tmp/issue-101.log",
  });
  assert.equal(transition.agentTimeoutCount, 1);
  assert.deepEqual(transition.pendingAction, { kind: "review" });
  assert.equal(transition.commandsValidatedHead, "validated-head");
  assert.equal(transition.remediationUsed, false);
  assert.equal(transition.diagnosticEscalations, 0);
  assert.equal(transition.designEscalations, 0);
  assert.equal(transition.contractReviews, 0);
  assert.equal(transition.targetedRepairCount, 0);
  assert.equal(transition.currentFailureFingerprint, null);
  assert.equal(transition.failureEvidencePath, null);
});

test("editing and reviewer actions each get one fresh timeout retry before infrastructure quarantine", () => {
  for (const actionKind of ["implementation", "review"]) {
    const productState = {
      pendingAction: { kind: actionKind },
      commandsValidatedHead: actionKind === "review" ? "validated-head" : null,
      remediationUsed: true,
      diagnosticEscalations: 1,
      designEscalations: 1,
      contractReviews: 1,
      targetedRepairCount: 2,
      currentFailureFingerprint: "existing-product-fingerprint",
      failureEvidencePath: "/tmp/existing-product-failure.md",
    };
    const first = agentTimeoutTransition(productState, {
      actionKind,
      attemptStartIdentity: `${actionKind}-attempt-1`,
      evidence: "first timeout",
      logPath: "/tmp/issue.log",
    });
    assert.deepEqual(first.pendingAction, { kind: actionKind });
    assert.equal(first.agentTimeoutCount, 1);
    assert.equal(first.commandsValidatedHead, productState.commandsValidatedHead);
    assert.equal(first.targetedRepairCount, 2);
    assert.equal(first.currentFailureFingerprint, "existing-product-fingerprint");

    const second = agentTimeoutTransition(first, {
      actionKind,
      attemptStartIdentity: `${actionKind}-attempt-2`,
      evidence: "second timeout",
      logPath: "/tmp/issue.log",
    });
    assert.equal(second.agentTimeoutCount, 2);
    assert.equal(second.pendingAction.quarantineClass, "agent-infrastructure-timeout");
    assert.equal(second.pendingAction.timeoutAction, actionKind);
    assert.equal(second.targetedRepairCount, 2);
    assert.equal(second.currentFailureFingerprint, "existing-product-fingerprint");
  }
});

test("second ticket-wide agent timeout schedules infrastructure quarantine without product evidence", () => {
  const first = agentTimeoutTransition({
    pendingAction: { kind: "implementation" },
    agentTimeoutCount: 0,
    agentTimeoutOccurrences: [],
    remediationUsed: false,
    diagnosticEscalations: 0,
    designEscalations: 0,
    contractReviews: 0,
    targetedRepairCount: 0,
  }, {
    actionKind: "implementation",
    attemptStartIdentity: "edit-attempt-1",
    evidence: "first timeout",
    logPath: "/tmp/issue-101.log",
  });
  const second = agentTimeoutTransition({ ...first, pendingAction: { kind: "review" } }, {
    actionKind: "review",
    attemptStartIdentity: "review-attempt-2",
    evidence: "second timeout",
    logPath: "/tmp/issue-101.log",
  });
  assert.equal(second.agentTimeoutCount, 2);
  assert.deepEqual(second.pendingAction, {
    kind: "quarantine",
    quarantineClass: "agent-infrastructure-timeout",
    timeoutAction: "review",
    timeoutEvidence: "second timeout",
    timeoutLog: "/tmp/issue-101.log",
  });
  assert.equal(second.targetedRepairCount, 0);
  assert.equal(second.currentFailureFingerprint, undefined);
  assert.equal(second.failureEvidencePath, undefined);
});

test("editing timeout occurrence survives status persistence before control returns", () => {
  const root = mkdtempSync(join(tmpdir(), "mdlm-timeout-state-"));
  const statePath = join(root, "status.json");
  let durableState = {
    parentIssue: 83,
    currentIssue: 101,
    branch: "agent/issue-101",
    worktree: root,
    issueLog: join(root, "issue-101.log"),
    pendingAction: { kind: "implementation" },
    agentTimeoutCount: 0,
    agentTimeoutOccurrences: [],
    remediationUsed: false,
    diagnosticEscalations: 0,
    designEscalations: 0,
    contractReviews: 0,
    targetedRepairCount: 0,
  };
  const writeState = (_paths, current, patch) => {
    durableState = { ...current, ...patch };
    writeFileSync(statePath, JSON.stringify(durableState));
    return durableState;
  };
  const runner = createTicketRunner({
    repositoryRoot: root,
    writeState,
    log: () => {},
    defaultBranch: () => "main",
    maximumDiagnosticEscalations: 1,
    maximumDesignEscalations: 1,
    maximumAgentInfrastructureAttempts: 4,
    complexityBudget: { maximumChangedFiles: 24, maximumChangedLines: 1_800, maximumLifecycleModules: 12 },
  });
  try {
    const timeout = new AgentProcessTimeoutError({
      actionKind: "implementation",
      attemptStartIdentity: "durable-edit-attempt",
      evidence: "FRONTIER_PROCESS_TIMEOUT",
      logPath: durableState.issueLog,
    });
    runner.recordAgentTimeout({ root, state: statePath }, durableState, timeout);
    const persisted = JSON.parse(readFileSync(statePath, "utf8"));
    assert.equal(persisted.agentTimeoutCount, 1);
    assert.deepEqual(persisted.pendingAction, { kind: "implementation" });
    assert.equal(persisted.targetedRepairCount, 0);
    assert.equal(persisted.currentFailureFingerprint, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("recorded agent timeout occurrence is idempotent across crash resume", () => {
  const once = agentTimeoutTransition({ pendingAction: { kind: "implementation" } }, {
    actionKind: "implementation",
    attemptStartIdentity: "durable-attempt",
    evidence: "timeout",
    logPath: "/tmp/issue.log",
  });
  const replayed = agentTimeoutTransition(once, {
    actionKind: "implementation",
    attemptStartIdentity: "durable-attempt",
    evidence: "timeout",
    logPath: "/tmp/issue.log",
  });
  assert.strictEqual(replayed, once);
  assert.equal(replayed.agentTimeoutCount, 1);
});

test("quarantine records distinguish product exhaustion from agent infrastructure timeout", () => {
  const issue = { number: 101, title: "Deploy validated controller" };
  const common = {
    branch: "agent/issue-101",
    worktree: "/tmp/issue-101",
    remediationUsed: false,
    diagnosticEscalations: 0,
    designEscalations: 0,
    contractReviews: 0,
    targetedRepairCount: 0,
    agentTimeoutCount: 2,
    currentFailureFingerprint: "earlier-real-product-fingerprint",
    failureEvidencePath: "/tmp/earlier-real-product-failure.md",
    quarantinedAt: "2026-08-12T10:00:00.000Z",
  };
  const infrastructure = quarantineIssueRecord(issue, {
    ...common,
    pendingAction: {
      kind: "quarantine",
      quarantineClass: "agent-infrastructure-timeout",
      timeoutAction: "review",
      timeoutEvidence: "FRONTIER_PROCESS_TIMEOUT",
      timeoutLog: "/tmp/issue-101.log",
    },
  });
  assert.equal(infrastructure.class, "agent-infrastructure-timeout");
  assert.equal(infrastructure.timeoutAction, "review");
  assert.equal(infrastructure.timeoutEvidence, "FRONTIER_PROCESS_TIMEOUT");
  assert.equal(infrastructure.timeoutLog, "/tmp/issue-101.log");
  assert.equal("failureFingerprint" in infrastructure, false);
  assert.match(quarantineIssueComment("<!-- marker -->", infrastructure), /agent infrastructure timed out/i);
  assert.doesNotMatch(quarantineIssueComment("<!-- marker -->", infrastructure), /targeted repair budget exhausted/i);

  const product = quarantineIssueRecord(issue, {
    ...common,
    pendingAction: { kind: "quarantine", quarantineClass: "product-correction-exhausted" },
    currentFailureFingerprint: "product-fingerprint",
    previousFailureFingerprint: "previous-product-fingerprint",
    failureRepeatCount: 3,
    failureEvidencePath: "/tmp/product-failure.md",
    failureEvidenceIdentity: "command:abc",
  });
  assert.equal(product.class, "product-correction-exhausted");
  assert.equal(product.failureFingerprint, "product-fingerprint");
  assert.match(quarantineIssueComment("<!-- marker -->", product), /targeted repair budget was exhausted/i);
});

test("quarantine comment publication is single-attempt and re-entry observes the marker before continuing", () => {
  const marker = "<!-- mdlm-frontier-quarantine:83:101 -->";
  const record = {
    class: "product-correction-exhausted",
    branch: "agent/issue-101",
    worktree: "/tmp/issue-101",
    failureFingerprint: "final-fingerprint",
    failureEvidencePath: "/tmp/failure.md",
    reason: "targeted repair budget exhausted",
  };
  const requests = [];
  const commandOutput = (...request) => {
    requests.push(request);
    return "https://github.com/example/repo/issues/101#issuecomment-1";
  };

  assert.equal(publishQuarantineCommentOnce({
    commandOutput,
    issueNumber: 101,
    comments: [],
    marker,
    record,
  }), "published");
  assert.deepEqual(requests[0], [
    "gh",
    ["issue", "comment", "101", "--body", quarantineIssueComment(marker, record)],
    { maximumAttempts: 1 },
  ]);

  assert.equal(publishQuarantineCommentOnce({
    commandOutput,
    issueNumber: 101,
    comments: [{ body: `${marker}\nAlready published` }],
    marker,
    record,
  }), "observed");
  assert.equal(requests.length, 1);
});

test("state migration never infers a missing validated head from review or publication state", () => {
  const migrated = migrateFrontierState({
    schemaVersion: 4,
    pendingAction: { kind: "review" },
    commandsValidatedHead: "known-command-head",
    reviewedHead: "known-review-head",
    pullRequest: 101,
  });
  assert.equal(migrated.validatedHead, undefined);
});

test("independent validation checks the committed ticket range", () => {
  assert.deepEqual(validationCommands("main")[1], ["git", ["diff", "--check", "origin/main...HEAD"]]);
});

test("validation and complexity require final explicit reviewer verdicts", () => {
  assert.equal(validationHasVerdict("Everything passes.\nVALIDATION: PASS\n"), true);
  assert.equal(validationPassed("Everything passes.\nVALIDATION: PASS\n"), true);
  assert.equal(validationPassed("VALIDATION: PASS\nLater finding.\nVALIDATION: FAIL\n"), false);
  assert.equal(validationHasVerdict("The implementation looks good."), false);
  assert.equal(validationPassed("The implementation looks good."), false);
  assert.equal(reviewHasComplexityVerdict("COMPLEXITY: OK\nVALIDATION: PASS\n"), true);
  assert.equal(reviewRequestsSimplification("COMPLEXITY: OK\nVALIDATION: PASS\n"), false);
  assert.equal(reviewRequestsSimplification("COMPLEXITY: OK\nCOMPLEXITY: ESCALATE\nVALIDATION: FAIL\n"), false);
  assert.equal(reviewerVerdict("COMPLEXITY: OK\nCOMPLEXITY: ESCALATE\nVALIDATION: FAIL\n"), null);
  assert.equal(reviewHasComplexityVerdict("VALIDATION: PASS\n"), false);
  assert.equal(reviewRequestsSimplification("VALIDATION: PASS\n"), false);
  assert.equal(reviewerVerdict("VALIDATION: PASS\nFindings\nCOMPLEXITY: OK\nVALIDATION: PASS\n"), null);
  assert.equal(reviewerVerdict("COMPLEXITY: OK\nVALIDATION: PASS\nTrailing prose\n"), null);
  assert.deepEqual(reviewerVerdict("Review body\nCOMPLEXITY: ESCALATE\nVALIDATION: FAIL\n"), { complexity: "ESCALATE", validation: "FAIL" });
});

test("pull request URLs yield their numeric GitHub identity", () => {
  assert.equal(parsePullRequestNumber("https://github.com/taylorrowser/mdlm/pull/105"), 105);
  assert.throws(() => parsePullRequestNumber("https://github.com/taylorrowser/mdlm/issues/105"), /pull request URL/);
});

test("failure reporting preserves the latest state written by nested processing", () => {
  const stale = { currentIssue: null, phase: "starting" };
  const persisted = { currentIssue: 84, phase: "merging", worktree: "/tmp/issue-84" };

  assert.deepEqual(failureBaseState(stale, persisted), persisted);
  assert.deepEqual(failureBaseState(stale, null), stale);
});

test("a tmux session is running only while at least one pane is live", () => {
  assert.equal(panesAreRunning(["1"]), false);
  assert.equal(panesAreRunning(["1", "0"]), true);
  assert.equal(panesAreRunning([]), false);
});

test("validation rotates through remediation, diagnosis, design, one contract review, and targeted repair", () => {
  const base = {
    maximumDiagnosticEscalations: 1,
    maximumDesignEscalations: 1,
  };
  assert.equal(validationFailureAction({ ...base, remediationUsed: false, diagnosticEscalations: 0, designEscalations: 0, contractReviews: 0, targetedRepairCount: 0 }), "remediate");
  assert.equal(validationFailureAction({ ...base, remediationUsed: true, diagnosticEscalations: 0, designEscalations: 0, contractReviews: 0, targetedRepairCount: 0 }), "diagnose");
  assert.equal(validationFailureAction({ ...base, remediationUsed: true, diagnosticEscalations: 1, designEscalations: 0, contractReviews: 0, targetedRepairCount: 0 }), "simplify");
  assert.equal(validationFailureAction({ ...base, remediationUsed: true, diagnosticEscalations: 1, designEscalations: 1, contractReviews: 0, targetedRepairCount: 0 }), "contract-review");
  assert.equal(validationFailureAction({ ...base, remediationUsed: true, diagnosticEscalations: 1, designEscalations: 1, contractReviews: 1, targetedRepairCount: 0 }), "targeted-repair");
  assert.equal(validationFailureAction({ ...base, remediationUsed: true, diagnosticEscalations: 1, designEscalations: 1, contractReviews: 1, targetedRepairCount: 3 }), "quarantine");
});

test("failure action scheduling persists the first contract review then targeted repairs without replenishment", () => {
  const exhausted = {
    remediationUsed: true,
    diagnosticEscalations: 1,
    designEscalations: 1,
    contractReviews: 0,
    targetedRepairCount: 0,
    failureEvidencePath: "/tmp/failure.md",
    currentFailureFingerprint: "abc",
    failureRepeatCount: 0,
    pendingAction: null,
  };
  const contract = scheduleFailureAction(exhausted);
  assert.equal(contract.contractReviews, 1);
  assert.deepEqual(contract.pendingAction, { kind: "contract-review" });

  const targeted = scheduleFailureAction({ ...contract, pendingAction: null });
  assert.equal(targeted.contractReviews, 1);
  assert.equal(targeted.targetedRepairCount, 1);
  assert.deepEqual(targeted.pendingAction, {
    kind: "targeted-repair",
    evidencePath: "/tmp/failure.md",
    failureFingerprint: "abc",
    failureRepeated: false,
  });
});

test("unchanged exact reviews reuse their persisted verdict independently of later remote evidence", () => {
  const state = {
    reviewedHead: "abc",
    reviewedEvidenceFingerprint: "review-evidence",
    reviewedPassed: true,
    reviewedSimplify: false,
    failureEvidenceIdentity: "remote:abc:12",
  };
  assert.deepEqual(reviewedVerdictAt(state, "abc", "review-evidence"), { passed: true, simplify: false });
  assert.equal(reviewedVerdictAt(state, "def", "review-evidence"), null);
});

test("failure caches are reusable only when durable evidence matches the exact signal identity", () => {
  const state = { failureEvidencePath: "/tmp/new-artifact.md", failureEvidenceIdentity: "command:abc" };
  assert.equal(failureEvidenceMatches(state, "command:abc"), true);
  assert.equal(failureEvidenceMatches(state, "command:def"), false);
  assert.equal(failureEvidenceMatches({ failureEvidenceIdentity: "command:abc" }, "command:abc"), false);
});

test("pending quarantine bypasses successful-publication reconciliation", () => {
  assert.equal(publicationReconciliationAllowed({ pendingAction: { kind: "quarantine" } }), false);
  assert.equal(publicationReconciliationAllowed({ pendingAction: { kind: "review" } }), true);
});

test("crash resume neither replenishes nor double-consumes a scheduled action", () => {
  const scheduled = scheduleFailureAction({
    remediationUsed: true,
    diagnosticEscalations: 1,
    designEscalations: 1,
    contractReviews: 1,
    targetedRepairCount: 1,
    failureEvidencePath: "/tmp/failure.md",
    currentFailureFingerprint: "abc",
    failureRepeatCount: 2,
    pendingAction: null,
  });
  assert.equal(scheduled.targetedRepairCount, 2);
  assert.strictEqual(scheduleFailureAction(scheduled), scheduled);
});

test("safe reload does not resume a legacy repeated broad contract-review cycle", () => {
  assert.deepEqual(migrateFrontierState({
    schemaVersion: 3,
    pendingAction: { kind: "contract-review" },
    contractReviews: 5,
  }), {
    schemaVersion: 5,
    pendingAction: { kind: "validation" },
    contractReviews: 5,
    targetedRepairCount: 0,
    agentTimeoutCount: 0,
    agentTimeoutOccurrences: [],
    agentAttempt: null,
    lastAgentTimeout: null,
    quarantines: [],
  });
  assert.deepEqual(migrateFrontierState({
    schemaVersion: 3,
    pendingAction: null,
    contractReviews: 5,
  }).pendingAction, { kind: "validation" });
  assert.deepEqual(migrateFrontierState({
    schemaVersion: 3,
    pendingAction: { kind: "contract-review" },
    contractReviews: 1,
  }).pendingAction, { kind: "contract-review" });
});

test("targeted repair cap produces quarantine instead of another editing action", () => {
  const quarantined = scheduleFailureAction({
    remediationUsed: true,
    diagnosticEscalations: 1,
    designEscalations: 1,
    contractReviews: 1,
    targetedRepairCount: 3,
    failureEvidencePath: "/tmp/failure.md",
    currentFailureFingerprint: "final-fingerprint",
    failureRepeatCount: 3,
    pendingAction: null,
  });
  assert.equal(quarantined.targetedRepairCount, 3);
  assert.deepEqual(quarantined.pendingAction, {
    kind: "quarantine",
    quarantineClass: "product-correction-exhausted",
    evidencePath: "/tmp/failure.md",
    failureFingerprint: "final-fingerprint",
    failureRepeated: true,
  });
});

test("Vitest failure fingerprints normalize only matched summary runner durations", () => {
  const firstOutput = "\u001b[31m× waits 500ms 12746ms\u001b[0m\nFAIL test/example.test.ts > waits 500ms\n2026-08-12T01:02:03.000Z AssertionError: expected true to be false\n at /private/tmp/mdlm-run-a1/test/example.test.ts:44:7\nDuration 27m 3.2s";
  const secondOutput = "× waits 500ms 376.58ms\nFAIL test/example.test.ts > waits 500ms\n2027-01-01T04:05:06.000Z AssertionError: expected true to be false\n at /tmp/mdlm-run-z9/test/example.test.ts:44:7\nDuration 12.8s";
  const fingerprint = failureFingerprint({ commandIdentity: "npm test", output: firstOutput });

  assert.equal(failureFingerprint({ commandIdentity: "npm test", output: secondOutput }), fingerprint);
  assert.notEqual(
    failureFingerprint({ commandIdentity: "npm test", output: secondOutput.replaceAll("waits 500ms", "waits 600ms") }),
    fingerprint,
  );
  assert.notEqual(
    failureFingerprint({ commandIdentity: "npm test", output: "FAIL test/example.test.ts > waits 500ms\nAssertionError: expected true to be false" }),
    failureFingerprint({ commandIdentity: "npm test", output: "FAIL test/example.test.ts > waits 600ms\nAssertionError: expected true to be false" }),
  );
  assert.notEqual(
    failureFingerprint({ commandIdentity: "npm test", output: "× waits 500ms 12746ms\nAssertionError: expected true to be false" }),
    failureFingerprint({ commandIdentity: "npm test", output: "× waits 500ms 376.58ms\nAssertionError: expected true to be false" }),
  );
});

test("Node TAP failure fingerprints strip only final parenthesized runner durations", () => {
  const firstOutput = "ok 1 - setup (0.125ms)\nnot ok 2 - waits 500ms (0.49325ms)\n  AssertionError: expected true to be false\n    at /private/tmp/mdlm-run-a1/test/example.test.ts:44:7";
  const secondOutput = "ok 1 - setup (42.75ms)\nnot ok 2 - waits 500ms (892.75ms)\n  AssertionError: expected true to be false\n    at /tmp/mdlm-run-z9/test/example.test.ts:44:7";
  const fingerprint = failureFingerprint({ commandIdentity: "node --test", output: firstOutput });

  assert.equal(failureFingerprint({ commandIdentity: "node --test", output: secondOutput }), fingerprint);
  assert.notEqual(
    failureFingerprint({ commandIdentity: "node --test", output: secondOutput.replace("waits 500ms", "waits 600ms") }),
    fingerprint,
  );
});

test("failure fingerprints preserve command, assertion, and normalized path identity", () => {
  const evidence = {
    commandIdentity: "npm test",
    output: "FAIL test/example.test.ts > rejects stale input\nAssertionError: expected timeout 5ms but received 10ms\n at /tmp/mdlm-run-a1/test/example.test.ts:44:7",
  };
  const fingerprint = failureFingerprint(evidence);

  assert.notEqual(failureFingerprint({ ...evidence, commandIdentity: "npm run test:unit" }), fingerprint);
  assert.notEqual(failureFingerprint({ ...evidence, output: evidence.output.replace("received 10ms", "received 11ms") }), fingerprint);
  assert.notEqual(failureFingerprint({ ...evidence, output: evidence.output.replaceAll("example.test.ts", "other.test.ts") }), fingerprint);
});

test("failure fingerprint repetition tracks the same normalized failure", () => {
  const fingerprint = failureFingerprint({
    commandIdentity: "node --test",
    output: "not ok 1 - rejects stale input (0.49325ms)\nAssertionError: expected true to be false",
  });
  const first = recordFailureFingerprint({}, fingerprint);
  assert.deepEqual(first, {
    previousFailureFingerprint: null,
    currentFailureFingerprint: fingerprint,
    failureRepeatCount: 0,
    failureRepeated: false,
  });
  assert.deepEqual(recordFailureFingerprint(first, fingerprint), {
    previousFailureFingerprint: fingerprint,
    currentFailureFingerprint: fingerprint,
    failureRepeatCount: 1,
    failureRepeated: true,
  });
});

test("supervisor recognizes completion and process dead end as terminal", () => {
  assert.equal(supervisorRecognizesTerminalPhase("complete"), true);
  assert.equal(supervisorRecognizesTerminalPhase("process-dead-end"), true);
  assert.equal(supervisorRecognizesTerminalPhase("failed"), false);
});

test("complexity budget reports every crossed threshold", () => {
  assert.deepEqual(
    complexityReasonsFromStats(
      { changedFiles: 25, changedLines: 1801, lifecycleModules: 13 },
      { maximumChangedFiles: 24, maximumChangedLines: 1800, maximumLifecycleModules: 12 },
    ),
    ["25 changed files exceeds 24", "1801 changed lines exceeds 1800", "13 lifecycle modules exceeds 12"],
  );
  assert.deepEqual(
    complexityReasonsFromStats(
      { changedFiles: 3, changedLines: 100, lifecycleModules: 2 },
      { maximumChangedFiles: 24, maximumChangedLines: 1800, maximumLifecycleModules: 12 },
    ),
    [],
  );
});

test("publication retry failures remain separate from product validation", () => {
  const retry = new Error("retry");
  retry.name = "PublicationRetryError";
  assert.equal(isPublicationRetryFailure(retry), true);
  assert.equal(isRemoteValidationFailure(retry), false);
});

test("remote check failures are classified as validation failures", () => {
  assert.equal(isRemoteValidationFailure(new Error("Remote checks failed for PR #105; inspect the issue log")), true);
  assert.equal(isRemoteValidationFailure(new Error("HTTP 502 from GitHub")), false);
});

test("transient infrastructure and Pi provider failures are classified narrowly", () => {
  assert.equal(isTransientInfrastructureFailure(new Error("gh repo view failed: HTTP 502: Please try resubmitting your request")), true);
  assert.equal(isTransientInfrastructureFailure(new Error("gh auth status failed: authentication required")), false);
  assert.equal(isTransientAgentFailure(new Error("TypeError: fetch failed caused by ECONNRESET")), true);
  assert.equal(isTransientAgentFailure(new Error("spawnSync pi ETIMEDOUT")), true);
  assert.equal(isTransientAgentFailure(new Error("tests failed with assertion error")), false);
});

test("merged publication recovery requires the PR head to equal the validated head", () => {
  assert.equal(mergedPullRequestMatchesValidatedHead({ validatedHead: "abc123" }, { state: "MERGED", headRefOid: "abc123" }), true);
  assert.equal(mergedPullRequestMatchesValidatedHead({ validatedHead: "abc123" }, { state: "MERGED", headRefOid: "def456" }), false);
  assert.equal(mergedPullRequestMatchesValidatedHead({}, { state: "MERGED", headRefOid: "abc123" }), false);
});

test("a validated branch can resume publication only at the identical commit", () => {
  assert.equal(validatedHeadMatches({ validatedHead: "abc123" }, "abc123"), true);
  assert.equal(validatedHeadMatches({ validatedHead: "abc123" }, "def456"), false);
  assert.equal(validatedHeadMatches({}, "abc123"), false);
});
