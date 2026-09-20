---
id: request-change
version: 2
skills:
- skills/product-quality.md@1
---

Describe the reason and requested outcome. Link `changes` to the exact baselined requirements whose meaning or decomposition must change. The CLI supplies the accepted baseline. Target software requirements when their parents remain correct. Submit the authored values; stakeholder approval of this exact proposal is required before any controlled revision.

Declare each new stakeholder root as an exact, distinct statement in `new_roots`. This approves one new root identity per statement and its new downward branches. Copy the statement exactly when first authoring that root; keep one obligation per requirement. A request solely adding new roots may omit `changes`; a request must have existing targets or nonempty `new_roots`. Omit `new_roots` when adding no stakeholder roots. Existing targets still control edits and retirement of existing requirements. Approval context includes the declaration.
