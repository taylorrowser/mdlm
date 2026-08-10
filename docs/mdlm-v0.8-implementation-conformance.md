# MDLM v0.8 implementation conformance

- **Status:** Completed concept-validating implementation profile
- **Design baseline:** [`mdlm-process-overview-v0.8.md`](mdlm-process-overview-v0.8.md)
- **Implementation package:** `mdlm-bootstrap@0.50.0`
- **Expansion decision:** `change`

## Purpose

This report closes the implementation program tracked by GitHub issue #14 and
tracer issues #15–#48. It records what the repository demonstrates now without
rewriting the accepted v0.8 overview's historical evidence labels or claiming a
production-complete product.

The completed profile validates a process-neutral declarative kernel, generic
command surface, durable Markdown repository, atomic Scenario publication, and
a bounded Example Process Package through Phases 0–2, localized change control,
and reviewed pilot assessment. The command surface is now exposed primarily by
`mdlm`; `req` remains only as a temporary bridge while the replacement proceeds.
The assessment Decision deliberately defers Phases 3–6.

## Conformance boundary

Conformance here means that the accepted implementation profile is executable
through its established public seams:

- `loadProcessPackage(path)`
- `resolveType(package, typeId)`
- `evaluateLifecycle(package, snapshot)`
- the shared generic command application through the `mdlm` executable

The prototype-era `req` executable remains temporarily available but is no
longer the primary public command identity.

It does not mean regulatory qualification, production hardening, a complete
software V-model package, or implementation of the items explicitly deferred by
the accepted overview and the reviewed pilot Decision.

## Implementation trace

| v0.8 concern | User stories | Tracer issues | Executable evidence |
| --- | ---: | ---: | --- |
| Textual, typed, terminating expressions | 7–12 | #15–#20 | `test/textual-expression.test.ts`, `test/req-process-expression.test.ts` |
| Package types, templates, links, capabilities, and graph validation | 1–6, 18–19, 23–27 | #21–#24 | `test/load-process-package.test.ts`, `test/resolve-type.test.ts`, `test/kernel-capability.test.ts` |
| Dependency changes, States, Obligations, phases, blockers, Dispatchability, and explanations | 13–17, 35–42 | #25–#31 | `test/dependency-changes.test.ts`, `test/evaluate-*.test.ts`, `test/req-lifecycle.test.ts` |
| Explicit package installation, selection, compatible repository migration, inspection, expression evaluation, and process-neutral scaffolding | 20–22, 48–51 | #32–#35, #54, #84 | `test/mdlm-command-application.test.ts`, `test/req-process.test.ts`, `test/req-process-scaffold.test.ts` |
| Markdown-authoritative repository, revision lineage, links, exact baselines, diff, and rebuild | 28–34 | #36–#40 | `test/req-datum-repository.test.ts`, `test/req-revision-history.test.ts`, `test/req-link-graph.test.ts`, `test/req-exact-baseline.test.ts`, `test/req-baseline-diff-rebuild.test.ts` |
| Authorized preparation, typed inability, bounded malformed-response correction, atomic Scenario Proposal submission, provenance, and authority-only Scenario publication | 43–47, 57–60 | #41–#43, #71, #87, #90 | `test/req-scenario-dry-run.test.ts`, `test/mdlm-assignment.test.ts`, `test/req-consequential-authorization.test.ts` |
| Phase 0 wayfinding, discoverable foundation, correction loop, and reviewed intent gate | 52–53, 57–58 | #44, #64 | `test/req-phase-0-wayfinding.test.ts` |
| Discoverable Phase 1 strategy, environment qualification, exact assurance Review, autonomous same-lineage Review correction, exact bounded ART registration, separately authorized pilot implementation, and exact-target pilot evidence | 55, 57–58 | #45, #65–#66, #74–#76 | `test/req-product-assurance-pilot.test.ts` |
| Phase 2 decomposition, simplification, candidates, and reviewed gate | 52–53, 57–58 | #46 | `test/req-system-decomposition.test.ts` |
| Exact problem/change control with selective historical reuse | 54, 57–58 | #47 | `test/req-change-control.test.ts` |
| Durable pilot measurements, independent Review, and expansion Decision | 56–60 | #48, #68 | `test/req-system-decomposition.test.ts`, `test/req-pilot-assessment.test.ts` |
| Continuous package-neutral pi operation, autonomous package-delegated independence, and exact standing-delegation discovery | 57–60 | #69, #72 | `test/pi-operator-instructions.test.ts`, `test/req-consequential-authorization.test.ts` |

The full suite supplies overlapping regression coverage rather than treating this
table as one test per requirement.

## Pilot-readiness repairs after closeout

Issues #49–#55, plus the blocking kernel defect repair in issue #56, preserve the accepted v0.8 boundary while repairing public operator
seams found in the external bootstrap pilot: repository-backed Resolver dry-run,
effective lifecycle-type inspection, explicit atomic initiation of package-
authored non-Resolver Scenarios, package-owned routing of prototype-bound
empirical questions to exact bounded evidence, package-authored exact source
boundaries before same-lineage question outputs, atomic compatible repository-
contract migration between installed packages, and kernel finalization of
capability-bound exact-baseline Scenario outputs before completion evaluation. Their executable evidence is
`test/req-scenario-dry-run.test.ts`, `test/req-schema.test.ts`,
`test/req-scenario-initiation.test.ts`, and
`test/req-prototype-question-routing.test.ts`, `test/req-process.test.ts`, plus the exact-baseline publication
coverage now exercised through `test/mdlm-assignment.test.ts`. Issues #58–#62 additionally preserve
current-Revision selection, permit exact Phase/Process Obligation subjects, project
package-owned participation, and require explicit authority plus declared exact
REV/DEC evidence for non-autonomous execution. Their public evidence includes
`test/evaluate-bootstrap-participation.test.ts`,
`test/req-scenario-participation.test.ts`, and
`test/req-consequential-authorization.test.ts`. Issue #71 additionally derives
protected authority-evidence types from package Scenario contracts, rejects their
direct authorship, and migrates public flows to exact Scenario execution. Issues
#72–#73 distinguish package-delegated/no-attention independence from attended
stakeholder choice and bind each Review Context to one exact primary scope even
when supporting parents are members. They do
not add Phase 3–6 scope or change
the reviewed `change` expansion Decision. Issue #89 adds exact Profile-authored
Profile Boundary and Lifecycle Complete conditions to the package-neutral Operator
Outcome seam. The bootstrap declares only its reviewed Phase 0–2 pilot boundary;
`progression: null` by itself remains a Process Dead End and does not claim that
Phases 3–6 are complete. Issue #90 completes the Assignment return protocol:
typed inability abandons the exact ignored lease without Lifecycle Data, one
malformed contract response preserves that Assignment for correction, a second
exhausts it, and only a later deliberate `mdlm next` allocates fresh work. Issue
#91 adds Phase-declared checkpoint readiness and one public checkpoint
conversation packet: inactive nonblocking Questions yield to eligible work,
active compatible Questions appear as one complete Consolidation Group with the
first exact Assignment, and normalized responses remain serial atomic Scenario
Proposals followed by reevaluation. The harness owns freeform semantic mapping;
raw transcripts remain ephemeral by default, and scheduling is not deferral.
Formal deferral requires a deferred QST Revision with a concrete
`reactivation_condition`, an exact scoped DEC, and its policy-required passing
Review.

## Demonstrated invariants

- The kernel owns the Datum Envelope, identity, revision lineage, integrity,
  immutability, hashing, graph storage, transactions, and deterministic
  evaluation.
- Packages own payload vocabulary, links, Selectors, Policies, States,
  Obligations, Scenarios, phases, prompts, skills, and aliases.
- Generic source recognizes no bootstrap lifecycle type, phase, Scenario, command
  alias, pilot metric, or expansion recommendation.
- Textual `mdlm-expression@1` is the only package authoring representation;
  compiled nodes remain private.
- Markdown Lifecycle Data is authoritative. Indexes and reports are disposable
  projections and are not correctness inputs.
- Exact baseline comparison produces structural changes; package Policy decides
  Staleness.
- Resolver availability is distinct from Dispatchability, Resolver execution
  requires one exact Dispatchable Obligation Instance, and explicit initiation is
  confined to package-declared non-Resolver Scenarios without fabricating one.
- Invalid Scenario inputs and missing delegated or attended authority fail before
  the adapter boundary; chat and completion prose do not substitute for the
  package-declared exact REV or DEC output.
- Generated lifecycle types publish only through validated Scenario execution;
  all outputs and required links validate before one atomic transaction publishes.
- Qualification, pilot, and formal evidence remain distinct. Pilot evidence
  cannot promote itself into formal requirement evidence.
- A current failed VSP, ENV, or pilot VER Review projects autonomous same-lineage
  correction. Exact failed REV links are complete, and corrected ENV assurance
  requires a fresh qualification chain before fresh context and Review.
- Current pilot activity requirements project exact bounded ART registration when
  no boundary-complete target exists. The target carries the public repository,
  versioned typed command with co-located exact parameter encodings, isolation,
  and observation protocol needed by a fresh
  source-blind implementer; existing singular evidence satisfies work and duplicates
  stay ambiguous rather than being silently selected.
- Complete reviewed Phase 2 candidates derive durable observation and exact
  assessment-context work. PAS publication, failed-Review correction, fresh
  independent Review, and the final nondelegable stakeholder Expansion Decision
  are all projected through package Obligations and public Scenario execution.
- The reviewed pilot recommendation is `change`; no Phase 3–6 definitions are
  present, and the selected Profile reports that exact terminal evidence as a
  Profile Boundary rather than Lifecycle Complete.

## Pilot outcome and remaining limits

The final pilot assessment records useful exact Loose Ends, correct selective
reuse and Staleness explanations, sufficient environment profiles, and successful
discrimination between supported and unsupported behavior. It also records high
Review/gate ceremony and no demonstrated scope removal. The exact expansion
Decision therefore adopts `change`, not `proceed`.

The following remain intentionally outside this completed profile:

- Phase 3–6 package definitions and outputs;
- production graph indexing before realistic repository measurements justify it;
- claim/lease orchestration and broader concurrency profiles;
- source-isolation containers;
- brownfield retrofit workflow;
- formal regulatory-compliance claims;
- broader package policy and telemetry questions retained in
  `.lifecycle/process/OPEN-QUESTIONS.md`.

Future work must begin from the reviewed `change` Decision rather than silently
expanding the package or moving package vocabulary into MDLM core.
