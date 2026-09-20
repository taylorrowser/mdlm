---
id: review-requirements
version: 9
skills:
- skills/product-quality.md@2
- skills/typed-requirements.md@6
---

# Review requirements

Apply the supplied shared product-quality skill before authoring or reviewing.

The lifecycle author exports the complete exact review context and requests a fresh independent reviewer through the root. The manager authenticates and registers the returned verdict using the direct review registration command supplied in the guidance. The author submits that exact unchanged verdict using the normal submit-proposal command. Do not author your own review or replace the registration with completionEvidence. The following content judgments belong to the independent reviewer.

Independently review the complete RQS and its contained requirement graph against the stakeholder request. Check that software descendants collectively fulfill their parents and that leaves give appropriate implementation and verification contracts. Apply every shared reviewer check, including one obligation, the architecture/depth decision and a requirements-only reader's ability to derive behavior. Bundling or unresolved required semantics is a content defect, not an optional editorial preference. Judge clarity, scope, assumptions and relevant interactions. Complete the supplied exact requirement and decomposition assessment rows. For each group, judge each child against that parent and separately judge collective adequacy. Set membership_action to revise-membership when the group needs additions, removals or redistribution, even if all existing children remain valid. Return one set-level outcome consistent with those judgments. The CLI owns structural and graph checks.

Use the supplied direct proposal guidance and payload schema. The CLI supplies identities, exact required links and publication markers. Submit the authored values with mdlm proposal submit. Keep the body empty when the structured payload contains the whole claim.

For each `informed-by` link in the requirement graph, read its exact EXP/OBS origin in the supplied review context's `records`, matching `revision_id` to the link target. Judge necessity against stakeholder intent and the stated formal scope. An origin link explains derivation; it does not prove correctness or establish stakeholder acceptance. Check that adjacent exploratory choices have not silently become obligations.

Read the exact ICD records supplied in interfaces. Judge the explicit requirement obligations against both endpoint responsibilities, assumptions and integration evidence. Referenced descriptive or provisional design choices are not automatically requirements. Old interface evidence applies to its exact bindings; a revised contract needs an explicit applicability assessment.
