# MDLM bootstrap process package v0.34

This experimental package is migrating the typed declarative model described in
[`docs/mdlm-process-package-reference-v0.2.md`](../../docs/mdlm-process-package-reference-v0.2.md)
toward the accepted v0.8 design. It now includes `MAP`, `QST`, `DEC`, `ART`,
`PSP`, `STK`, `SYS`, `ASP`, `ICSP`, `DWP`, `VSP`, `ENV`, `VER`, `VAI`, `RUN`,
`RES`, `REV`, `BSL`, `PRB`, `CHG`, and `PAS`. These are a bootstrap subset of the bundled V-model Example Process
Package, not lifecycle types recognized by MDLM core.

The package can be explicitly installed and selected with the package-neutral
`req process install` and `req process use` commands. The recorded selection
includes its exact package version, expression-language version, and content
digest. `req process show`, `validate`, and `capabilities` expose the same semantic
projection in human-readable or JSON form without implicitly selecting this
Example Process Package. `req process expression evaluate` addresses a compiled
definition field in its authored binding and result-type context; generic Relation,
Selector, Policy, Computed State, and Obligation evaluation commands expose the
same deterministic package execution with source-span evidence. Generic Phase
status, Loose End, and next-work commands retain exact gate, blocker, resolver
output, Dispatchability, and waiver dimensions without embedding these example
Phase or type IDs in the executable. With an explicit `--phase`, those commands
evaluate durable repository Markdown directly; without one, repository-backed
status and next-work derive the active Phase from package progression declarations
and exact authorization evidence rather than a mutable phase pointer. `--snapshot`
retains reproducible fixture and historical evaluation. `req process init` may copy this package
under a new identity with exact source provenance, but that independently
versioned copy is ordinary package data rather than inherited kernel behavior.
The same command can create an empty package containing only the supported
meta-schema, Datum Envelope, primitive catalog, and empty authored catalogs.
A repository may explicitly select this package with `req init --process`; the
kernel then validates package-defined payload and outgoing-link contracts while
storing the resulting Lifecycle Datum in the package-neutral Markdown layout.

The package declares `mdlm-expression@1`. Every expression-bearing bootstrap
definition now uses textual source compiled at package load, including finite
universal predicates over typed Selector results. Authored YAML expression trees
are rejected by both meta-schema and semantic validation. The package explicitly
binds `BSL` to the versioned `exact-baseline@1` Kernel Capability; the kernel does
not recognize `BSL` by ID.

## Ownership

The kernel owns the datum envelope, identity, revisions, immutability, graph
storage, hashing, primitive relations, and deterministic evaluation. The process
package owns payload templates and types, outgoing-link contracts, policies,
states, selectors, obligations, scenarios, phases, prompts, skills, and safe
Package Command Aliases.

The compatibility copy at `meta/datum-envelope.schema.json` cannot redefine the
kernel. A kernel accepts it only when its known schema ID and contract version
match.

## Resolution order

To resolve a lifecycle type:

1. load the kernel datum envelope;
2. follow the type's single template chain from root to leaf;
3. add required payload fields and compatible property constraints;
4. reject nested required-field removal, widened constraints, incompatible
   property types, or duplicate inherited outgoing-link IDs;
5. allow only deterministic narrowing through enum subsets, stronger lower and
   upper bounds, preserved patterns and formats, recursive item/object schemas,
   and added constraints;
6. add the final type payload fragment and source-owned links;
7. set the flattened payload schema to reject unknown fields.

`req schema STK` should expose the resulting envelope, payload schema, link
contracts, lifecycle behavior, and review-policy result.

## Evaluator

All declarative behavior uses:

- the primitive catalog in `primitives/kernel-v1.yaml`;
- parameterized selectors in `selectors/`;
- the textual expression source contract in `meta/expression.schema.json`;
- machine policies in `policies/*.yaml`.

A process rule must not request a process-specific kernel fact. Conclusions such
as “passing review,” “current candidate,” and “members missing review” are named
selectors assembled from primitive collections, graph relations, integrity
paths, states, and policies.

Obligation status rules may declare exact blocking Obligation subjects with
textual expressions. Evaluation separates the eventual Resolver Scenario from
the currently actionable resolver and marks work Dispatchable only when the
status permits action, every binding resolves, and no exact blocker remains.
Blocker chains use exact Obligation Instance identities; presentation still puts
ready work before blocked work without changing Obligation truth. Every result
also exposes the eventual Resolver Scenario's typed output cardinalities and
required links. Waiver evidence is discovered through package-owned outgoing-link
contracts targeting exact Obligation Instances, then judged by the referenced
Waiver Policy. Only an exact, reviewed, unexpired structured waiver suppresses
work; generic justification remains ordinary evidence. Callers may supply named
historical repository snapshots alongside the current snapshot. Each is evaluated
independently through the same package rules and returned under
`obligationHistory`, preserving exact definition-version, subject-Revision, and
process-reference identity without introducing a historical lifecycle type.

Phase entry, candidate selection, and gate completion are evaluated directly
from each selected Phase's textual expressions. Each selected exact candidate
receives an independent gate result with authored expression source, exact Policy
and Selector evidence, and the blocker and Resolver Scenario evidence from the
package-declared gate Obligation. Candidate revisions therefore never inherit or
mutate earlier gate evidence. Phase 0 declares that its reviewed approving gate DEC
also authorizes entry to Phase 1, avoiding a redundant approval. Generic progression
can instead name a separate exact reviewed Decision Selector and Scenario. Status
keeps readiness, gate completion, exact authorization subjects, missing authority,
stakeholder attention, and exact authorization evidence separate. When no
Obligation is Dispatchable, `req next` projects that ready progression authority
with its public Scenario so an authorized agent can execute it. The evaluator recognizes neither a Phase
ID nor a candidate lifecycle type.

The accepted authoring surface is the textual MDLM Expression Language. The
implemented slices support typed bound variables, entity and context paths,
JSON-like literals, comparisons, membership, Boolean composition, parentheses,
presence checks, typed `select`, `exists`, `none`, `count`, and `one` Selector
operations, `state(subject, dimension)`, typed Policy result-field selection, and
`every(selector, arguments, binding => predicate)` over finite Selector results.
Package loading reconciles the manifest and loaded catalogs, validates exact
cross-definition references, arguments, bindings, and result types, and rejects
complete Template, Selector, Computed State, and Policy dependency cycles.
Resolver bindings must cover exactly the Scenario inputs with compatible identity,
types, and cardinality. Contextual Review, empirical and preferential question
resolution, and gate sign-off bind exact Scenario inputs to package-owned
participation Policies. Their projections distinguish delegated independent
Review, autonomous authority with sufficient exact evidence, immediate
nondelegable stakeholder
attention, and explicitly compatible checkpoint-consolidated stakeholder
attention without satisfying or deferring open questions. Delegated and attended
execution requires an exact matching `--authorize` supply or applicable reviewed
`--delegation` DEC before the adapter and
publishes the package-declared REV or DEC authority-evidence output atomically.
Because those types are derived from package `authority_evidence` contracts,
normal `req new --scenario` authorship cannot publish either type or launder it
through another Scenario's provenance. Repository validation requires each such
Revision's matching completed atomic execution transaction; raw imports do not
participate as authority. Gate, change approval, pilot expansion, and explicitly initiated
scope, waiver, standing-delegation, retirement, or cancellation sign-off use nondelegable stakeholder
authority; contextual Review records delegated judgment in REV. Waiver sign-off
must publish an exact `waives` link matching its structured Obligation Instance.
Reviewed standing-delegation DECs are bounded to an exact target Revision and
versioned Scenario with expiry and reactivation conditions. Non-Resolver Scenarios declare `initiation: explicit`; the
package rejects missing or conflicting explicit/Resolver authorization semantics.
Scenario output types, prohibited-input conflicts, required-
link targets, source-owned link availability, target types, and cardinalities are
also validated before the package is exposed. The kernel's `dependency-changes`
relation emits deterministic `dependency-change@1` content, outbound-link, and
stable-link-resolution records from exact Revision comparisons. When
`exact-baseline@1` is bound, the same comparison service adds membership,
composition, evidence-target, explicitly identified review-context, and process-
provenance variants for the package-selected type without recognizing its ID.
Process provenance is informational by default; this package deliberately omits
that record kind from its reassessment selector. The package's
`dependency-reassessment@1` Policy, not the kernel, decides whether classified
records imply Staleness, and Computed State explanations identify the exact
structural evidence selected by the package rule.
The package's `question.resolve@1` alias binds one cardinality-typed
`--question` argument to the exact `resolve-question@2` input assertion. Alias
expressions compile during package loading and cannot invoke host functions or
supply adapter, initiation, Obligation, authority, generic-command, or mutation behavior; invocation
enters the same Dispatchability, prohibited-input, output-contract, completion,
and atomic publication path as generic Scenario execution.
`mdlm-expression@1` textual source is
the only accepted authoring representation and cannot execute arbitrary code or
produce side effects.

## Kernel Capability

The manifest binds `exact-baseline@1` to `BSL`. Package loading validates the
bound type's managed definition-member, evidence, and snapshot payload paths and
its exact `composes` contract. Baseline collections and membership, evidence, and
composition relations are available only through that binding. A compatible
package may bind a differently named type and receive the same evaluator
behavior and capability-scoped change records.

## Links

Outgoing link contracts live on their source type. Backlinks are computed. The
same relationship ID may be declared by several source types with different
allowed target types; each source definition is authoritative for its own links.

## Phase 0 tracer slice

The package now defines MAP frontier indexes and exact ART prototype pointers in
addition to its question, decision, product, stakeholder, review, and baseline
data. `chart-wayfinding-map@1` and `build-exploratory-prototype@1` provide exact
authoring provenance for that evidence. An empirical QST may explicitly bind
resolution to one exact Git prototype target, bounded supported and unsupported
behavior, and two allowed findings. Before any open QST can publish a satisfying
same-lineage Revision, `source-boundary-required@1` projects
`freeze-source-boundary@1`, which atomically publishes and kernel-finalizes one
truthful `source-boundary` BSL containing exactly the source Revision. The
package requires the kernel's matching valid Scenario-execution projection, not
merely a caller-supplied Scenario name. The generic and prototype Resolvers remain
blocked behind that discoverable work;
no piecemeal baseline commands or borrowed Review Context provenance are needed.
A prototype declaration then routes its exact frozen Revision to
`resolve-question-with-prototype@2`, which atomically publishes ART, DEC, and the
satisfying QST Revision; other empirical questions retain the generic resolver.
Package-owned Obligations now discover the required MAP, PSP, STK set,
Review Contexts, Reviews, and exact intent candidate from an empty initialized
repository. MAP, PSP, and STK are substantive review subjects: their ready Review
Context work sorts ahead of blocked Review work. Every context scopes one exact
primary subject Revision while its definition may include the coherent parent and
sibling slice; supporting membership does not make another member the primary
Review subject. Each exact subject receives its own REV. A failed Review creates
autonomous correction work for a replacement Revision in
the same lineage, followed by fresh context and Review work; correction of a DEC
still requires stakeholder authority. Candidate and Gate Sign-off review remain separate.
An unreviewed exact gate DEC blocks a duplicate sign-off until its own context and
REV resolve; only an explicit `gate_outcome: approve` can make the package-authored
gate expression true, while a reviewed rejection remains blocking history.

## Phase 1 qualification and pilot tracer slice

Phase 1 entry Revisions derive `verification-strategy-required@1` work without an
operator-selected Scenario. VSP retains both the Stable commitment relation and a
separate exact entry-Revision coverage link, so a newer STK Revision reopens work. Each applicable exact VSP then derives
`environment-assurance-required@1`, whose Resolver atomically publishes the
reproducible ENV and its qualification VER/VAI pair. `verification-run-required@1`
derives generated RUN/RES execution from exact VAI links; the RES atomically
records its exact execution ENV, so no post-run link mutation is needed. ENV Review
Context work remains blocked until a passing environment-capability qualification exists; its
completion contract freezes the exact ENV and VSP as definitions and the exact
VER, VAI, RUN, and RES as evidence before independent Review.

Each current entry requirement Revision and applicable VSP Revision then derives
`pilot-verification-activity-required@1`. The pilot VER preserves both Stable and
exact requirement coverage. Its Review unlocks
`pilot-verification-implementation-required@1` only when one qualified reviewed
ENV Revision and one current ART Revision are unambiguous. Independent implementation
requires a projected delegated Authority Requirement and atomically publishes its
VAI Revision with an exact authorization DEC. `verification-run-required@1` remains
blocked until the VAI Review passes, then binds the package-resolved exact VER,
ENV, and ART Revisions before publishing RUN/RES atomically.

Pilot authoring and execution declare product source, unit tests, private
implementation details, and uncontrolled shortcuts as prohibited inputs. A pilot
target records both supported and intentionally unsupported behavior, and its RES
must record both expected success and expected discrimination. Scenario
completion rejects a formal requirement claim from a pilot run, terminal RUN/RES
are immediately immutable, and package-declared generated types cannot be created
or revised through generic direct authoring.

## Phase 2 system decomposition tracer slice

The package defines exact DWP planning and completion Revisions, stable ASP
architecture elements, normative ICSP boundaries, and allocated SYS outputs.
Package-authored Selectors and Obligations first derive ASP and ICSP authoring
from accepted exact intent, then derive DWP planning only when one exact
architecture, interface, and VSP context is unambiguous. Further Obligations
derive reviewed-plan execution, exact question blockers, child Review completion,
parent coverage, and separate requirement-set and architecture/interface
simplification work. The completion Scenario publishes the next DWP Revision in
the same Stable Datum lineage only after those exact obligations resolve. Package-
discovered candidate Scenarios freeze the exact reviewed completion, outputs,
architecture, interfaces, and simplification evidence as a group candidate, then
compose its reviewed Revision with shared VSP, ASP, and ICSP context as the level
candidate. Only that reviewed level candidate receives exact gate authorization,
and the same reviewed approval authorizes progression to pilot assessment.

Scenario required-link validation follows the source type's identity contract, so
an exact Revision input is normalized to its Stable Datum ID only when the
package-owned outgoing link requires Stable identity. Generic type identifiers
accept three through eight uppercase characters, permitting `ICSP` without core
recognition of that or any other V-model noun.

## Exact problem and change-control tracer slice

The package defines PRB and CHG as source-owned exact lifecycle data. An
unsuitable pilot RES derives `problem-report-required@1`; its PRB preserves that
immutable source through `reports`. The resulting CHG names exact affected
requirements, Review Contexts, Reviews, baselines, and verification evidence in
both payload impact categories and `impacts` links. Contextual Review blocks an
exact `change-approval` DEC. Only then may the affected SYS Stable Datum receive
its next Revision through `changed-under`.

Replacement context, Review, candidate, and generated pilot RES data retain the
exact CHG. Baseline comparison keeps exact historical Review and RES evidence
while package Policy marks only dependencies whose Stable resolutions changed as
Stale; unrelated exact evidence remains reusable. Closure atomically publishes a
`change-closure` DEC citing the exact CHG and replacement evidence plus the next
closed PRB Revision. `change-status@1` remains an independent computed dimension,
and all routing uses generic Phase, Obligation, baseline, Scenario, and repository
surfaces.

## Reviewed Phase 0–2 pilot assessment

The package defines generated `PAS@1` as structured durable pilot measurements,
not a generated report. Each complete reviewed Phase 2 level candidate derives a
`pilot-observation-required@1` work item whose typed payload records every PAS
measurement basis or an explicit zero/unavailable outcome. Once all accepted Phase 2 requirements
have complete candidates and exact observations, `pilot-assessment-context-required@1`
freezes exactly those candidate Revisions and observations as one immutable
`pilot-assessment-context` BSL, separately from the PAS that measures it. The assessment records
Review and Review Context volume, observed agent tracer-issue/Git-commit effort,
localized-change evidence reuse and Staleness explanation checks, Loose End
usefulness, gate ceremony, environment-profile sufficiency, supported/unsupported
verification discrimination, and actual scope reduction.

`pilot-assessment-required@1` authorizes canonical PAS publication only for a
valid exact frozen context. Direct PAS creation is prohibited by generated
authorship. The PAS then requires ordinary independent contextual Review. A failed
Review derives `pilot-assessment-review-correction-required@1`; its Resolver
publishes a changed Revision in the same PAS lineage over the unchanged exact
context, linked through `corrects-review` to every exact failing REV, before fresh Review. Only a current passing PAS with no dominating failed
Review makes `pilot-expansion-decision-required@1` Dispatchable. The resulting
DEC requires explicit nondelegable stakeholder authority, must choose exactly the
reviewed PAS recommendation—`proceed`, `change`, or `stop`—and cites both the
exact PAS and its matching passing REV. The tracer records `change`:
reuse, explanation, queue, profiles, and discrimination worked, but review/gate
ceremony was high and the challenged Phase 2 slice retained rather than removed
scope. Phases 3–6 remain absent.

## Scope

Phases 0, 1, 2, the Phase 7 change-control tracer, and the Phase 0–2 pilot
assessment remain marked `bootstrap-subset`. Their narrow intent, qualification/
pilot, one-group system-decomposition, one-requirement change, and expansion-
decision slices are executable. The reviewed Decision requires changed ceremony
and demonstrated scope removal before complete promotion, formal verification,
component/design decomposition, or implementation work begins. The package tests
the evaluator seam before broader lifecycle breadth.
