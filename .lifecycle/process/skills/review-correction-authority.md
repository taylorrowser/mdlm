---
id: review-correction-authority
version: 1
---

# Review correction authority

Classify the complete blocking finding set for every failed Review.

Use `correction_authority: package-evidence` only when the exact supplied Process
Package evidence determines a truthful correction without choosing or changing
stakeholder-owned intent. Examples include repairing a schema defect, restoring
required traceability, or reconciling wording to an exact parent or reviewed
Decision.

Use `correction_authority: stakeholder` when resolving any blocker requires a
new choice about stakeholder-owned behavior, scope, priority, deferral, removal,
retention, or acceptable tradeoffs. Exact package evidence may reveal the gap,
but it does not supply the missing judgment. If different truthful corrections
would make materially different stakeholder commitments, the correction is
stakeholder-owned.

Classify the whole failed Review as `stakeholder` when even one blocking finding
needs that judgment. Never infer `package-evidence` from omission, reviewer
confidence, or the availability of an autonomous Correction Scenario. A failed
Review without this classification is incomplete.
