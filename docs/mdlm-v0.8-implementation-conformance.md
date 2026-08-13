# MDLM v0.8 implementation conformance

- **Status:** Completed concept-validating implementation profile
- **Design baseline:** [`mdlm-process-overview-v0.8.md`](mdlm-process-overview-v0.8.md)
- **Implementation package:** `mdlm-bootstrap@0.59.0`
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
| Discoverable Phase 1 strategy, environment qualification, exact assurance Review, autonomous same-lineage Review correction, exact malformed command evidence, bounded VAI procedure correction, separately authorized pilot implementation, and exact-target fresh pilot evidence | 55, 57–58 | #45, #65–#66, #74–#76, #97 | `test/req-product-assurance-pilot.test.ts`, `test/mdlm-phase-1-assurance-correction.test.ts` |
| Phase 2 decomposition, exact-set and ordinary correction, ambiguity, evidence-preserving candidates, acceptance, and reviewed gate progression | 52–53, 57–58 | #46, #98–#99 | `test/req-system-decomposition.test.ts`, `test/mdlm-phase-2-simplification.test.ts`, `test/evaluate-bootstrap-participation.test.ts` |
| Accepted STK and shared-SYS boundaries, attended exact Change Request dispositions, serial consumer coverage replacement, selective reuse, and closure | 54, 57–58, 68–75 | #47, #101–#102 | `test/mdlm-stakeholder-change-control.test.ts`, `test/mdlm-shared-system-change-control.test.ts`, `test/evaluate-shared-system-change.test.ts`, `test/mdlm-review-correction.test.ts` |
| Durable pilot measurements, bounded PAS/Decision correction, independently reviewed expansion Decision, and explicit outcomes | 56–60 | #48, #68, #100 | `test/req-system-decomposition.test.ts`, `test/req-pilot-assessment.test.ts`, `test/mdlm-pilot-assessment.test.ts` |
| Continuous package-neutral pi operation, autonomous package-delegated independence, and exact standing-delegation discovery | 57–60 | #69, #72 | `test/pi-operator-instructions.test.ts`, `test/req-consequential-authorization.test.ts` |
| Fresh public onboarding transaction, compositional zero-to-assessment route proof, and observed friction | 57–60 | #70 | `test/mdlm-clean-onboarding-transaction.test.ts`, [`zero-to-assessment-pilot.md`](zero-to-assessment-pilot.md) |

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
Outcome seam. The bootstrap now declares reviewed proceed/change Profile Boundary
conditions and a distinct reviewed stop Lifecycle Complete condition;
`progression: null` by itself remains a Process Dead End and does not claim either
successful result. Issue #90 completes the Assignment return protocol:
typed inability abandons the exact ignored lease without Lifecycle Data, one
malformed contract response preserves that Assignment for correction, a second
exhausts it, and only a later deliberate `mdlm next` allocates fresh work. Issue
#92 hardens the first failed-Review route through that public loop: one failed STK
Review derives a subject-bounded correction Assignment with complete exact Review
and Finding input, a causal same-lineage replacement, fresh exact context and
independent Review, and resumed blocked work through normal reevaluation. Issue
#93 bounds that package-owned lifecycle loop to two autonomous replacement cycles,
projects exact attended escalation after continued failure, and routes
stakeholder-owned intent changes to immediate attention. Issue #94 makes a reviewed
Phase 0 gate rejection self-correcting: canonical exact `blocks` links select
implicated draft members, structured findings preserve rationale applying to that
set, each replacement cites the rejection and receives fresh Review, a superseding
candidate preserves unaffected evidence, and normal reevaluation returns attention
to the same gate. Rejection remains immutable non-approval history and never
implies stop, defer, or cancel. Issue #95 makes the exact intent candidate the
earliest complete evidence-bearing product set. Its exact MAP/PSP/STK contents
are direct independent-Assignment inputs, and its Review is the dedicated
product-simplification judgment. One structured target groups all current
blocking findings and must match the sole canonical blocker link before exact
foundation or candidate correction; distinct targets remain serial. Candidate
correction deepens into one
interface whose participation changes from two autonomous cycles to attended
escalation. Failed Question and gate Decisions retain the same causal-history
contract under attended authority. Reviewed gate approval mechanically publishes
an exact accepted-intent BSL before Phase progression. Issue #97 applies that
bounded correction shape to failed source-blind pilot VAI Reviews while preserving
exact VER, ENV, ART, case, and pilot claim-class bindings. Corrected procedures
record bounded setup and case deadlines, forced timeout termination/reaping,
partial raw observation, guaranteed cleanup, and continue-through-all-cases
aggregation. Issue #98 moves Phase 2 simplification to the first frozen exact
SYS/ASP/ICSP/planning-DWP set. Primary Findings are owned by one exact declared
target, collateral Findings are bound to the complete canonical consistency set, and blockers must be
either that one current SYS or every member of the exact consistency set. Failed
Reviews route only from the one current complete Review Context. Every replacement
has exact `corrects-review` causality and fresh contextual and simplification
Reviews. Source-owned exact links are the sole DWP/SYS interface references, so
duplicate payload references cannot drift from the atomic replacement graph. Exact
`removes` links require a reduced plan to omit a proper subset of SYS outputs and
retain replacements for every undeclared output lineage; complete parent-scope
elimination returns typed inability rather than fabricating an empty decomposition.
ART command evidence now distinguishes normal, raw malformed,
omitted, and extra arguments—including omitted versus empty tokens—and gives every
case deterministic exact-byte observations. Prior VAI/RUN/RES/Review evidence
remains immutable and cannot satisfy fresh corrected work. Issue #99 closes the
remaining supported Phase 2 routes: failed or collateral-flagged SYS, ASP, ICSP,
and planning/completion DWP Reviews derive one subject-bounded same-lineage
Correction with two autonomous cycles before attended escalation; unsupported
multiple-current single-valued definition cardinality derives exact attended cancellation and
Review rather than arbitrary selection; valid plural ICSP sets remain actionable;
and DWP completion binds every exact parent, output, architecture, interface,
strategy, plan, and simplification Review through canonical links, with parent
coverage derived from exact SYS lineage instead of duplicated payload accounts.
Failed or reviewed-rejected group and level candidates preserve unaffected exact
membership, evidence, and composition while `supersedes` records the predecessor;
Phase 2 gate rejection canonically blocks the exact level candidate. Reviewed approval then derives one flattened `level-accepted`
baseline before the same exact gate evidence authorizes progression without a
redundant stakeholder Decision. Issue #100 completes the pilot-assessment profile:
a failed current PAS receives two autonomous same-lineage Correction cycles over
the unchanged frozen context before attended escalation; only a current passing
PAS exposes the nondelegable stakeholder Expansion Decision; and that Decision
must cite the exact PAS and passing PAS Review, pass its own independent Review,
and receive attended same-lineage Correction after failure. Reviewed `proceed`
reports the omitted Phase 3–6 Profile Boundary, reviewed `change` enters the
declared Phase 7 change-control route and reaches the boundary after supported
work drains, and reviewed `stop` reports Lifecycle Complete. Issue #101 hardens
that declared Phase 7 route around accepted stakeholder intent: only an exact STK
Revision in an authorized accepted intent baseline can enter CHG impact; exact CHG
and Decision Reviews precede one attended approve/reject/defer/cancel disposition;
only approval permits a same-lineage `changed-under` replacement; fresh exact
context, STK Review, CHG-linked selective candidate, and candidate Review precede closure;
every directly traced affected item derives from the exact STK/baseline roots and
projects Stale after implementation;
and every unaffected accepted definition/evidence item remains reusable. Failed CHG,
disposition, STK, and candidate Reviews route to causal same-lineage Correction and
fresh independent Review instead of stranding Phase 7. Draft STK correction remains the ordinary Phase 0 route. Issue #102 extends the same package-owned accepted boundary to one shared SYS consumed by two exact DWP lineages: exact links expose both consumers and dependent context, Review, candidate/gate, and verification evidence; draft replacement reevaluates each consumer without CHG; accepted replacement requires attended reviewed CHG authority and serial fresh consumer coverage before selective candidate and closure. The lifecycle-neutral
operator contract exposes package-bound attended inputs without counting
Assignment transport attempts as lifecycle failures. The implemented routes and
deferred hardening breadth are recorded in
[`phase-hardening-matrix.md`](phase-hardening-matrix.md).

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
- A current failed VSP, ENV, or pilot VER Review projects exact same-lineage
  correction carrying every failed REV applicable to the current Revision. Two replacement cycles
  remain autonomous before immediate attended escalation. Corrected ENV assurance
  requires a fresh qualification chain before fresh context and Review; VSP Review
  precedes dependent fan-out, assurance tied to a prior exact VSP cannot satisfy
  its replacement, and unsupported ambiguity reaches an explicit Profile Boundary.
- Current pilot activity requirements project exact bounded ART registration when
  no boundary-complete target exists. The target carries the public repository,
  ordered typed command matrix with co-located exact parameter encodings and case
  tokens, isolation, exact normal/raw-malformed/omitted/extra cases,
  omitted-versus-empty-token identity, and deterministic exact-byte observations
  needed by a fresh
  source-blind implementer; existing singular evidence satisfies work and duplicates
  stay ambiguous rather than being silently selected.
- A failed source-blind pilot VAI Review derives exact same-lineage correction with
  every applicable Review and Finding. Exact activity, ENV, ART, case, and claim-
  class bindings are retained; the procedure bounds checkout, environment checks,
  and product cases, terminates and reaps timeouts while retaining partial raw
  observation, guarantees cleanup, and continues all cases. Fresh context, Review,
  and run evidence is mandatory while prior VAI/RUN/RES/Review evidence remains
  immutable.
- Accepted requirement maturity comes only from exact accepted-baseline membership,
  never Review alone. Draft STK failures remain ordinary Correction. Accepted STK
  impact derives complete direct exact traceability and the promoted candidate's
  Review/gate dependency route from its accepted-STK roots and cannot preserve
  evidence by omission; every attended disposition, same-lineage replacement,
  declared CHG/disposition context for independent replacement and candidate
  judgment, selective candidate/gate Staleness and reuse, failed-Review Correction,
  fresh candidate evidence, and exact closure are
  package-derived. Accepted history is never rewritten.
- Complete reviewed Phase 2 candidates derive durable observation and exact
  assessment-context work. PAS publication, bounded failed-Review Correction,
  attended escalation, fresh independent Review, the final nondelegable
  stakeholder Expansion Decision, failed Decision Review Correction, and all
  explicit outcomes are projected through package Obligations and public Scenario
  execution.
- The observed reviewed pilot recommendation is `change`; no Phase 3–6 definitions
  are present. The selected Profile enters its declared narrow change-control route
  and reports Profile Boundary after supported work drains. A reviewed `proceed`
  also reports Profile Boundary, while an exact reviewed `stop` alone reports
  Lifecycle Complete.

## Pilot outcome and remaining limits

The separate [zero-to-assessment pilot report](zero-to-assessment-pilot.md)
records the clean repository's observed interaction counts, delegated Reviews,
Correction loops, attention-consolidation opportunity, and remaining friction,
then composes its immutable observations with the repaired public Phase 0–2 and
assessment seams. The final pilot assessment records useful exact Loose Ends, correct selective
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
