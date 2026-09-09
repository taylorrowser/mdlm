---
status: superseded
---

# Start tiny products with one requirement level

Superseded on 2026-09-09 by the tiny 0.3.0 requirement-graph workflow described
in [Tiny products first](../agents/mdlm-development.md#tiny-products-first).
Each stakeholder or software statement is an individual REQ, with normal links
to exact parent revisions for useful decomposition instead of a fixed level
limit. CLI-managed batching and generated source scopes preserve one set-level
review and the direct implementation and verification route. The rationale and
execution description below record the earlier package, not current guidance.

The default Process Package for tiny products keeps intent, software commitments,
and acceptance examples in one requirement set, followed by implementation,
executable verification, independent content review, and stakeholder acceptance.
The earlier V-model route made tiny products repeat decomposition and assurance
work while malformed or incorrect expectations still survived review. We choose
a smaller package so we can fix delivery and correction failures before adding
distinct requirement levels or planning artifacts.

The harness executes the declared cases and captures observations. The CLI rejects
mechanically invalid submissions and inconsistent expected/actual results before
atomic publication; it does not authenticate the claimed execution. Agents review
semantic adequacy and correctness. Corrections preserve failed
revisions and evidence while reopening affected work. Exact identity, independent
judgment, and no-replay guarantees remain; lifecycle structure stays in the
Process Package under ADR-0002.

The tiny package omits the earlier package's baseline and phase gates. Historical
V-model evidence remains tied to its original package. Add new breadth when
reliable short runs reveal a distinct need.
