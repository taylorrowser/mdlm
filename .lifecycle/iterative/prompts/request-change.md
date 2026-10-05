---
id: request-change
version: 14
skills:
- skills/product-quality.md@8
---

Describe the reason and requested outcome. For existing scope, include one or more `changes` links. Copy each target as a distinct exact requirement revision ID from the accepted baseline, including for implementation-only maintenance. Target the affected software requirements when their parents remain correct. For a language rewrite, inspect that component's requirements and incorporated clauses and target affected commitments, including any stakeholder language constraint. Retain system, high-level, low-level and interface claims whose meaning stays valid; they still need fresh verification against the new product commit. Use implementation-only maintenance when no obligation changes. The CLI supplies the accepted baseline.

Targets define the scope to inspect for impact and the initial authoring frontier after approval. If a parent and known existing children each need changed commitments, include each as an exact baseline target in this request. Impact alone does not authorize revising descendants. Targeting a requirement does not require changing its meaning or decomposition. For an implementation change allowed by existing requirements, state that the obligations and decomposition remain unchanged. After approval, follow native revision guidance to preserve the same exact REQ and DCP revisions where appropriate.

When changing a shared normative definition, inspect requirements that cite it by clause, revision or title. Include dependents whose required inputs or outcomes change in the proposed scope, and state whether each citation binds an exact definition or the definition in the selected graph. Target inclusion does not require reauthoring an unchanged relationship.

Submit the authored values; stakeholder approval of this exact proposal is required before any controlled revision. Independent review still judges the revised requirements and decomposition.

Declare each new stakeholder root as an exact, distinct statement in `new_roots`. This approves one new root identity per statement and its new downward branches. Copy the statement exactly when first authoring that root; keep one obligation per requirement. A request solely adding new roots may omit `changes`; a request must have existing targets or nonempty `new_roots`. Omit `new_roots` when adding no stakeholder roots. Existing targets still control edits and retirement of existing requirements. Approval context includes the declaration.
