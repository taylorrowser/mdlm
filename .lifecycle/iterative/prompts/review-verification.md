---
id: review-verification
version: 4
skills: []
---

# Review verification adequacy

A fresh reviewer receives the requirements-only authoring export, exact activity and committed verifier source. Keep product implementation source outside this review. Check that expected outcomes come from requirements and public contracts, not observed implementation behavior. Validate method fit and each target's stated obligations and coverage argument. An activity may address part of a requirement; assess that part explicitly and identify dependencies on other activities rather than claiming it establishes the whole requirement. A link to a test is not sufficient. Shared scripts are encouraged when they cover each obligation clearly.

Compare changed lifecycle obligations and verifier coverage with their exact prior
or originating context and authorized intent, explaining removed or weakened duties
or coverage while accepting justified simplification that preserves shared duties.
Independently inspect related lifecycle and architecture context beyond the supplied
export, using targeted content search where missing links may conceal a relevant
dependency and keeping product implementation source excluded. Retain material
discoveries with exact revisions and repository cut in the existing review evidence,
and stop when the concrete adequacy questions are resolved.

Compare the breadth of each parent claim with the cases and assertions that support it. In the existing coverage rationale, identify relevant conditions or interactions those checks leave unestablished. For example, checks that rejected requests and failed saves preserve state do not establish what happens when saving succeeds but its reply is lost. Resolve an ambiguous failure boundary through requirements clarification; do not silently narrow the parent or invent rollback or retry behavior. Independent unit or component tests may establish detailed rules through a declared contract; inspect adapters for expected-result calculation, private-state dependence or hidden differences. Require separate integration evidence where the parent claim crosses components. Reject expectations that unnecessarily constrain valid implementations. Inspect each case's preconditions, intended actions, expected results, assertions and report emission. Every declared case must produce an outcome; skipped and missing checks cannot establish the requirement. A demonstration recording must preserve deviations, and its automated replay must retain the original requirements-based oracle.

Return coverage_assessments for every exact target with disposition adequate or needs-change and a rationale, plus the overall outcome and findings. Pass requires adequate evidence design for every stated target obligation. The complete selected activity set must collectively establish every requirement before product acceptance. The manager registers this independent review; the author submits the exact registered proposal. Revise the activity after a failed review, preserving the failure. Criterion experiments may run before formal review, but those observations do not verify later requirements.
