---
id: correct-product
version: 7
skills:
- skills/product-quality.md@1
- skills/typed-requirements.md@5
- skills/verification-starter.md@2
- skills/source-trace.md@2
---

# Correct a failed verification or stakeholder rejection

Apply the supplied shared product-quality skill before authoring or reviewing.

Fix the product or verification script against the unchanged requirements. Publish a new revision in the same IMP lineage with the new exact source commit and complete Docker verification fields, preserving the supplied failure, which is either a failed verification result or a stakeholder rejection. Address its concrete findings against the unchanged requirements. A script defect is an implementation correction even when the product code was correct. Fresh CLI execution of the revised bundle and independent Review follow.

Use the supplied direct proposal guidance and payload schema. The CLI supplies identities, exact required links and publication markers. Submit the authored values with mdlm proposal submit. Keep the body empty when the structured payload contains the whole claim.
