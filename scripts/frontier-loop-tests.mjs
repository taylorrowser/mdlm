import assert from "node:assert/strict";
import test from "node:test";
import {
  bodyReferencesParent,
  complexityReasonsFromStats,
  failureBaseState,
  findBacklogItem,
  findFrontier,
  isRemoteValidationFailure,
  isTransientAgentFailure,
  isTransientInfrastructureFailure,
  panesAreRunning,
  parsePullRequestNumber,
  referencedParentNumber,
  reviewHasComplexityVerdict,
  reviewRequestsSimplification,
  selectOlderReadyBacklog,
  shouldDiagnoseResume,
  validatedHeadMatches,
  validationFailureAction,
  validationHasVerdict,
  validationPassed,
} from "./frontier-loop-core.mjs";

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

test("older backlog selection is separate and cannot absorb future work", () => {
  const summaries = [
    { number: 70, state: "OPEN", labels: [{ name: "ready-for-agent" }] },
    { number: 80, state: "OPEN", labels: [{ name: "ready-for-agent" }] },
    { number: 105, state: "OPEN", labels: [{ name: "ready-for-agent" }] },
    { number: 69, state: "CLOSED", labels: [{ name: "ready-for-agent" }] },
  ];
  const selected = selectOlderReadyBacklog(83, summaries, [{ number: 80 }]);
  assert.deepEqual(selected.map((candidate) => candidate.number), [70]);
  assert.equal(findBacklogItem([issue(71), issue(70)])?.number, 70);
});

test("body parent discovery reads only the explicit Parent section", () => {
  assert.equal(bodyReferencesParent("## Parent\n\n[Spec](https://github.com/taylorrowser/mdlm/issues/83)\n\n## What to build\nX", 83), true);
  assert.equal(bodyReferencesParent("## Parent\n\n- #83\n\n## What to build\nX", 83), true);
  assert.equal(bodyReferencesParent("## Further Notes\n\nSee https://github.com/taylorrowser/mdlm/issues/83", 83), false);
  const oldParent = "## Parent\n\n- #57\n\n## Notes\nSee #83";
  assert.equal(bodyReferencesParent(oldParent, 83), false);
  assert.equal(referencedParentNumber(oldParent), 57);
});

test("validation and complexity require final explicit reviewer verdicts", () => {
  assert.equal(validationHasVerdict("Everything passes.\nVALIDATION: PASS\n"), true);
  assert.equal(validationPassed("Everything passes.\nVALIDATION: PASS\n"), true);
  assert.equal(validationPassed("VALIDATION: PASS\nLater finding.\nVALIDATION: FAIL\n"), false);
  assert.equal(validationHasVerdict("The implementation looks good."), false);
  assert.equal(validationPassed("The implementation looks good."), false);
  assert.equal(reviewHasComplexityVerdict("COMPLEXITY: OK\nVALIDATION: PASS\n"), true);
  assert.equal(reviewRequestsSimplification("COMPLEXITY: OK\nVALIDATION: PASS\n"), false);
  assert.equal(reviewRequestsSimplification("COMPLEXITY: OK\nCOMPLEXITY: ESCALATE\nVALIDATION: FAIL\n"), true);
  assert.equal(reviewHasComplexityVerdict("VALIDATION: PASS\n"), false);
  assert.equal(reviewRequestsSimplification("VALIDATION: PASS\n"), false);
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

test("validation rotates through remediation, diagnosis, design, and contract review", () => {
  const base = {
    maximumAttempts: 2,
    maximumDiagnosticEscalations: 2,
    maximumDesignEscalations: 2,
  };
  assert.equal(validationFailureAction({ ...base, attempt: 1, diagnosticEscalations: 0, designEscalations: 0 }), "remediate");
  assert.equal(validationFailureAction({ ...base, attempt: 2, diagnosticEscalations: 0, designEscalations: 0 }), "diagnose");
  assert.equal(validationFailureAction({ ...base, attempt: 2, diagnosticEscalations: 2, designEscalations: 0 }), "simplify");
  assert.equal(validationFailureAction({ ...base, attempt: 2, diagnosticEscalations: 2, designEscalations: 2 }), "contract-review");
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

test("an explicit recovery action resumes with diagnosis without parsing error prose", () => {
  assert.equal(shouldDiagnoseResume({ phase: "failed", resumeAction: "diagnose", lastError: "arbitrary detail" }), true);
  assert.equal(shouldDiagnoseResume({ phase: "failed", lastError: "Remote checks failed for PR #105" }), false);
  assert.equal(shouldDiagnoseResume({ phase: "validating", resumeAction: null }), false);
});

test("remote check failures are classified as validation failures", () => {
  assert.equal(isRemoteValidationFailure(new Error("Remote checks failed for PR #105; inspect the issue log")), true);
  assert.equal(isRemoteValidationFailure(new Error("HTTP 502 from GitHub")), false);
});

test("transient infrastructure and Pi provider failures are classified narrowly", () => {
  assert.equal(isTransientInfrastructureFailure(new Error("gh repo view failed: HTTP 502: Please try resubmitting your request")), true);
  assert.equal(isTransientInfrastructureFailure(new Error("gh auth status failed: authentication required")), false);
  assert.equal(isTransientAgentFailure(new Error("TypeError: fetch failed caused by ECONNRESET")), true);
  assert.equal(isTransientAgentFailure(new Error("tests failed with assertion error")), false);
});

test("a validated branch can resume publication only at the identical commit", () => {
  assert.equal(validatedHeadMatches({ validatedHead: "abc123" }, "abc123"), true);
  assert.equal(validatedHeadMatches({ validatedHead: "abc123" }, "def456"), false);
  assert.equal(validatedHeadMatches({}, "abc123"), false);
});
