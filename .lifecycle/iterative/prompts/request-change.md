---
id: request-change
version: 8
skills:
- skills/product-quality.md@5
---

Describe the reason and requested outcome. For existing scope, include one or more `changes` links. Copy each target as a distinct exact requirement revision ID from the accepted baseline, including for implementation-only maintenance. Target the affected software requirements when their parents remain correct. The CLI supplies the accepted baseline.

Targets define the scope to inspect for impact and the initial authoring frontier after approval. If a parent and known existing children each need changed commitments, include each as an exact baseline target in this request. Impact alone does not authorize revising descendants. Targeting a requirement does not require changing its meaning or decomposition. For an implementation change allowed by existing requirements, state that the obligations and decomposition remain unchanged. After approval, follow native revision guidance to preserve the same exact REQ and DCP revisions where appropriate.

Submit the authored values; stakeholder approval of this exact proposal is required before any controlled revision. Independent review still judges the revised requirements and decomposition.

Declare each new stakeholder root as an exact, distinct statement in `new_roots`. This approves one new root identity per statement and its new downward branches. Copy the statement exactly when first authoring that root; keep one obligation per requirement. A request solely adding new roots may omit `changes`; a request must have existing targets or nonempty `new_roots`. Omit `new_roots` when adding no stakeholder roots. Existing targets still control edits and retirement of existing requirements. Approval context includes the declaration.
