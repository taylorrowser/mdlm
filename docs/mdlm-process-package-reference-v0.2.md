# MDLM Declarative Process Package Reference

**Bootstrap package 0.21 — experimental implementation reference**

The `.lifecycle/process` package declares the exact `mdlm-expression@1`
authoring contract. Every expression-bearing field accepts textual source only;
package loading rejects authored YAML expression trees before evaluation. The
language includes typed Selector, Policy-result, Computed State, and finite
universal-quantification operations. The target architecture is described by
`mdlm-process-overview-v0.8.md`, including complete textual expression coverage,
process-neutral core semantics, Kernel Capabilities, and the V-model as an
Example Process Package. The bootstrap now binds a package-defined type to
`exact-baseline@1`; other unmigrated v0.8 behavior is not silently claimed as
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
  scenario: draft-stakeholder-requirements@1
  prompt_ref: prompts/draft-stakeholder-requirements.md@1
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

The resolved type shown by `req schema <type>` is the kernel envelope plus the
flattened payload schema and outgoing-link contracts.

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
    cardinality: {minimum: 1, maximum: 1}
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
  `references_valid`, and `hash_valid`;
- `provenance.process_ref`;
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
  target, and explicitly identified review-context comparisons;
- `scenario-inputs` and `scenario-outputs` — from one scenario execution to its
  declared bound data.

Relations return typed entities or typed change records. Every
`dependency-change@1` record names the subject and exact before/after Revisions;
variant fields describe a changed content path, an outbound link target set, a
stable link's changed exact resolution, exact member/component/evidence sets, or
changed exact review contexts. Baseline-specific variants are available only when
both compared Revisions use the type selected by `exact-baseline@1`; the kernel
never recognizes `BSL`. These records never contain a Stale Boolean. The package
filters them with `staleness-relevant-dependency-changes-for`; the `validity`
Computed State supplies the Stale conclusion and attaches the selected structural
records to its explanation.
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

The universal binding receives the Selector's declared result kind and its
predicate must return Boolean. Expressions cannot execute arbitrary code, access
the filesystem, make network requests, mutate data, or invoke undeclared
functions.

### 6.3 Fact-to-fact comparison

Both comparison operands are values, so process drift is declared directly:

```yaml
when: 'subject.provenance.process_ref != process.current_ref'
```

The kernel does not need a special `process.drift` fact.

## 7. Parameterized relational selectors

Selectors are named, reusable queries with typed parameters:

```yaml
id: passing-reviews-for
parameters:
  - {name: subject, kind: revision}
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
  - {name: subject, kind: revision}
default: {required: false, rubric_ref: null}
rules:
  - priority: 300
    when: 'subject.identity.type in ["PSP", "STK", "SYS"]'
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

An obligation is instantiated once for each result of its subject selector. It
declares:

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
<obligation-definition-id>@<version>:<subject-revision-id>:<process-ref>
```

When a resolving scenario creates a new subject revision, the former instance is
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
its prompt, review policy, prohibited inputs, completion expression, and the loose
ends it resolves.

The execution wrapper binds `input.<name>`, `output.<name>`, and `execution`.
Generic contract validation checks declared cardinality, schema validity, link
contracts, required input/output links, and undeclared outputs. At package load,
Obligation resolver bindings must cover exactly the referenced Scenario inputs
with compatible identity, lifecycle types, and cardinality. An enabled Obligation
must have its Resolver Scenario enabled in the same Phase. Scenario output types,
prohibited-input conflicts, and required-link names, targets, target types, and
cardinalities are rejected before execution. The completion expression may add
process-specific conditions but should not duplicate those generic checks.

Prompts choose and order skills. Execution provenance records the exact prompt,
skills, policies, process reference, and inputs actually used.

## 12. Phases and gates

Phases list applicable scenarios and obligations and declare entry and gate
expressions. They do not prescribe an imperative sequence. The loose-end engine
repeatedly evaluates obligations and dispatches ready resolvers.

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
duplicate sign-off. A phase gate is complete only when its expression is true for
the exact current candidate. Changes produce a new candidate and new gate
evidence; no candidate or prior result is mutated in place.

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
- attempts to redefine the kernel envelope or primitive catalog.

Package fixtures should include both valid examples and one focused invalid fixture
for each rejection class.

The initial package-neutral CLI installs a compatible local package into an
immutable `<id>@<semantic-version>` slot and records selection separately in
`.lifecycle/process-selection.json`. That record includes the exact package
reference, `mdlm-expression@1` version, install path, and SHA-256 content digest;
installation alone never activates the package. `req process show`, `validate`,
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

## 14. Bootstrap scope

Bootstrap package 0.21 continues to model only PSP, STK, SYS, REV, BSL, QST, and DEC. Phase 0
and Phase 2 remain explicit bootstrap subsets. The purpose is to validate the
kernel/process seam, schema composition, graph querying, review evidence,
baselines, policies, obligations, and gate routing before adding architecture,
verification, implementation, or change types.
