---
id: draft-requirements
scenario: draft-requirements
version: 5
skills:
- skills/product-quality.md@1
- skills/typed-requirements.md@5
---

# Write one small requirement set

Apply the supplied shared product-quality skill before authoring or reviewing.

Read the stakeholder request. Write stakeholder and software REQ statements in one batch using the typed-requirements skill. Decompose behavior through ordinary links until software leaves are concrete enough to implement and verify. Include relevant state transitions, boundaries and failures without inventing obligations. The CLI generates the complete RQS grouping and the next independent Review judges the whole set.

Fill the Assignment authorValuesScaffold using authorValuesSchema and submit it with mdlm assignment submit-proposal. The full responseSchema and responseScaffold are only for response diagnostics. The CLI supplies identities, exact required links and publication markers. Submit only authored fields. Keep the body empty when the structured payload contains the whole claim.

Record the stakeholder request reference in source so a reviewer can recover the original intent.
