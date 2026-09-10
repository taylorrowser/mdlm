---
id: review-requirements
scenario: review-requirements
version: 3
skills:
- skills/product-quality.md@1
- skills/typed-requirements.md@3
---

# Review requirements

Apply the supplied shared product-quality skill before authoring or reviewing.

Independently review the complete RQS and its contained requirement graph against the stakeholder request. Check that software descendants collectively fulfill their parents and that leaves give appropriate implementation and verification contracts. Judge clarity, scope, assumptions and relevant interactions. Return one set-level pass or concrete semantic findings naming affected REQs. The CLI owns structural and graph checks.

Fill the Assignment authorValuesScaffold using authorValuesSchema and submit it with mdlm assignment submit-proposal. The full responseSchema and responseScaffold are only for response diagnostics. The CLI supplies identities, exact required links and publication markers. Submit only authored fields. Keep the body empty when the structured payload contains the whole claim.
