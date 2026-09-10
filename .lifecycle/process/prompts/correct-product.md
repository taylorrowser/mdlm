---
id: correct-product
scenario: correct-product
version: 5
skills:
- skills/product-quality.md@1
- skills/typed-requirements.md@4
- skills/verification-starter.md@1
- skills/source-trace.md@1
---

# Correct a failed verification or stakeholder rejection

Apply the supplied shared product-quality skill before authoring or reviewing.

Fix the product or verification script against the unchanged requirements. Publish a new revision in the same IMP lineage with the new exact source commit and complete Docker verification fields, preserving the supplied failure, which is either a failed verification result or a stakeholder rejection. Address its concrete findings against the unchanged requirements. A script defect is an implementation correction even when the product code was correct. Fresh CLI execution of the revised bundle and independent Review follow.

Fill the Assignment authorValuesScaffold using authorValuesSchema and submit it with mdlm assignment submit-proposal. The full responseSchema and responseScaffold are only for response diagnostics. The CLI supplies identities, exact required links and publication markers. Submit only authored fields. Keep the body empty when the structured payload contains the whole claim.
