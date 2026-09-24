---
id: review-requirements
version: 17
skills:
- skills/product-quality.md@5
- skills/typed-requirements.md@11
---

# Review requirements

Apply the supplied shared product-quality skill before authoring or reviewing.

The lifecycle author exports the complete exact review context and requests a fresh independent reviewer through the root. The manager authenticates and registers the returned verdict using the direct review registration command supplied in the guidance. The author submits that exact unchanged verdict using the normal submit-proposal command. Do not author your own review or replace the registration with completionEvidence. The following content judgments belong to the independent reviewer.

Independently review the complete RQS and its contained requirement graph against the stakeholder request. Check that software descendants collectively fulfill their parents and that leaves give appropriate implementation and verification contracts. Apply every shared reviewer check, including one obligation, the architecture/depth decision and a requirements-only reader's ability to derive behavior. Bundling or unresolved required semantics is a content defect, not an optional editorial preference. Judge clarity, scope, assumptions and relevant interactions. Complete the supplied exact requirement and decomposition assessment rows. The CLI owns structural and graph checks.

Each DCP assessment concerns its exact parent and immediate children. Judge each child's validity against that parent separately from their collective adequacy. For a group marked `needs-change`, identify a parent requirement or immediate child assessment marked `needs-change`, or set `membership_action` to `revise-membership` when additions, removals or redistribution are needed, even if all existing children remain valid. Record deeper descendant defects in their owning assessments. Keep an ancestor group `adequate` when its immediate decomposition is sufficient; any defect in its own parent, children or membership still needs an explicit correction target. Return one set-level outcome consistent with all assessments: adequate ancestor groups can coexist with a failing outcome for descendant defects.

Use the supplied direct proposal guidance and payload schema. The CLI supplies identities, exact required links and publication markers. Submit the authored values with mdlm proposal submit. Keep the body empty when the structured payload contains the whole claim.

For each `informed-by` link in the requirement graph, read its exact EXP/OBS origin in the supplied review context's `records`, matching `revision_id` to the link target. Judge necessity against stakeholder intent and the stated formal scope. An origin link explains derivation; it does not prove correctness or establish stakeholder acceptance. Check that adjacent exploratory choices have not silently become obligations.

Read the exact ICD records supplied in interfaces. Apply typed-requirements' normative ownership rule: assess the applicable stable clauses named by each owning REQ, and report required behavior found only in rationale or without an explicit owner. Judge those obligations against both endpoint responsibilities, assumptions and integration evidence. Referenced descriptive or provisional design choices are not automatically requirements. Old interface evidence applies to its exact bindings; a revised contract needs an explicit applicability assessment.
