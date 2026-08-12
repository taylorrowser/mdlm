function commonEditingPolicy(issue) {
  return `Read the complete issue and comments, parent spec, repository instructions, glossary, relevant ADRs, branch commits, and existing work. Treat issue #${issue.number} acceptance criteria as the current implementation boundary: parent invariants remain binding, but explicitly deferred sibling work remains deferred. Run focused checks and type checking while editing; do not run the full suite, and do not invoke code review or another Pi agent: the orchestrator independently owns the one full-suite run and independent review at the final committed tip. This instruction overrides the implementation skill's default completion procedure for validation and review. Commit completed work with issue #${issue.number} in the commit message. Work autonomously without asking for confirmation. Do not push, create or merge a PR, or close issues; the orchestrator owns publication.`;
}

export function editingAgentPrompt(kind, {
  issue,
  resumed = false,
  reasonLog,
  reasons = [],
  evidencePath,
  failureFingerprint,
  failureRepeated = false,
}) {
  const policy = commonEditingPolicy(issue);
  if (kind === "implementation") {
    return `/skill:implement ${resumed ? "Continue and finish" : "Implement"} GitHub issue #${issue.number} (${issue.title}) on the current branch. ${policy} Use TDD where possible at the agreed public-process seam. Keep MDLM lifecycle-neutral and modules deep; simplify before implementation complexity fans out. Claiming has already been handled.`;
  }
  if (kind === "remediation") {
    return `/skill:implement Continue implementing GitHub issue #${issue.number} (${issue.title}) on the current branch. An independent validation pass failed; inspect ${reasonLog}. ${policy} Reproduce every finding at the narrowest agreed seam and fix its root cause. Prefer deleting accidental complexity over adding flags, callbacks, state, or compatibility layers.`;
  }
  if (kind === "diagnosis") {
    return `/skill:implement Diagnose and fix the repeatedly failing implementation of GitHub issue #${issue.number} (${issue.title}) on the current branch. Explicitly use the diagnosing-bugs method; the latest failed command validation, explicit VALIDATION: FAIL, or remote PR check in ${reasonLog} is the red-capable signal. ${policy} Generate ranked falsifiable hypotheses, reproduce each finding, repair the root cause, and clean up. Revert or redesign earlier work rather than layering patches.`;
  }
  if (kind === "simplification") {
    const trigger = reasons.length > 0 ? reasons.join("; ") : "independent review found disproportionate complexity";
    return `/skill:implement Simplify and finish GitHub issue #${issue.number} (${issue.title}) on the current branch. Explicitly apply codebase-design and grilling before editing, then choose the recommended boundary yourself and proceed without pausing for stakeholder confirmation. Complexity escalation was triggered by: ${trigger}. Inspect ${reasonLog}. ${policy} Preserve every current-ticket invariant while deleting accidental machinery, speculative generality, workflow state, recovery knobs, duplicated logic, and shallow interfaces. Prefer a smaller deep module and the existing public test seam; revert or replace prior work when cleaner.`;
  }
  if (kind === "contract-review") {
    return `/skill:implement Resolve a repeated complexity deadlock for GitHub issue #${issue.number} (${issue.title}) and finish it autonomously. Explicitly apply grilling, codebase-design, and diagnosing-bugs. Inspect ${reasonLog}. ${policy} First replace the implementation with a substantially simpler design that preserves the written contract. Only if a criterion itself forces disproportionate machinery, choose the smallest user-goal-preserving clarification. Never waive atomic publication, one canonical writer, package neutrality, harness neutrality, independent judgment, tests, or review. Record a clarification as an issue comment naming retained behavior, intentionally given-up behavior, and why it still satisfies the parent goal; do not rewrite history.`;
  }
  if (kind === "targeted-repair") {
    return `/skill:implement Repair the latest narrow failure for GitHub issue #${issue.number} (${issue.title}) on the current branch. Use the diagnosing-bugs method. The sole primary failure evidence is the durable artifact at ${evidencePath}; its stable fingerprint is ${failureFingerprint} and repeated=${failureRepeated ? "yes" : "no"}. ${policy} Reproduce that narrow signal, make the smallest root-cause repair, run focused tests and typecheck only, and commit. Do not inspect the historical issue log as primary evidence. You must not alter the issue contract or broadly redesign the implementation. Do not add speculative recovery or unrelated cleanup.`;
  }
  throw new Error(`Unknown editing action: ${kind}`);
}

export function independentReviewerPrompt(evidencePath) {
  return `Independently validate the implementation using the complete evidence packet at ${evidencePath}. Review two axes: Standards (repository instructions, glossary, ADRs, documented conventions, deep-module interfaces, and material code smells) and Spec (every active-ticket acceptance criterion, missing or incorrect behavior, negative scope, and scope creep). Treat the active child acceptance criteria as the current delivery boundary. Parent invariants remain authoritative, but do not demand a parent end-state or explicitly deferred sibling work in an earlier tracer bullet. Apply a delivery-biased gate: fail validation only for an unmet active acceptance criterion, a concrete correctness or safety defect in the delivered behavior, a regression, or violation of atomic publication, one canonical writer, package neutrality, harness neutrality, or independent judgment. Report module-depth preferences, cleanup opportunities, localized out-of-scope bugs, and future hardening as non-blocking follow-ups; they do not prevent VALIDATION: PASS. Request complexity escalation only for machinery that is actually unbounded or introduces a generic workflow engine, cross-owner transaction, scattered lifecycle state, or equivalent protected-architecture violation—not merely because a working tracer bullet is broad or could be refactored further. If behavior relies on an autonomous contract clarification, fail Spec unless an issue comment records retained behavior, intentionally given-up behavior, and its relationship to the parent goal. You have read-only tools only. Inspect repository files when useful. Report blocking findings and non-blocking follow-ups separately. Do not use either verdict marker anywhere else. End with exactly two lines: COMPLEXITY: OK unless a protected-architecture violation requires immediate simplification, otherwise COMPLEXITY: ESCALATE; then VALIDATION: PASS when there are no blocking findings, otherwise VALIDATION: FAIL.`;
}
