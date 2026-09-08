---
status: accepted
---

# Start tiny products with one requirement level

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
