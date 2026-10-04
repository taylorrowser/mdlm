---
id: correct-requirements-after-review
version: 23
skills:
- skills/product-quality.md@8
- skills/typed-requirements.md@19
---

# Correct requirements after set or implementation Review

Apply the supplied shared product-quality skill before authoring or reviewing.

Revise the same requirement-set lineage to address the exact failed Review. For each finding, correct the requirement when the stakeholder outcome or another component's contract needs it. When the finding concerns a case the stakeholder's use cannot reach or a caller that does not exist, prefer narrowing the requirement or interface so the case is refused, and record findings the stakeholder declines in the correction rationale. Keep stakeholder intent unless the stakeholder authorizes a change. Preserve prior evidence. The new revision receives a fresh independent Review.

Use the supplied direct proposal guidance and payload schema. The CLI supplies identities, exact required links and publication markers. Submit the authored values with mdlm proposal submit. Keep the body empty when the structured payload contains the whole claim.

A failed Review of the current implementation can expose an incorrect requirement after its set Review passed. Correct only the exact requirements marked needs-change in requirement_assessments and the supplied authoring frontier. Coverage or source assessments describe evidence problems and grant no requirement-edit permission. Preserve the exact failed Review in corrects. A finding outside approved change scope needs scope amendment and fresh stakeholder approval before editing. After correction, obtain a fresh independent requirements Review, then rebind the implementation and select current independent verification activities and execution evidence. Old passing evidence cannot close the changed selection.
