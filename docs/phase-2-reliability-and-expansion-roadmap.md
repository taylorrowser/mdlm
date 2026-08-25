# Phase 2 reliability and lifecycle expansion roadmap

## Goal

First make the bundled Example Process Package reliable through Phase 2 under sustained public operation. As soon as that gate is met, expand the package through the remaining V-model phases using the operational evidence from Phases 0–2 and the accepted v0.8 design baseline.

This is an active product goal, not a claim that Phases 3–6 are implemented.

## Design baseline

The tracked baseline is [`mdlm-process-overview-v0.8.md`](mdlm-process-overview-v0.8.md). Part II describes:

- Phase 0 — Wayfinding;
- Phase 1 — Product assurance;
- Phase 2 — System definition;
- Phase 3 — Component definition;
- Phase 4 — Design definition;
- Phase 5 — Implementation and formal-verification implementation;
- Phase 6 — Verification; and
- a separate change flow, represented by Phase 7 in the current package.

The overview remains historical design evidence rather than operating instructions. The current Process Package is normative for execution. [`mdlm-v0.8-implementation-conformance.md`](mdlm-v0.8-implementation-conformance.md) records the implemented boundary, and [ADR 0002](adr/0002-keep-lifecycle-structure-out-of-mdlm-core.md) keeps this lifecycle structure in the Example Process Package rather than MDLM core.

The package manifest names a v0.7 overview as provenance, but that source is not tracked in the repository or visible in repository history. If recovered, preserve it as an earlier input; do not replace the accepted v0.8 baseline with it.

## Phase 2 reliability gate

Phase 2 is reliable when exact operational evidence establishes all of the following:

1. At least two distinct fresh product lanes, using the same reviewed source, artifacts, Process Package, runner, and qualification harness, progress from initialization through Phase 2 to `Profile Boundary Reached`, `Lifecycle Complete`, or another truthful package-declared terminal outcome.
2. They do so through supported public operation without manual Lifecycle Data edits, replay of accepted Scenarios, unauthenticated trust changes, or unreviewed publication repair.
3. Every deterministic Phase 0–2 kernel, Process Package, runner, and orchestration blocker found by those lanes is classified, linked to exact evidence, fixed narrowly, and exercised again in a fresh or safely resumable operation.
4. Public target, qualification, Review, RUN/RES, authority, Git, package, and snapshot provenance remains reconstructable from immutable evidence.
5. The portfolio records cycle time, attention points, correction loops, review volume, publication recovery, and terminal classification for each lane.

Passing focused tests is necessary for a fix but does not satisfy this gate. Complete public operation does.

## Expansion sequence

Begin expansion immediately after the reliability gate. Implement the smallest complete operational slice of one phase at a time:

1. **Phase 3 — Component definition.** Decompose accepted system definition into reviewable component boundaries and requirements.
2. **Phase 4 — Design definition.** Produce and review component designs with exact upstream traceability.
3. **Phase 5 — Implementation.** Bind implementation work and formal-verification implementations to accepted design and authority.
4. **Phase 6 — Verification.** Execute independent formal verification, preserve evidence, resolve failures, and produce terminal lifecycle outcomes.
5. **Phase 7 — Change control.** Preserve the current package-owned change flow across the expanded lifecycle and extend it only from observed change operations.

For each phase:

- author behavior in the declarative Process Package before considering core changes;
- preserve stakeholder intent at the highest useful level and allocate technical detail downward;
- implement one end-to-end tracer slice before adding breadth;
- start fresh operational lanes as soon as that slice is executable;
- use observed failures to choose the next selector, obligation, scenario, authority, correction, and terminal behavior;
- retain only focused tests for observed failures and changed high-risk boundaries; and
- continue each lane through the complete selected profile rather than stopping at phase entry.

## Decision rule

Operational evidence decides the expansion details. The v0.8 overview supplies vocabulary, phase intent, and invariants; it does not override behavior learned from current public runs. Material changes to authority, lifecycle semantics, or the core/package boundary require an ADR. Package-local sequencing and scenario detail should evolve through reviewed package changes and fresh demonstrations.
