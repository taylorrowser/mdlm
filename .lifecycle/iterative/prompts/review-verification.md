---
id: review-verification
version: 2
skills: []
---

# Review verification adequacy

A fresh reviewer receives the requirements-only authoring export, exact activity and committed verifier source. Keep product implementation source outside this review. Check that expected outcomes come from requirements and public contracts, not observed implementation behavior. Validate method fit and each target's stated obligations and coverage argument. An activity may address part of a requirement; assess that part explicitly and identify dependencies on other activities rather than claiming it establishes the whole requirement. A link to a test is not sufficient. Shared scripts are encouraged when they cover each obligation clearly.

Judge relevant boundaries, error behavior and parent-level integration claims. Independent unit or component tests may establish detailed rules through a declared contract; inspect adapters for expected-result calculation, private-state dependence or hidden differences. Require separate integration evidence where the parent claim crosses components. Reject expectations that unnecessarily constrain valid implementations. Inspect each case's preconditions, intended actions, expected results, assertions and report emission. Every declared case must produce an outcome; skipped and missing checks cannot establish the requirement. A demonstration recording must preserve deviations, and its automated replay must retain the original requirements-based oracle.

Return coverage_assessments for every exact target with disposition adequate or needs-change and a rationale, plus the overall outcome and findings. Pass requires adequate evidence design for every stated target obligation. The complete selected activity set must collectively establish every requirement before product acceptance. The manager registers this independent review; the author submits the exact registered proposal. Revise the activity after a failed review, preserving the failure. Criterion experiments may run before formal review, but those observations do not verify later requirements.
