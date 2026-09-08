---
id: correct-product
scenario: correct-product
version: 1
---

# Correct a product verification failure

Fix the implementation against the unchanged requirements. Publish a new revision in the same IMP lineage with the new exact source commit, preserving the failed result. Rerun all acceptance cases before independent Review.

Fill the Assignment authorValuesScaffold using authorValuesSchema and submit it with mdlm assignment submit-proposal. The full responseSchema and responseScaffold are only for response diagnostics. The CLI supplies identities, exact required links and publication markers. Submit only authored fields. Keep the body empty when the structured payload contains the whole claim.
