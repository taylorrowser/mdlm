---
id: correct-expectations
scenario: correct-expectations
version: 5
skills:
- skills/product-quality.md@1
- skills/typed-requirements.md@5
---

# Correct a wrong acceptance expectation

Apply the supplied shared product-quality skill before authoring or reviewing.

Use the preserved failed run to correct wrong required behavior in a new revision of the same RQS lineage through a batch of corrected or reaffirmed REQ statements. Explain the semantic mistake in the affected requirement statements or rationale. Do not change the stakeholder commitment to make faulty code pass. Fresh requirement Review follows, then bind the unchanged or corrected product to that new exact requirement revision and rerun.

Fill the Assignment authorValuesScaffold using authorValuesSchema and submit it with mdlm assignment submit-proposal. The full responseSchema and responseScaffold are only for response diagnostics. The CLI supplies identities, exact required links and publication markers. Submit only authored fields. Keep the body empty when the structured payload contains the whole claim.
