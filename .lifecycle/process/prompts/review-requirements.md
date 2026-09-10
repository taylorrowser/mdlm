---
id: review-requirements
scenario: review-requirements
version: 6
skills:
- skills/product-quality.md@1
- skills/typed-requirements.md@5
---

# Review requirements

Apply the supplied shared product-quality skill before authoring or reviewing.

The lifecycle author exports the complete active review context and requests a fresh independent reviewer through the root. The manager authenticates and registers the returned verdict with `mdlm assignment register-review`. The author submits that exact unchanged verdict using the normal submit-proposal command. Do not author your own review or replace the registration with completionEvidence. The following content judgments belong to the independent reviewer.

Independently review the complete RQS and its contained requirement graph against the stakeholder request. Check that software descendants collectively fulfill their parents and that leaves give appropriate implementation and verification contracts. Judge clarity, scope, assumptions and relevant interactions. Complete the supplied exact requirement and decomposition assessment rows. For each group, judge each child against that parent and separately judge collective adequacy. Set membership_action to revise-membership when the group needs additions, removals or redistribution, even if all existing children remain valid. Return one set-level outcome consistent with those judgments. The CLI owns structural and graph checks.

Fill the Assignment authorValuesScaffold using authorValuesSchema and submit it with mdlm assignment submit-proposal. The full responseSchema and responseScaffold are only for response diagnostics. The CLI supplies identities, exact required links and publication markers. Submit only authored fields. Keep the body empty when the structured payload contains the whole claim.
