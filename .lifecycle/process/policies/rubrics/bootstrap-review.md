---
id: bootstrap-review
version: 1
---

# Bootstrap review policy

## Applicability

Every PSP, STK, and SYS revision is reviewed individually. Every frozen candidate
BSL is reviewed; review-context and accepted BSLs are not. A DEC is reviewed when
it changes scope, waives or defers work, disposes of a datum, or signs off a gate.
REV and QST do not require their own REV.

## Universal rubric

A passing subject must have valid identity, schema, provenance, and links; no
primary blocking findings; clear and internally consistent content; fidelity to
its exact parents and applicable decisions; no unjustified scope; and no hidden
unresolved question.

## Type checks

- **PSP:** coherent problem, users, goals, non-goals, scope, constraints, and
  measurable success without premature implementation detail.
- **STK:** one stakeholder-visible commitment, verification intent, rationale,
  and exact PSP derivation; no prescribed design.
- **SYS:** one solution-independent behavior or constraint, verification intent,
  rationale, authorized STK derivation, and no coverage duplication.
- **BSL candidate:** exact complete membership, separated evidence, valid hashes
  and resolved links, complete member reviews, coherent role/scope, and no
  blocking QST.
- **DEC:** alternatives and rationale proportionate to consequence, exact scope,
  valid evidence links, and no authority beyond the recorded decision.

## Findings and outcome

Findings target exact revisions. `blocking` is used for a defect preventing use;
`needs-triage` for collateral concerns; `advisory` for non-blocking improvement.
Any unresolved primary blocking finding requires `fail`. A cancelled review gives
no reusable evidence. Completed REVs are immutable.
