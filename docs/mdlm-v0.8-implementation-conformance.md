# MDLM v0.8 implementation conformance

- **Status:** Completed concept-validating profile with contracted operator interface
- **Historical design baseline:** [`mdlm-process-overview-v0.8.md`](mdlm-process-overview-v0.8.md)
- **Implementation package:** `mdlm-bootstrap@0.105.0`
- **Reviewed expansion recommendation:** `change`

## Purpose

This report records what the repository demonstrates after the clean-interface
contraction. It does not rewrite the historical v0.8 design evidence or claim a
production-complete product.

The completed profile validates a process-neutral declarative kernel, one `mdlm`
product surface, a Markdown-authoritative Lifecycle Data repository, atomic
Scenario Proposal submission, and a bounded Example Process Package through
Phases 0–2 and one narrow accepted-SYS to reviewed-component-gate Phase 3 tracer.

## Conformance boundary

The supported public seams are:

- `loadProcessPackage(path)` for exact Process Package loading and validation;
- `resolveType(package, typeId)` for the kernel Datum Envelope and complete
  Payload Template projection;
- `evaluateLifecycle(package, snapshot)` for deterministic package evaluation;
- `mdlm init`, `status`, `next`, `scenario prepare`, `scenario submit`, and
  `doctor` for normal operation;
- package-neutral read-only inspection, package validation and fixture testing,
  exact baseline verification and diff, and evaluator projections through `mdlm`;
- supported exact Process Package migration; and
- ordinary Git for diff review and transaction history.

Initialization establishes the bundled exact package and clean Git boundary.
Normal Scenario-owned Lifecycle Data crosses only the validated
`scenario submit` boundary. Preparation is side-effect-free and harness-neutral;
the harness performs agent work or attended conversation and returns a complete
Assignment Response.

Conformance does not mean regulatory qualification, production hardening, a
complete software V-model package, or implementation of breadth explicitly
deferred by the reviewed Pilot Assessment.

## Implementation trace

| v0.8 concern | Tracer issues | Executable evidence |
| --- | ---: | --- |
| Textual, typed, terminating expressions | #15–#20 | `test/textual-expression.test.ts`, `test/mdlm-process-expression.test.ts` |
| Package types, templates, links, capabilities, and graph validation | #21–#24 | `test/load-process-package.test.ts`, `test/resolve-type.test.ts`, `test/kernel-capability.test.ts` |
| Relations, dependency changes, States, Obligations, phases, blockers, Dispatchability, and explanations | #25–#31 | `test/dependency-changes.test.ts`, `test/evaluate-*.test.ts`, `test/mdlm-lifecycle.test.ts` |
| Bundled initialization, exact package selection, inspection, validation, and compatible migration | #32–#35, #54, #84, #104 | `test/mdlm-init.test.ts`, `test/mdlm-command-application.test.ts`, `test/mdlm-process-migration.test.ts`, `test/mdlm-schema.test.ts` |
| Markdown-authoritative repository, lineage, links, exact baselines, diff, and rebuild | #36–#40, #104 | `test/mdlm-assignment.test.ts`, `test/dependency-changes.test.ts` |
| Exact Assignment preparation, typed inability, bounded malformed-response correction, atomic submission, provenance, and protected Authority Evidence | #41–#43, #71, #87, #90, #104 | `test/mdlm-assignment.test.ts`, `test/operator-outcome.test.ts` |
| Operator Outcome classification and explicit stop behavior | #89–#90, #100 | `test/operator-outcome.test.ts`, `test/mdlm-clean-onboarding-transaction.test.ts` |
| Phase 0 wayfinding, Correction, reviewed intent, gate rejection, and same-gate return | #44, #64, #92–#95 | `test/phase-0-hardening-routes.test.ts`, `test/evaluate-bootstrap-participation.test.ts` |
| Phase 1 assurance, exact target evidence, bounded Correction, fresh pilot evidence, and ambiguity boundaries | #45, #65–#66, #74–#76, #97 | `test/phase-1-hardening-routes.test.ts`, `test/phase-1-route-contracts.test.ts` |
| Phase 2 decomposition, exact-set simplification, Correction, candidates, acceptance, and progression | #46, #98–#99 | `test/phase-2-hardening-routes.test.ts`, `test/phase-hardening-domain-contracts.test.ts` |
| Narrow Phase 3 component definition, coherent-set Review, direct candidate, reviewed gate, and explicit profile boundary | #526 | `test/phase-3-component-definition-public.test.ts` |
| Accepted STK/shared-SYS change, serial consumer replacement, selective reuse, and closure | #47, #101–#102 | `test/change-and-pilot-hardening-routes.test.ts`, `test/evaluate-shared-system-change.test.ts` |
| Durable PAS, bounded Correction, reviewed Expansion Decision, and explicit terminal outcomes | #48, #68, #100 | `test/mdlm-pilot-assessment.test.ts`, `test/change-and-pilot-hardening-routes.test.ts`, `test/operator-outcome.test.ts` |
| Continuous package-neutral pi operation and harness-owned authority handling | #69, #72, #104 | `test/pi-operator-instructions.test.ts`, `test/mdlm-assignment.test.ts`, `test/operator-outcome.test.ts` |
| Fresh public transaction and compositional hardening proof | #70, #103–#104 | `test/mdlm-clean-onboarding-transaction.test.ts`, `test/phase-hardening-matrix.test.ts` |

The suite supplies overlapping evidence rather than treating this table as one
test per requirement. The route registry in
[`phase-hardening-matrix.yaml`](phase-hardening-matrix.yaml) names exact behavioral
assertions and is not runtime process state.

## Operator and publication invariants

- `mdlm status` observes current truth without allocating work.
- `mdlm next` returns either a transient `publication-required` kernel boundary
  or exactly one versioned Operator Outcome, and leases only an exact Assignment
  that can advance.
- `scenario prepare` binds the Assignment to exact Git, repository, package,
  prompt, skill, input, participation, output, and completion evidence without
  publishing Lifecycle Data.
- The harness may perform autonomous work, obtain fresh package-delegated
  judgment, or conduct the exact projected attended conversation. MDLM does not
  infer authority from natural language.
- Authority Supply permits publication but does not satisfy an Obligation. The
  Scenario's exact REV or DEC is durable Authority Evidence.
- Every Scenario Proposal output, link, identity, baseline finalization, and
  completion condition validates before one atomic transaction publishes.
- Typed inability and rejected responses publish nothing. One malformed response
  may be corrected against the same Assignment; the second exhausts it.
- Scenario submission is the canonical writer for normal Scenario-owned Lifecycle
  Data. Ordinary Git remains outside the kernel after initialization.
- `doctor` validates authoritative Markdown and rebuilds disposable projections;
  generated indexes are not correctness inputs.

## Package and evaluator invariants

- The kernel owns the Datum Envelope, Stable Datum and Revision identity,
  immutability, hashing, graph storage, primitive Relations, transactions, and
  deterministic evaluation.
- Packages own payload vocabulary, links, Selectors, Policies, Computed States,
  Obligations, Scenarios, phases, prompts, skills, participation, and terminal
  profile conditions.
- Generic source recognizes no bootstrap lifecycle type, phase, Scenario, pilot
  metric, or expansion recommendation.
- Textual `mdlm-expression@1` is the package authoring representation; arbitrary
  code is not process logic.
- Protected Authority-Evidence Types derive from exact selected-package Scenario
  contracts. Repository validation requires their matching completed Scenario
  transactions.
- Exact baseline comparison reports structural change; package Policy decides
  whether evidence is Stale.
- Accepted Requirement Revision maturity comes from exact Accepted Baseline
  membership, never Review alone.
- Qualification, pilot, and formal evidence remain distinct. Pilot evidence cannot
  promote itself into formal verification evidence.
- Failed Revisions and Reviews remain immutable. Package-owned Correction creates
  causal same-lineage replacements, fresh context, and fresh judgment while
  retaining materially unaffected exact evidence.

## Outcomes and clean proof

The selected Process Package derives all six Operator Outcomes:

- Assignment;
- Attention Required;
- Profile Boundary Reached;
- Lifecycle Complete;
- Process Dead End; and
- Invalid.

Profile Boundary Reached and Lifecycle Complete are exact successful conditions,
not empty queues. Process Dead End reports unfinished supported work with no route
forward. Invalid reports package or repository integrity failure and exits
nonzero.

Issue #103 established the exact-head clean-pilot proof and phase-hardening
matrix. Issue #104 contracts that proof to the one `mdlm` product interface.
Current package validation and fixture gates run through `dist/mdlm.js`; the fresh
transaction uses init, next, prepare, submit, doctor, Lifecycle Data diff, ordinary
Git commit, and exact subsequent Assignment preparation. See
[`clean-pilot-103.md`](clean-pilot-103.md).

## Pilot outcome and limits

The [zero-to-assessment report](zero-to-assessment-pilot.md) preserves the stopped
historical repository's immutable observations and composes repaired routes at the
current public seam. The final Pilot Assessment records useful Loose Ends,
selective evidence reuse and Staleness explanations, sufficient environment
profiles, and successful supported/unsupported discrimination. It also records
high Review/gate ceremony and no demonstrated scope reduction. The exact Expansion
Decision therefore adopts `change`, not `proceed`.

The following remain outside the completed profile:

- component pilot and formal CMP verification, plus Phase 4–6 package definitions and outputs;
- production graph indexing before repository measurements justify it;
- broader concurrency profiles;
- source-isolation containers;
- brownfield retrofit support;
- formal regulatory-compliance claims; and
- broader package Policy and telemetry questions retained in
  `.lifecycle/process/OPEN-QUESTIONS.md`.

Future work begins from the reviewed `change` Decision rather than silently
expanding package breadth or moving package vocabulary into the kernel.
