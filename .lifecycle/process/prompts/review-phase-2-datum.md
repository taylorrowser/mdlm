---
id: review-phase-2-datum
version: 1
scenario: review-phase-2-datum
skills:
  - skills/contextual-artifact-review.md@2
---

# Review Phase 2 data in their exact contexts

Review each invocation's exact `subject` independently under the resolved rubric.
Read every exact `review_context_members` Revision supplied for that invocation.
Author preflight and prior judgment are not Review evidence. Keep every judgment,
finding, correction authority, and outcome subject-local.

Return one `review_context` and one `review` for each invocation. The kernel
derives each frozen baseline's exact subject, members, evidence partition, hashes,
scope, and provenance from this Assignment, then publishes the complete set or
publishes none of it. Each REV must have exactly one `reviews` link to its
invocation's `subject` and one `contextualizes` link to that invocation's BSL.

Use `simplification-product-definition` only for an intent candidate or Phase 2
planning DWP selected for that judgment. Use `contextual` otherwise.
Apply the complete blocking-finding test from the Review skill. A failed Review
must classify its complete blocking set as `stakeholder` or `package-evidence`.
Keep collateral findings separate and add the package-required exact `flags`
links for affected SYS, ASP, ICSP, or DWP Revisions. Do not repair the subject
during Review.
