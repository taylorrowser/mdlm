# MDLM Declarative Process Package Reference

**Bootstrap package 0.9 — experimental implementation reference**

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
Payload properties and required fields are additive. A child may tighten a parent
constraint but may not remove a required field, widen an allowed value, or change
a field to an incompatible type. Duplicate outgoing-link IDs in one resolved
chain are rejected rather than overridden.

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
- `dependency-changes` — from a revision to conservative, kernel-classified
  content, link-resolution, evidence-target, or review-context changes;
- `scenario-inputs` and `scenario-outputs` — from one scenario execution to its
  declared bound data.

Relations return typed entities or typed change records. Traversal is
side-effect-free and deterministic. Adding a relation primitive requires a kernel
interface version; adding a selector over existing relations does not.

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
ambiguous dependencies between differently scoped obligation instances.

Obligation identity is:

```text
<obligation-definition-id>@<version>:<subject-revision-id>:<process-ref>
```

When a resolving scenario creates a new subject revision, the former instance is
historical and the current selector is reevaluated. Historical obligation records
are explanations, not new lifecycle datum types.

## 11. Scenarios

A scenario declares named typed inputs and outputs, cardinalities, required links,
its prompt, review policy, prohibited inputs, completion expression, and the loose
ends it resolves.

The execution wrapper binds `input.<name>`, `output.<name>`, and `execution`.
Generic contract validation checks declared cardinality, schema validity, link
contracts, required input/output links, and undeclared outputs. The completion
expression may add process-specific conditions but should not duplicate those
generic checks.

Prompts choose and order skills. Execution provenance records the exact prompt,
skills, policies, process reference, and inputs actually used.

## 12. Phases and gates

Phases list applicable scenarios and obligations and declare entry and gate
expressions. They do not prescribe an imperative sequence. The loose-end engine
repeatedly evaluates obligations and dispatches ready resolvers.

A phase gate is complete only when its expression is true for the exact current
candidate. Changes produce a new candidate and new gate evidence; no candidate is
mutated in place.

## 13. Package validation

`req process validate` must reject:

- meta-schema violations;
- unresolved asset, template, policy, selector, state, scenario, or phase refs;
- template inheritance cycles or illegal schema widening;
- duplicate inherited outgoing-link IDs;
- unknown primitive paths or relations;
- selector, state, policy, or obligation recursion;
- wrong selector argument kinds or types;
- invalid resolver input bindings;
- impossible cardinality and required-link combinations;
- policies with duplicate priorities;
- scenario outputs without a resolvable type;
- obligations without an enabled resolver;
- attempts to redefine the kernel envelope or primitive catalog.

Package fixtures should include both valid examples and one focused invalid fixture
for each rejection class.

## 14. Bootstrap scope

Bootstrap package 0.8 continues to model only PSP, STK, SYS, REV, BSL, QST, and DEC. Phase 0
and Phase 2 remain explicit bootstrap subsets. The purpose is to validate the
kernel/process seam, schema composition, graph querying, review evidence,
baselines, policies, obligations, and gate routing before adding architecture,
verification, implementation, or change types.
