# MDLM Declarative Process Package Reference

**Bootstrap package 0.55 — experimental implementation reference**

The `.lifecycle/process` package declares the exact `mdlm-expression@1`
authoring contract. Every expression-bearing field accepts textual source only;
package loading rejects authored YAML expression trees before evaluation. The
language includes typed Selector, Policy-result, Computed State, and finite
universal-quantification operations. The target architecture is described by
`mdlm-process-overview-v0.8.md`, including complete textual expression coverage,
process-neutral core semantics, Kernel Capabilities, and the V-model as an
Example Process Package. The bootstrap binds a package-defined type to `exact-baseline@1`. The completed
v0.8 concept-validating profile is traced in
`mdlm-v0.8-implementation-conformance.md`; broader lifecycle breadth and
production concerns remain explicitly deferred rather than silently claimed as
implemented.

## 1. Purpose

The process package defines lifecycle payload schemas, outgoing-link contracts,
computed states, reusable relational selectors, machine-readable policies,
obligations, scenarios, phases, prompts, and skills. The kernel supplies storage,
identity, integrity, graph traversal, deterministic evaluation, and atomic
mutation.

The central design constraint is that the kernel must not accumulate
process-specific facts such as `candidate.members_missing_review`. It exposes a
small typed set of primitive values and relations. The process package derives
higher-order facts through selectors, expressions, policies, and states.

## 2. Ownership model

### 2.1 Kernel-owned datum envelope

Every lifecycle revision has one kernel-owned envelope:

```yaml
id: STK-7K3M9Q2D8F
revision: 1
revision_id: STK-7K3M9Q2D8F-r00001
type: STK
payload:
  title: Export completed report
  rationale: Users need a durable copy outside the product.
  statement: The product shall allow an analyst to export a completed report.
  verification_intent: Demonstrate export of a representative completed report.
  stakeholder: analyst
  priority: must
links:
  - type: derived-from
    target: PSP-X4N7AB2W6J
created_by:
  scenario: draft-stakeholder-requirements@2
  prompt_ref: prompts/draft-stakeholder-requirements.md@2
  process_ref: git:abc123
  loaded_skill_refs: [skills/requirement-writing.md@1]
  policy_refs: [review-applicability@1]
---
Optional Markdown body.
```

The kernel owns and validates `id`, `revision`, `revision_id`, `type`, `links`,
`created_by`, and the Markdown body projection. Process definitions cannot remove,
rename, or weaken these fields. The local envelope schema is a compatibility copy;
the kernel validates its known `$id` and version rather than trusting arbitrary
replacement content from a package.

### 2.2 Process-owned payload

A type definition validates only `payload`. Payload schemas may be composed from
process templates. A type may identify payload paths populated mechanically by
the kernel, but may not use that declaration to weaken envelope integrity.

### 2.3 Kernel-managed payload

Some durable claims contain mechanically generated payload sections. A type
declares these paths as `kernel_managed_payload_paths`. The kernel refuses direct
author edits to them and populates them during the relevant atomic operation.
The bootstrap baseline type marks definition membership, supporting evidence,
and snapshot integrity data as managed.

### 2.4 Kernel Capability binding

The manifest opts a compatible package-defined type into fixed exact-baseline
behavior without giving its type ID kernel meaning:

```yaml
kernel_capabilities:
  exact-baseline@1:
    type: BSL
```

Package loading validates the capability version, the managed
`definition_members`, `evidence`, and `snapshot` payload fields, and an exact
`composes` link back to the bound type. A different package may bind another type
ID. Without the binding, baseline collections and relations are unavailable.

## 3. Type templates

Templates provide deterministic schema reuse without becoming a macro language.

```text
titled-datum
  └── rationale-bearing
        └── requirement
              ├── STK
              └── SYS
```

A template or type has at most one parent. Resolution proceeds from root to leaf.
Top-level payload properties and required sets are additive. When a child
redeclares an inherited property schema, that property schema is complete: it
must preserve nested required fields and inherited constraints. The supported
narrowing subset is exact type preservation, enum subsets, stronger numeric,
string, array, and object bounds, preserved patterns and formats, recursive
array-item and object-property schemas, and added constraints. An inherited
assertion outside that subset must be preserved exactly when its property is
redeclared; general JSON Schema subsumption is not attempted. Duplicate outgoing-
link IDs in one resolved chain are rejected rather than overridden.

`req schema <type>` resolves one lifecycle type from the explicitly selected
Process Package. Its machine projection includes the exact package reference,
expression language, digest, versioned type definition, complete root-to-leaf
Payload Template chain, effective kernel Datum Envelope, flattened payload schema,
source-owned outgoing-link contracts, lifecycle behavior, and any Kernel Capability
bindings applicable to that package-defined type ID. Human output presents the
same authored and resolved evidence without exposing parser nodes or compiled
expression structures. Unknown types, absent selection, and invalid selected
packages return typed diagnostics.

## 4. Source-owned link contracts

Outgoing link contracts live with their source type or inherited template. There
is no separate normative link registry.

```yaml
outgoing_links:
  - id: derived-from
    description: Intent from which this stakeholder requirement is derived.
    targets:
      - kind: datum
        types: [PSP]
        identity: stable
    cardinality: { minimum: 1, maximum: 1 }
    freeze_resolution: exact-revision
    inverse_label: derives
```

The source contract defines target kind, target type, stable-versus-revision
identity, cardinality, freeze behavior, and inverse display label. The same link
ID may appear on several source types with different target constraints. Each
source definition is authoritative for its own links. Backlinks are always
computed.

Baseline members, supporting evidence, and composition remain distinct. Members
and evidence are capability-managed payload fields on the bound type; composition
is represented once by outgoing `composes` links.

## 5. Primitive evaluator interface

The kernel exposes typed primitives, not lifecycle conclusions.

### 5.1 Entity paths

Expressions may read:

- `identity.id`, `identity.revision_id`, `identity.type`, and
  `identity.revision`;
- `payload.*` fields validated by the resolved type;
- `storage.editable` and `storage.frozen`;
- `integrity.parseable`, `schema_valid`, `identity_valid`,
  `references_valid`, `hash_valid`, and `scenario_execution_valid`; the last is
  true only when the Revision matches an output in its complete validated atomic
  Scenario execution transaction;
- `provenance.process_ref` and `provenance.scenario`;
- context values such as `process.current_ref`, `phase.id`, and
  `execution.integrity.contract_valid`.

Paths are rooted at a declared expression variable, for example
`subject.payload.outcome`. Unknown variables and paths are package-validation
errors when their type can be determined statically.

### 5.2 Collections

The kernel supplies collections of stable data and exact revisions. The baseline
collection is exposed only when `exact-baseline@1` is bound and contains exact
revisions of that package-defined type. A Selector narrows a collection by type
and expression.

### 5.3 Relations

The first relation vocabulary is:

- `outgoing-links` — from source revision to target;
- `incoming-links` — from target to source revision;
- `revisions` — from a stable datum or revision to all exact revisions;
- `baseline-members` — from a capability-bound baseline to definition-member
  revisions;
- `baseline-evidence` — from a capability-bound baseline to supporting-evidence
  revisions;
- `baseline-memberships` — from a revision to containing capability-bound
  baselines;
- `baseline-composed` — from a capability-bound baseline to exact bound baselines
  reached by `composes`;
- `dependency-changes` — from a revision to deterministic structural
  `dependency-change@1` records for exact content, outbound-link, stable-link-
  resolution, capability-bound baseline membership and composition, evidence-
  target, explicitly identified review-context, and baseline process-provenance
  comparisons;
- `scenario-inputs` and `scenario-outputs` — from one scenario execution to its
  declared bound data.

Relations return typed entities or typed change records. Every
`dependency-change@1` record names the subject and exact before/after Revisions;
variant fields describe a changed content path, an outbound link target set, a
stable link's changed exact resolution, exact member/component/evidence sets,
changed exact review contexts, or exact process references, manifest hashes, and
asset sets. Baseline-specific variants are available only when both compared
Revisions use the type selected by `exact-baseline@1`; the kernel never recognizes
`BSL`. These records never contain a Stale Boolean. Process-provenance records are
reported as informational Process Drift and the bootstrap selector excludes them
from reassessment. A package may explicitly select that record kind when its own
Policy requires reassessment. The package filters records with
`staleness-relevant-dependency-changes-for`; `dependency-reassessment@1` makes the
Policy decision; and the `validity` Computed State supplies the Stale conclusion
and attaches the selected exact records to its explanation.
Unsupported or incomplete comparisons produce evaluation diagnostics and no
lifecycle conclusions. Traversal is side-effect-free and deterministic. Adding a
relation primitive requires a kernel interface version; adding a selector over
existing relations does not.

## 6. Shared expression language

States, selector predicates, policies, obligations, scenario completion, and gates
use one expression grammar.

### 6.1 Values

Source expressions use JSON-like string, number, Boolean, null, array, and object
literals; bound variables; and typed dotted paths such as
`subject.payload.outcome`. Safe value-producing host calls are:

```text
state(subject, "dimension")
policy("policy-id@1", {subject: subject}).result_field
select("selector-id@1", {subject: subject})
count("selector-id@1", {subject: subject})
one("selector-id@1", {subject: subject})
```

### 6.2 Predicates

Predicates compose `==`, `!=`, `>`, `>=`, `<`, `<=`, membership with `in`, `&&`,
`||`, unary `!`, and parentheses. Safe predicate host calls are `present`,
`exists`, `none`, and finite universal quantification:

```text
every("selector-id@1", {candidate: candidate},
  member => state(member, "validity") == "valid")
```

The universal binding receives the Selector's declared result kind, and its
predicate must return Boolean.

Expressions cannot execute arbitrary code, access the filesystem, make network
requests, mutate data, or invoke undeclared functions.

### 6.3 Fact-to-fact comparison

Both comparison operands are values, so process drift is declared directly:

```yaml
when: "subject.provenance.process_ref != process.current_ref"
```

The kernel does not need a special `process.drift` fact.

## 7. Parameterized relational selectors

Selectors are named, reusable queries with typed parameters:

```yaml
id: passing-reviews-for
parameters:
  - { name: subject, kind: revision }
query:
  from:
    relation: incoming-links
    of: subject
    link: reviews
    emit: source
    types: [REV]
  as: review
  where: >-
    review.payload.outcome == "pass"
    && state(review, "validity") == "valid"
```

Selectors may source a kernel collection, traverse one primitive relation, or
invoke another selector. Recursive selector references are forbidden. Selector
arguments must match declared parameter kinds and types.

Higher-order conclusions are expressed by composing selectors. For example, a
candidate is review-complete when `candidate-members-missing-review` returns no
results; the kernel does not expose a dedicated missing-member fact.

## 8. Machine-readable policies

A policy is a deterministic, prioritized decision table with typed parameters,
a result schema, a default result, and expression-based rules.

```yaml
id: review-applicability
parameters:
  - { name: subject, kind: revision }
default: { required: false, rubric_ref: null }
rules:
  - priority: 300
    when: 'subject.identity.type in ["MAP", "PSP", "STK", "SYS"]'
    result:
      required: true
      rubric_ref: policies/rubrics/bootstrap-review.md@1
```

Rules evaluate from highest to lowest priority; the first match wins. Equal
priorities within one policy are invalid. Policies may not mutate artifacts.
Prompts and rubric prose remain Markdown assets, while applicability and outcomes
are machine-readable.

## 9. Computed states

A state definition declares one dimension, allowed values, precedence, and
expressions. Exactly-one dimensions select the highest-priority matching rule or
the declared default. Zero-or-more dimensions include every matching value.

State dependencies are derived from `state` operands and must form an acyclic
graph. Process drift remains an overlay because its expression compares process
references and does not feed validity.

## 10. Obligations and loose ends

An obligation is instantiated once for each result of its `for_each` expression.
The expression may select exact Lifecycle Data Revisions or place the evaluator's
exact current `phase` or selected `process` context in an array. Phase and Process
subjects let a package require an initial outcome before any Lifecycle Datum
exists; they do not enter Revision collections or become synthetic Lifecycle Data.
An obligation declares:

- its exact subject variable;
- the expression that satisfies it;
- prioritized status rules;
- a resolver scenario;
- direct input bindings or a selector-driven dispatch;
- a machine-readable waiver policy.

Resolver bindings are explicit. A baseline-level obligation may dispatch one
review scenario per result of `candidate-members-missing-review`, avoiding
ambiguous dependencies between differently scoped obligation instances. A
status rule may also declare `blocked_by` entries, each naming a versioned
Obligation and a textual expression selecting exact subjects. Package loading
compiles those expressions and validates each referenced Obligation.

Every evaluated Obligation reports `eventualResolver`, `actionableResolver`,
`dispatchable`, `blockedBy`, `blockerChains`, and `unresolvedBindings`. Its
resolver explanation includes the referenced Scenario's prompt and each expected
output's package-authored types, cardinality, and required links. A resolver is
Dispatchable only for an actionable status when every declared binding resolves
and no exact blocking Obligation Instance remains. Otherwise the currently
actionable resolver is derived from the first deterministic Dispatchable leaf in
the declared blocker chains; merely naming an eventual Resolver Scenario never
grants permission to execute it.

Waiver evidence is any exact Revision whose effective package-owned outgoing-link
contract targets an exact Obligation Instance and whose stored link targets this
instance identity. The referenced Waiver Policy then judges the candidate against
the exact Obligation reference and subject. Bootstrap policy accepts only a
structured, valid, passing-reviewed `this-revision` waiver with
`subject-revised` expiry and no newer subject Revision. The result reports exact
evidence, applicability, scope, permission, and approval requirement. Applicable
waivers receive computed `waived` status, do not dispatch or block dependents, and
are omitted from current Loose Ends without changing the satisfaction expression's
Boolean result.

Obligation identity is:

```text
<obligation-definition-id>@<version>:<exact-subject-id>:<process-ref>
```

A Revision subject uses its exact Revision ID. A Phase subject uses its exact
Phase definition ID and version. A Process subject uses
`process@<phase-id>@<phase-version>` so its evaluation context is unambiguous.
The final process reference keeps every instance, including a Process-scoped one,
bound to the exact package evaluation that produced it.

When a resolving scenario creates a new subject Revision, the former instance is
historical and the current selector is reevaluated. `evaluateLifecycle` accepts
explicit named historical repository snapshots and evaluates each independently
through the same Process Package. Their Obligation explanations are returned under
`obligationHistory`, separate from current `obligations` and `looseEnds`. This
preserves the exact definition version, subject Revision, process reference,
status, blockers, resolver, and evidence observed for that snapshot without
turning generated history into a lifecycle datum type. Repository adapters remain
responsible for discovering historical snapshots; the evaluator neither stores
nor mutates them.

## 11. Scenarios

A scenario declares named typed inputs and outputs, cardinalities, required links,
its prompt, review policy, optional participation Policy, optional exact
`authority_evidence` output, prohibited inputs, completion expression, and the
loose ends it resolves.

The execution wrapper binds `input.<name>`, `output.<name>`, and `execution`.
Generic contract validation checks declared cardinality, schema validity, link
contracts, required input/output links, payload-supplied exact-identity links, and undeclared outputs. At package load,
Obligation resolver bindings must cover exactly the referenced Scenario inputs
with compatible identity, lifecycle types, and cardinality. An enabled Obligation
must have its Resolver Scenario enabled in the same Phase. Scenario output types,
prohibited-input conflicts, and required-link names, targets, target types, and
cardinalities are rejected before execution. The completion expression may add
process-specific conditions but should not duplicate those generic checks.

Prompts choose and order skills. Execution provenance records the exact prompt,
skills, policies, process reference, authorization mode, and inputs actually used.

An optional `participation` block binds every parameter of one exact versioned
Policy to a typed `mdlm-expression@1` value over the Scenario inputs and the
pre-execution process and Phase context. Participation arguments cannot depend on
`execution`, because authority must be known before an adapter runs. The Policy
must return the standardized fields
`authority_mode`, `authority`, `delegation_allowed`, `attention_timing`,
`attention_checkpoint`, and `consolidation_group`. Package validation rejects an
unknown Policy, missing or extra parameters, mistyped argument expressions, a
nonstandard result schema, or invalid default and rule results. Public projections
translate that result into an Authority Requirement and Attention Schedule while
retaining the exact Policy reference. Scenario `batching` controls atomic
transaction shape; an Attention Schedule's checkpoint and Consolidation Group
control when compatible human participation may be presented. Neither implies the
other.

A participation-bearing Scenario names `authority_evidence.output` and
`authority_evidence.type`. Package validation requires that name and type to match
a declared Scenario output. Autonomous execution needs no authority supply. Before
invoking an adapter for a delegated or attended execution, the kernel requires
`--authorize <authority>` to match every evaluated Authority Requirement. For
package-delegated work with attention timing `none`, that assertion is supplied
only after the named separate delegate returns its proposed evidence; it does not
require stakeholder permission. For attended work, it comes from the authority
holder. The assertion authorizes publication but is not lifecycle satisfaction. Each invocation
must return the named exact Lifecycle Data output; omission fails before completion
or publication. The kernel validates the package-declared output name and type but
does not recognize Review or Decision type IDs. Instead, it derives the protected
Lifecycle types from every selected-package `authority_evidence.type` contract.
`req new --scenario` refuses all such types, even when the claimed Scenario names
a different non-authority output, so chat text, completion summaries, and borrowed
provenance cannot publish applicable authority evidence. These types publish only
inside validated atomic Scenario execution. Repository loading also requires each
such Revision to reside in its matching completed Scenario transaction with exact
output data and Scenario provenance. Raw or historical direct authority imports are
not supported and fail repository validation rather than participating in normal
lifecycle satisfaction. This is the repository's normal integrity boundary, not a
cryptographic authenticity guarantee against an actor replacing both authoritative
Markdown and its complete execution transaction. The bundled package declares REV for
Review judgment and DEC for consequential Decisions. The execution record and adapter request preserve the supplied
authority, evaluated requirement, exact Policy, and declared evidence output.
A per-execution package-delegate authority supply is not a standing delegation and
requires a fresh separate delegate context under the generic operator contract. A
caller using reusable standing authority supplies its exact reviewed DEC with
`--delegation <revision>`. Standing Delegation is an alternative exact authority
path and is not a prerequisite for package-delegated work with no scheduled
attention. The Scenario's package-declared standing-delegation
Selector must find that DEC for the exact target, Scenario, authority, and delegate,
and the evaluated requirement must allow delegation, before it can satisfy the
Authority Requirement. Expired, mismatched, unreviewed, or nondelegable authority
fails before adapter invocation.
A required link may take its expected exact identity from a named output payload
path when the source link contract targets a non-Datum exact identity; the bundled
waiver Scenario uses this to require its `waives` link to equal
`decision.payload.waiver.instance`.

Every Scenario declares exactly one authorization form: a non-empty `resolves`
catalog makes it an Obligation-authorized Resolver Scenario, while
`initiation: explicit` with an empty `resolves` catalog makes it an explicitly
initiated non-Resolver Scenario. Package validation rejects a Scenario that claims
both forms or neither.

`req scenario dry-run <scenario@version> --initiate` prepares an explicitly
initiated non-Resolver Scenario from authoritative repository Markdown. Supplied
`--input <name>=<identity>` values resolve against that exact repository snapshot
and receive the same resolution, cardinality, identity, type, package-authored
condition, and prohibited-input checks as Resolver bindings. The projection carries
one `explicit-initiation` authorization, the exact prompt and complete skill bytes,
the review Policy, output contract, generic checks, and completion expression;
it has no fabricated Obligation Instance. `req scenario execute
<scenario@version> --initiate --adapter <executable>` invokes the same prepared
projection and uses the ordinary complete-response validation and atomic
transaction publication path. `--initiate` cannot be combined with `--obligation`,
cannot target a Resolver Scenario, and intentionally has no fixture mode.

`req scenario dry-run <scenario@version> --obligation <exact-instance>
[--snapshot <fixture>]` starts from one evaluated Obligation Instance rather than
a resolver name alone. Only an instance already marked Dispatchable for that exact
Scenario can produce an executable projection. Without `--snapshot`, the command
derives a fresh snapshot from authoritative repository Markdown under the same
enabled Phase preparation used by Scenario execution. An explicit fixture remains
available for reproducible package tests and historical evaluation. The command
resolves package-authored bindings against the evaluated snapshot; validates
runtime resolution, cardinality, identity, type, optional input conditions,
prohibited caller inputs, and exact prompt/skill assets; and returns versioned
Obligation, Scenario, prompt, review Policy, waiver Policy, and evaluated
participation evidence. Loose Ends and `req next` carry the same participation
result when the Resolver inputs are resolved. Expected outputs retain cardinality,
types, and required links. Generic output checks and
the package completion expression remain explicitly pending until an adapter
supplies outputs. Dry-run invokes no adapter and writes no Lifecycle Data,
execution record, or generated projection. When the Scenario declares
`standing_delegation`, dry-run also evaluates its exact package Selector for each
resolved invocation and projects the selector, authority, delegate, target input,
target Revision, and ordered `applicableEvidence` Revision IDs. This is public
execution guidance, not authority by itself; execution still requires the operator
to supply one projected exact Revision with `--delegation`.

`req scenario execute <scenario@version> --obligation <exact-instance>
--adapter <executable>` derives a fresh repository snapshot, runs the identical
Dispatchability, binding, condition, prompt, skill, Policy, and prohibited-input
validation, then passes that exact projection to the explicitly configured
`mdlm-agent-adapter@1` boundary, `mdlm-agent-adapter@2` when the request
includes autonomous participation evidence, or `mdlm-agent-adapter@3` when a
non-autonomous request additionally carries explicit authority supply and declared
authority evidence. The adapter is operator-supplied executable
infrastructure; it is not package code and is invoked directly without a shell.
Its response names each invocation's declared outputs as complete Lifecycle Datum
proposals and supplies completion evidence.

When an output uses the package-defined type bound to `exact-baseline@1`, the
adapter proposes its exact definition members, evidence, and composition but may
not author the kernel-managed snapshot. Before evaluating package completion, the
kernel validates those references and composition, resolves Stable links, hashes
exact member bytes, records exact process provenance, adds the snapshot, and
re-derives frozen storage for the complete prospective lifecycle snapshot. The
completion expression therefore observes the same frozen baseline state that one
atomic transaction will publish. Failed finalization, completion, or publication
exposes neither the baseline nor an execution record.

Before publication, the wrapper rejects undeclared outputs, per-invocation
cardinality or type errors, invalid Datum Envelopes and payload schemas,
source-owned link failures, missing Scenario-required links, invalid lineage,
kernel-managed payload authorship, and a false package completion expression.
The completion host receives the concrete input/output entities plus
`execution.integrity.contract_valid`. The repository compares all Markdown input
truth again after adapter return, stages every Datum and the execution record
outside the readable data tree, then exposes the complete set with one same-
filesystem rename into `.lifecycle/data/.transactions/<execution-id>`. Repository
scans recurse through this transaction namespace as ordinary Markdown truth, so a
reader can observe either none or all of an execution's outputs. A successful `mdlm-scenario-execution@1` record preserves exact input bytes,
package digest, prompt and skill bytes and hashes, review and waiver Policies,
adapter/request/response hashes, exact output identities, completion evidence,
authorization mode, and the Obligation Instances obtained by reevaluating the
resulting Lifecycle Data. Participation-bearing autonomous execution uses
`mdlm-scenario-execution@2`, which additionally preserves the participation Policy,
evaluated Authority Requirement, and Attention Schedule. Delegated or attended
execution uses `mdlm-scenario-execution@3`, which also preserves supplied authority
and the exact declared REV or DEC evidence contract.
Resolver execution provenance retains its exact Dispatchable Obligation Instance;
explicit initiation provenance records that no Obligation authorized the work.
`req scenario
execution show <execution-id>` reads that provenance; no hidden sequence selects
follow-on work.

A Package Command Alias is a dotted command ID whose declared string arguments
have exact cardinality and whose `inputs` fields are compiled
`mdlm-expression@1` values. In the implemented Scenario slice, each expression
may use only `args.<declared-name>` and safe literals and must return one identity
string or an array according to the target Scenario input cardinality. Kernel-
owned `--obligation`, `--initiate`, `--adapter`, `--authorize`, `--delegation`, `--input`, and `--json` controls cannot be
redeclared as package arguments. Alias IDs that collide with generic commands,
unknown Scenario versions or inputs, unknown argument paths, wrong expression
result types, evaluator host calls, and executable/package-code fields fail
package validation.

For example, the bootstrap `question.resolve@1` definition makes `req question
resolve --question <exact-revision> --obligation <exact-instance> --adapter
<executable>` resolve to `resolve-question@2` with the same requested input as
`req scenario execute ... --input question=<exact-revision>`. Alias resolution
then calls the canonical execution operation; it has no adapter, Dispatchability,
prohibited-input, output-validation, mutation, or renderer override. The durable
execution record therefore captures the canonical Scenario request and exact
package digest rather than inventing a second execution contract. `req process
show` discovers the exact alias definition in the selected package catalog.

### 11.1 Exact accepted-STK Change Request flow

The bootstrap change-control slice uses the same canonical execution boundary.
An exact PRB preserves its immutable source through `reports`.
`analyze-change-impact@2` accepts exactly one STK Revision only when that exact
identity belongs to an `intent-approved` accepted baseline. A passing individual
Review or another Revision in the same Stable Datum is insufficient. The CHG
records exactly two canonical `impacts` roots: the accepted STK Revision and the
accepted baseline containing it. Package Selectors derive the complete directly
traced Review Context and verification evidence plus the promoted intent
candidate's Review/gate dependency route from those roots. Callers therefore cannot make affected evidence reusable by omission,
and unrelated roots fail the Scenario contract. Draft STK failures remain in
ordinary Phase 0 Correction and cannot enter this post-acceptance Resolver.

After CHG contextual Review passes, `approve-change-request@3` projects immediate,
nondelegable stakeholder attention for one exact `approve`, `reject`, `defer`, or
`cancel` disposition. The exact Decision applies only after its own independent
Review passes. Reviewed rejection, deferral, and cancellation close explicitly,
publish no replacement, and preserve accepted history. Only reviewed approval
makes `change-revision-required@2` Dispatchable. The replacement STK's independent
Review Context includes that exact CHG and attended disposition.

Approved implementation publishes one same-lineage STK replacement with exact
`changed-under`. Its exact Revision identity derives ordinary fresh Review Context
and Review work. `stakeholder-change-candidate-required@1` then freezes one
CHG-linked `intent-level-candidate` containing the replacement, its fresh context
and Review, and every exact accepted definition/evidence item outside the bounded impact.
The candidate reuses the existing independent intent-candidate simplification Review
interface with every exact candidate member, the CHG, and its disposition declared
to the Assignment. The promoted
predecessor candidate, its contexts, Reviews, gate Decision, gate Review, and other
affected evidence are replaced or explicitly project Stale, while unaffected
accepted evidence remains reusable. Failed CHG, replacement STK, and candidate BSL
Reviews use `revise-stakeholder-change-after-review@1`, one deep same-lineage
Correction interface with two autonomous cycles before attended escalation. A failed
disposition Review uses renewed attended judgment through
`revise-change-disposition-after-review@1`; every replacement receives fresh Review.
The shared-requirement slice extends this exact route to one accepted SYS Stable Datum consumed by at least two DWP Revisions. Each DWP binds the exact SYS Revision through `decomposes` and retains its own complete coverage account. Draft replacement derives serial consumer reevaluation without CHG. Accepted replacement derives every consumer plus dependent Review Context, Review, candidate/gate, and verification Revision from exact links; only a reviewed attended Change Request disposition permits one same-lineage `changed-under` SYS, after which consumers update serially with fresh coverage and Review before a selective level candidate and exact closure.

`close-change-request@3` becomes Dispatchable only with the exact replacement,
Review Context, passing STK Review, candidate, and passing candidate Review. One
atomic publication creates a `change-closure` DEC citing all exact evidence and
the next closed PRB Revision. `change-status@2` reports reviewed terminal
disposition or implementation progress independently from maturity, validity,
disposition, and relationship overlays. No STK, PRB, CHG, original-V, or change-
status identifier is recognized by generic source.

### 11.2 Reviewed pilot measurements and expansion Decision

`PAS@1` is a package-owned generated lifecycle type whose structured payload
records Review/Review Context volume, observed agent tracer-issue and exact Git-
commit effort, localized-change reuse and Staleness explanation checks, Loose
End usefulness, gate ceremony, environment-profile sufficiency, verification
discrimination, actual scope reduction, limitations, and one `proceed`, `change`,
or `stop` recommendation. It is durable Markdown truth rather than a disposable
generated report.

The exact source observations are first frozen as supporting evidence in a
`pilot-assessment-context` BSL. `pilot-assessment-required@1` selects that exact
context and authorizes `assess-phase-0-2-pilot@1`; direct PAS creation is rejected
by generated authorship. Its exact `measures` link keeps the immutable evidence
context distinct from the assessment payload.

PAS participates in the ordinary package review Policy. Until a passing
contextual REV exists, `pilot-expansion-decision-required@1` remains blocked by
the exact Review Obligation. `decide-pilot-expansion@2` then requires the DEC
`decision` to equal the reviewed PAS recommendation. Source-owned `justifies` and
`relies-on-review` links preserve the exact PAS and passing REV. The pilot records
`change`: selective reuse, explanations, Loose End routing, environment profiles,
and verification discrimination worked, while ceremony was high and no
challenged scope item was removed. The package contains no Phase 3–6 definitions,
so the Decision is durable before that deferred work can begin. Generic source
recognizes neither PAS nor the assessment Phase, metrics, or recommendation.

## 12. Phases and gates

Phases list applicable scenarios and obligations and declare entry, gate, and
progression expressions. They may also declare named `attention_checkpoints`,
each with one package-authored readiness expression. A checkpoint-valued
Participation Policy result is valid only when that exact checkpoint is declared
by the selected Phase. They do not prescribe an imperative sequence. The
loose-end engine repeatedly evaluates obligations and dispatches ready resolvers.
A nonterminal `progression` names its next Phase, readiness expression, exact
authorization condition, standardized participation Policy, sign-off Scenario,
and evidence Selector. Policy arguments and exact authorization-subject selection
are authored as typed expressions; the generic evaluator does not know the
package's authority vocabulary. A Phase with no declared progression uses
`progression: null`; that absence alone never claims successful termination.

Inactive checkpoint-scheduled work does not interrupt otherwise eligible work,
and immediate attended work retains priority while the checkpoint is inactive.
At activation, the Operator Outcome selects the complete compatible Consolidation
Group before other attended work at that same boundary and contains exact subject
payloads, blocking context, and the first exact Assignment. The Assignment packet
declares freeform harness-owned semantic mapping, no transcript persistence by
default, and serial publication with reevaluation. MDLM does not infer mappings
from conversation text, and checkpoint scheduling does not change a Question's
formal disposition. A formal deferral requires an exact deferred QST Revision
with `reactivation_condition` plus its exact scoped DEC and policy-required
passing Review.

The selected implementation Profile declares successful terminal semantics under
`terminal_outcomes`. Each optional `profile_boundary` or `lifecycle_complete`
declaration contains one typed `mdlm-expression@1` `condition` and one non-empty
package-authored `explanation`. The evaluator retains the exact condition source,
Boolean result, selected Profile reference, and ordered Selector evidence. Profile
Boundary additionally reports the Profile's `disabled_capabilities` and the Active
Phase's `omitted_capabilities`. If neither exact condition holds after reachable
Assignment and immediate Attention work is considered, the Operator Outcome is
Process Dead End. If both hold for one exact state, evaluation is Invalid rather
than choosing a success result. Package loading rejects malformed declarations,
unresolved expression references, and statically identical conditions for the two
incompatible results.

`evaluateLifecycle` resolves the requested Phase from the loaded catalog and
returns its entry result and selected exact typed candidate identities. Both
conclusions retain the authored textual source and deterministic evidence from
all evaluated Selectors. Empty selections and failed entry therefore explain
which package expression and Selector results blocked progress. Selector
`order_by` paths, followed by exact entity identity, define stable ordering; the
evaluator recognizes neither Phase IDs nor candidate lifecycle types.

A Phase gate names the versioned Obligation that controls gate action. Its
completion expression is evaluated separately for every selected exact candidate
under `candidate_as`. Each result includes authored expression source, exact
Policy and Selector invocations, and that exact gate Obligation Instance's status,
blockers, Dispatchability, eventual resolver, and currently actionable resolver.
An unreviewed sign-off therefore makes review actionable without dispatching a
duplicate sign-off. With `--snapshot`, Phase, Loose End, and next-work commands
evaluate an explicit fixture. With `--phase` and no fixture, the same package-
neutral projection is built from authoritative repository Markdown and the exact
selected package reference; generated indexes and reports are not read. A phase
gate is complete only when its expression is true for the exact current candidate.
Changes produce a new candidate and new gate evidence; no candidate or prior
result is mutated in place.

Phase progression is derived rather than stored in a mutable active-Phase pointer.
The evaluator follows declared `next_phase` references only after both readiness
and exact authorization are satisfied. The status projection distinguishes gate
completion, readiness, authorization, required stakeholder attention, the public
Scenario that can publish it, and exact evidence Revisions. A gate-signoff DEC may
be the progression evidence itself. A package that requires separate approval
instead declares a condition and evidence Selector for a distinct reviewed DEC.
Unreviewed or rejected Decisions remain inspectable history but do not advance the
active Phase. Progression need not invent a human Decision when package Policy
classifies the boundary as autonomous: the bootstrap Phase 1 boundary advances on
its exact frozen pilot-assessment context with `package-evidence` authority and no
stakeholder attention.

## 13. Package validation

`req process validate` must reject:

- meta-schema violations and manifest/catalog disagreement;
- unresolved or version-mismatched template, Policy, Selector, Computed State,
  Obligation, Scenario, or Phase references;
- complete Template, Selector, Computed State, or Policy dependency cycles;
- illegal schema widening;
- duplicate inherited outgoing-link IDs;
- unknown primitive paths or relations;
- wrong selector argument kinds or types;
- invalid resolver input bindings;
- impossible cardinality and required-link combinations;
- policies with duplicate priorities;
- scenario outputs without a resolvable type;
- obligations without an enabled resolver;
- Package Command Alias command/argument conflicts, unresolved Scenario or input
  references, unknown argument paths, host calls, or wrong typed binding
  cardinality; and
- attempts to redefine the kernel envelope or primitive catalog.

Package fixtures should include both valid examples and one focused invalid fixture
for each rejection class.

The initial package-neutral CLI installs a compatible local package into an
immutable `<id>@<semantic-version>` slot and records selection separately in
`.lifecycle/process-selection.json`. That record includes the exact package
reference, `mdlm-expression@1` version, install path, and SHA-256 content digest;
installation alone never activates the package. `req process use` changes only
that selection and deliberately does not reinterpret an initialized repository's
contract. `req process migrate <package@version>` is the public operation for
changing both: it resolves one exact installed target, validates the package,
requires unchanged kernel-owned repository contracts, validates all authoritative
Markdown and exact baselines under the target, and only then atomically replaces
the selection and repository descriptor. Failure leaves both files byte-for-byte
unchanged. Historical Datum and Scenario execution provenance is not rewritten;
the exact authoring package remains installed so authority-evidence transactions
continue to validate against their recorded package reference and digest. Human
and JSON output identify both old and new exact packages. `req process show`, `validate`,
and `capabilities` use only an explicit `--ref` or recorded selection. Their JSON
and human views share one semantic projection containing exact package and
language versions, compilation/reference/capability validation, diagnostics,
context roots and paths, operators, host functions, collections, relations,
selected Kernel Capability surfaces, and versioned definition catalogs. The CLI
contains no Example Process Package type or Phase identifiers.

`req process expression evaluate <definition>@<version>#<field>` evaluates the
already compiled field against an explicit snapshot and JSON binding object. The
field carries its package-load contract so the command reports and enforces the
actual binding names and expected return type rather than accepting a raw
expression context. Supplied exact Revision IDs resolve to entities from that
snapshot. Evaluation records expression-local source spans and ordered
intermediate Relation, Selector, Policy, and Computed State evidence. Generic
`req relation|selector|policy|state|obligation evaluate` commands use that same
selected package and snapshot host. Human and JSON views project the same result,
traversed versioned definitions, evidence, and selected package/language versions;
parser nodes and query helpers remain private.

`req phase status [<phase>]`, `req loose-ends`, and `req next` evaluate through
the same public lifecycle evaluator. An explicit Phase preserves historical
inspection. Without a Phase in repository-backed operation, the kernel derives
the active Phase from package progression declarations and exact Lifecycle Data;
there is no phase-state file to edit. Phase status retains entry, progression,
exact candidates, an independent Obligation status summary, exact gate results,
blocker chains, Resolver Scenario output contracts, and Waiver Policy evidence.
Loose End output keeps satisfaction, status, subject, blockers, unresolved
bindings, eventual and actionable resolvers, Dispatchability, outputs, and waiver
applicability as separate fields. Applicable waivers remain outside current Loose
Ends but are reported separately as waiver-suppressed Obligation evidence. `next`
selects only the first deterministically ordered Dispatchable Loose End. When no
Obligation is Dispatchable but a ready Phase awaits authorization, it instead
projects one package-declared progression item with the public Scenario, exact
subjects, Authority Requirement, and Attention Schedule needed for agent execution.
It does not infer a batch where the Process Package declares no batching contract.
Human and JSON renderers consume these package-neutral projections.

`req process init <path>` creates a package-neutral `0.1.0` authoring scaffold
with only the supported versioned meta-schema, kernel Datum Envelope,
`mdlm-expression@1` contract, primitive catalog, empty definition catalogs, and
explicit creation provenance. `--from <package-ref>` instead copies a validated
package, assigns the destination basename as a new package identity, resets its
independent version to `0.1.0`, and records the exact source reference and digest.
It does not install or select the new package. `req process definition new`
creates editable skeletons for Payload Templates, lifecycle types, Selectors,
Policies, Computed States, Obligations, scenarios, phases, profiles, and Package
Command Aliases while updating the appropriate manifest catalog. `req process
fixture new` writes an explicit snapshot and versioned expected-evaluation shape;
`req process test` evaluates those fixtures through `evaluateLifecycle` and fails
on a structural result mismatch.

`req init --process <package-ref>` atomically creates the first durable repository
layout, installs and selects the exact package, and records its content digest,
Datum Envelope, artifact format, expression language, and primitive catalog
contracts. `req new <type> --scenario <scenario@version> --set <path>=<value>`
generates a random Stable ID and exact first Revision ID, validates the resolved
payload schema and source-owned outgoing-link cardinalities/targets, captures the
selected package digest in creation provenance, and atomically renames one staged
Markdown Stable Datum directory into place. Failed validation writes no Lifecycle
Datum. `req revise <stable-id> [--from <revision-id>]` copies one exact frozen
Revision into the next sequential Revision while preserving the Stable Datum ID.
The initial concurrency profile permits at most one local editable Revision per
Stable Datum: another `revise` is refused with the exact competing Revision and
never rewrites or renumbers lineage. Fully staged content is published with an
exclusive same-filesystem link so a concurrent exact-Revision collision also
fails without replacement. `req history <stable-id>` orders exact lineage and
separates `frozen-history` from `editable-work`, including the exact capability-
bound baselines that freeze each Revision. Storage immutability is derived through
the selected `exact-baseline@1` binding rather than a lifecycle type ID.

`req link <source-revision> <target> --type <relationship>` and `req unlink`
atomically mutate only an editable exact source Revision. The complete resulting
link set is validated against that Revision's resolved source lifecycle type,
including target kind, target lifecycle type, Stable-versus-Revision identity,
and minimum/maximum cardinality. Invalid or frozen-source mutations leave both
Markdown truth and disposable indexes unchanged. Exact Obligation Instance links
are validated against a known versioned Obligation and existing exact subject.
No inverse edge is stored. `req backlinks <identity>` computes inbound edges from
outbound Markdown and projects the source Revision, source type, authored target,
target identity kind, and source-owned inverse label. `req trace <identity>
[--relation <id>] [--depth <n>]` walks those edges in either direction. A Stable
Datum root uses its exact Revisions as zero-loss edge sources while the result
keeps Stable Datum, exact Revision, and exact Obligation Instance identities
explicit and separate.

When the selected package binds `exact-baseline@1`, `req baseline create --type
<bound-type>` creates that package-defined type with empty kernel-owned
`definition_members` and `evidence` sections while accepting ordinary authored
payload fields and Scenario provenance. `req baseline add|remove` changes exact
definition membership; `req baseline evidence add|remove` changes exact
supporting evidence; and `req baseline compose` records an exact `composes` edge
to an already-frozen Revision of the bound type. The sections remain independent
and each complete post-mutation Datum is schema- and reference-validated before
one staged replacement is published.

`req baseline freeze <baseline>` refuses missing references, invalid or cyclic
composition, and non-frozen component baselines. It resolves every authored link
on the baseline, its definition members, evidence, and composed baselines to an
exact target; hashes exact file bytes for all referenced Revisions; records the
exact selected package digest, manifest hash, envelope/catalog references, type
versions, and authored creation provenance; and writes only the kernel-managed
`snapshot`. The snapshot-bearing baseline, definition members, and evidence then
project as frozen and reject repository mutation. A later Revision of a Stable
link target does not invalidate the historical freeze-time resolution.

`req baseline verify <baseline>` recomputes referenced exact-file hashes, checks
that every exact member, evidence, composition, and stored link resolution still
exists, validates frozen capability-bound composition and cycles, and verifies
snapshot provenance against the exact selected package. Changed bytes, missing
references, invalid composition, resolution corruption, and provenance mismatch
return typed diagnostics. Packages without a compatible binding receive
`kernel-capability-unavailable`; the executable does not recognize a lifecycle
type ID as a baseline.

`req baseline diff <old> <new>` pairs exact definition/evidence Revisions by Stable
Datum identity and submits those comparisons plus the capability-bound baseline
comparison to the ordinary lifecycle evaluator. It returns deterministic typed
content, outbound-link, Stable-link-resolution, membership, composition, evidence,
and Process Drift records. Each changed exact subject retains the package-derived
Computed States and explanations that selected those exact records; the CLI does
not manufacture a Stale Boolean or recognize a State dimension name. Snapshot
integrity fields are not misreported as authored content.

`req show` and `req list` scan Markdown truth and add package-derived states,
Obligation Instances, backlinks, and bound Kernel Capabilities. Storage
immutability is derived generically from exact frozen-baseline memberships and a
resolved type's `terminal-outcome` lifecycle declaration; the repository does not
recognize the Review type ID. Before publishing
any generated output, `req doctor` validates repository/package compatibility,
all Markdown envelopes and references, and every frozen capability-bound baseline
hash, resolution, and composition claim. Provenance divergence is counted as
informational Process Drift rather than structural invalidity. It then atomically
rebuilds a deterministic disposable index and lifecycle projection report. Reads and
revision/link transactions never depend on generated output; deleting or
corrupting `.lifecycle/generated` changes no durable lifecycle result.

## 14. Bootstrap scope

Bootstrap package 0.57 models MAP, QST, DEC, ART, PSP, STK, SYS, ASP, ICSP,
DWP, VSP, ENV, VER, VAI, RUN, RES, REV, BSL, PRB, CHG, and PAS. MAP is a linked frontier index and ART records
an exact implementation or prototype pointer with its supported and intentionally
unsupported behavior. A QST may explicitly require prototype evidence by declaring
one exact Git commit, bounded supported and unsupported behavior, and the two
permitted findings. A package-owned Selector routes only those exact frozen QST
Revisions to a Resolver that atomically publishes ART, resolving DEC, and the next
answered QST Revision; empirical questions without that declaration retain the
generic evidence path. Mutable targets, out-of-bound findings, incomplete batches,
and RUN/RES substitutions fail before publication. The narrow repository-backed
Phase 0 tracer begins with a Phase-scoped map Obligation, then derives PSP and STK
work, exact Review Context and Review work, and candidate construction from
Lifecycle Data. A failed current STK foundation Review exposes one subject-bounded replacement
Assignment with every current failed REV and its structured Review Findings. The
same-lineage replacement must cite those exact Reviews through `corrects-review`;
normal reevaluation then derives a fresh Review Context and independent Review.
One parameterized package Selector distinguishes the initial failure, first failed
replacement, second failed replacement, exhausted lineage, and stakeholder-owned
intent from immutable Revisions, Reviews, and causal links. Two autonomous
replacement-and-Review cycles are permitted. A second
replacement failure projects immediate attended escalation with exact history;
`correction_authority: stakeholder` does so immediately without consuming that
budget. Assignment malformed-response attempts are ignored operational state and
never enter these Selectors. The versioned requirement template supplies both
`corrects-review` and the distinct `changed-under` contract to STK and SYS without
type-family or multiple-inheritance mechanics. Immutable failed Revision and Review
history remains inspectable. The tracer reviews MAP, PSP, and STK separately in
exact frozen contexts whose `scope` names the one primary subject Revision; each
context may still include supporting parent or sibling Revisions. It then freezes
the earliest complete evidence-bearing intent candidate. Its Review Context must
contain the candidate and every exact MAP, PSP, and STK member, and the independent
Assignment receives those member Revisions directly so their complete contents—not
only IDs and hashes—are available for judgment. That candidate's required Review
is the dedicated `simplification-product-definition` judgment, so no second
context or duplicate candidate-review ceremony is introduced. A failed
simplification REV groups every current blocking finding for one exact target and
must carry exactly one matching canonical `blocks` link. That target routes through
foundation correction or the candidate through one causal superseding-candidate
interface; distinct targets are surfaced serially by fresh complete-set Reviews.
The interface permits two autonomous cycles and then changes participation to
immediate attended escalation while retaining the same Assignment shape and
complete immutable history.

A reviewed gate rejection records one canonical exact blocker set in `blocks`
links plus structured rationale applying to that set. It derives causal same-
lineage Phase 0 member correction, requires fresh Reviews, preserves unaffected
candidate evidence, and returns the superseding candidate's fresh simplification
Review to the same gate. Failed Question and gate Decisions receive same-lineage
`corrects-review` replacements and fresh independent Reviews under attended
stakeholder authority; after two causal replacements, the same interface carries
explicit exhausted-lineage escalation. A reviewed approving gate mechanically
derives one frozen `intent-approved` BSL containing exact candidate, candidate
Review, DEC, and DEC Review evidence before progression. Rejection itself is not a
stop, deferral, or cancellation Decision. The supported Phase 2 and pilot-assessment routes now carry exact Correction,
Review, escalation, and explicit terminal behavior through issue #100.

The Phase 1 tracer derives required VSP work from exact entry requirements, then
derives one atomic ENV and qualification VER/VAI realization from each applicable
exact strategy. Generated RUN/RES work follows from the exact qualification VAI.
Environment Review Context work waits for passing qualification and freezes the
exact VSP, ENV, qualification VER, RUN, and RES Revisions before independent
judgment. A failed current VSP, ENV, or pilot VER Review derives a package-owned
same-lineage correction Scenario rather than a null work queue. Corrections carry
every exact failed REV and Finding applicable to the current Revision and require
fresh exact context and Review. Two replacement-and-Review cycles are autonomous; continued failure changes
the same Scenario participation to immediate attended stakeholder authority. ENV
correction also publishes a new qualification VER/VAI pair atomically; qualification
RUN/RES evidence from the failed ENV Revision cannot be borrowed by its replacement.
VSP Review precedes dependent ENV and pilot VER fan-out, and assurance tied to the
prior exact strategy cannot satisfy a replacement. Multiple applicable
strategies, environments, or pilot targets reach the narrow profile's declared
boundary rather than arbitrary selection or Process Dead End; missing or incomplete
evidence remains ordinary Obligation, Question, or validation work.
Exact requirement and VSP Revision evidence then derives pilot VER work. The
presence of current pilot activity work also derives exact ART registration when
its requirement has no target. That Resolver records one immutable Git commit,
bounded supported/unsupported behavior, and a controlled public execution interface
containing the repository locator, an ordered typed command matrix with every
parameter co-located with its exact encoding and four case tokens, an isolated
working-directory contract, exact normal/raw-malformed/omitted/extra argument
cases, and case-specific exit status plus base64 stdout/stderr bytes. The matrix
instantiates full vectors by construction: omitted markers can occur only on
declared parameters, raw empty tokens remain supplied, extra-only tokens retain
their position, and ordered duplicate common tokens are preserved. It makes no verification,
acceptance, or scope-authorization claim; an existing singular boundary-complete
target satisfies the work while multiple current targets remain ambiguous. A passing
VER Review plus one qualified
reviewed ENV Revision and one ART Revision derive separately authorized VAI work; that transaction records both the VAI
Revision and its exact authorization DEC. A source-blind pilot VAI records
bounded checkout, environment-check, and product-case deadlines solely for
infrastructure safety, plus process-group termination, forced kill and reaping,
partial raw observation, guaranteed cleanup, and continue-through-all-cases
aggregation. Failed VAI Review derives same-lineage correction carrying every
applicable Review and Finding while preserving exact activity, ENV, ART, case, and
pilot claim-class bindings. Prior VAI/RUN/RES/Review evidence remains immutable;
the replacement requires fresh context, independent Review, and exact run work.
The VAI Review then unlocks execution bound to the package-resolved exact target
Revision without an operator selecting core Scenario names.
Package schemas distinguish qualification `environment-capability`, pilot
`verification-design`, and formal `requirement` claims. RUN and RES are
package-declared generated terminal types: generic direct creation and revision
are refused, validated Scenario execution publishes them atomically, and terminal outcomes are
immutable. Qualification support artifacts do not link to a requirement. A pilot
must record positive success and negative discrimination observations; Scenario
completion rejects a formal claim from that pilot even when the proposed RES is
otherwise schema-valid.

The Phase 2 tracer records one reviewed DWP plan in exact ASP, ICSP, and VSP
context, derives exact question, execution, output-Review, parent-coverage, and
dedicated simplification Obligations, and publishes a completion Revision in the
same DWP lineage. Its reviewed group candidate contains exact DWP, SYS, ASP, and
ICSP Revisions. The reviewed SYS level candidate composes that exact group while
retaining shared VSP, ASP, and ICSP members, then reaches exact reviewed gate
authorization. Required Scenario links normalize an input Revision to Stable
identity only when the package-owned source contract requires it. Kernel identity
syntax permits three-to-eight-character uppercase type prefixes, but the kernel
recognizes none of these example IDs.

Phases 0, 1, and 2, exact change control, and the reviewed pilot assessment
remain explicit bootstrap subsets. The observed expansion Decision is `change`: it enters the declared narrow
change-control route and reaches the Profile Boundary after supported work drains.
Complete promotion, formal verification, component/design decomposition, and
implementation remain deferred until ceremony is reduced and scope removal is
demonstrated. The
purpose is to validate the kernel/process seam, schema composition, graph querying,
review evidence, baselines, policies, obligations, Scenario execution, gate
routing, and evidence-based process assessment before broader lifecycle breadth.
