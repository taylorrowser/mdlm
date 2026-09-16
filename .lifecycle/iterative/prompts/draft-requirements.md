---
id: draft-requirements
version: 6
skills:
- skills/product-quality.md@1
- skills/typed-requirements.md@5
---

# Write one small requirement set

Apply the supplied shared product-quality skill before authoring or reviewing.

Read the stakeholder request. Write stakeholder and software REQ statements in one batch using the typed-requirements skill. Decompose behavior through ordinary links until software leaves are concrete enough to implement and verify. Include relevant state transitions, boundaries and failures without inventing obligations. The CLI generates the complete RQS grouping and the next independent Review judges the whole set.

Use the supplied direct proposal guidance and payload schema. The CLI supplies identities, exact required links and publication markers. Submit the authored values with mdlm proposal submit. Keep the body empty when the structured payload contains the whole claim.

Record the stakeholder request reference in source so a reviewer can recover the original intent.

Read the exact experiment in guidance.context and its relevant observations with `mdlm show <exact-revision> --json`. State the selected formal scope and the neighboring behavior that remains provisional. Start from stakeholder need or a useful prototype decision, then write fresh obligations. Record optional `informed-by` links to zero or more exact EXP/OBS revisions on each REQ, with rationale identifying what each origin contributed. Several requirements may share origins. A requirement may have no design predecessor. Keep replaceable implementation choices in exploration; do not turn all prototype behavior into requirements. Prior observations explain learning and do not replace current formal verification.

For interface-dependent behavior, add optional uses-interface links to exact ICD revisions. State the necessary obligations in the REQ itself; retain descriptive and provisional choices in the ICD. Adopting a changed ICD in accepted scope requires the normal approved requirement change and fresh applicable evidence.
