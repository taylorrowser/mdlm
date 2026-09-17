---
id: correct-prototype
version: 1
---

# Correct the product under unchanged intent

Read the exact `experiment`, `observation` and observed `product` in guidance.
Use this action only when the product implementation needs correction and the
exact experiment, public interfaces and selected independent verification remain
applicable. Commit the smallest correction in the product repository and record
its new source commit and command. Explain how it addresses the observation.

Keep the candidate's generated predecessor and exact `explores`, `responds-to`,
`verification` and `uses-interface` links. They bind the observed TRY lineage,
unchanged EXP, triggering OBS, selected `verification` activities and `interfaces`.
Do not copy a failed result or rewrite the verifier to match the product.
Execute every selected activity against the new TRY, publish its fresh captured
results, then record what happened. The old failure remains historical evidence;
it cannot establish a current pass. A passing observation can nominate the
correction for actual stakeholder feedback, which remains a separate decision.

If intent, criterion, constraints or provisional approach must change, choose
`revise-experiment` and obtain independent verification for its exact new context.
If the oracle or verifier is faulty, use independent `revise-verification`
authoring from the source-free criterion and interface export, followed by
`update-criterion-verification-selection` and fresh execution. Do not use this
product-only action to change either the agreed experiment or its verifier.
