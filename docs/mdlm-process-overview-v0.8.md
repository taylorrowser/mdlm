# Markdown Lifecycle Manager (`mdlm`) — Process Overview

> **Historical prototype design — not supported operating instructions.** This
> accepted v0.8 baseline preserves the design vocabulary and evidence available at
> the time. Commands naming `req`, direct mutation, scenario dry-run/execution,
> executable adapters, package install/use/scaffolding, or Package Command Alias
> invocation are historical only. Use the current repository README for supported
> operation.

**Accepted v0.8 historical design baseline**

> Working name. “Wayfinding” refers only to Phase 0, which aligns with the Matt Pocock wayfinder pattern.
>
> This version integrates the typed declarative process model and findings from the first evaluator vertical slice. It separates process-neutral MDLM core from the complete bundled V-model example while explicitly distinguishing demonstrated behavior from target behavior.

### Evidence labels

This overview uses four confidence labels where implementation status matters:

- **Validated by vertical slice** — exercised through a public evaluator interface with a behavior test or runnable example.
- **Provisional and implemented** — represented in process data or code but not exercised deeply enough to treat as validated.
- **Specified, not implemented** — intended target behavior whose implementation remains future work.
- **Deferred** — deliberately outside the current implementation profile.

“Implemented” in this document never implies that the durable repository kernel or complete `req` CLI exists.

### Acceptance boundary

v0.8 accepts the core/example-package boundary, declarative package model, expression and evaluator contracts, generic CLI shape, bundled V-model intent, and stated invariants as the current design baseline. Acceptance does not claim that the v0.2 package has migrated to textual expressions or Kernel Capabilities, that the CLI exists, or that deferred lifecycle breadth has been implemented. Remaining items in `.lifecycle/process/OPEN-QUESTIONS.md` are implementation questions unless they force an observable product change.

### Major changes since v0.7

- separates the kernel-owned Datum Envelope from process-owned payload schemas;
- adds deterministic single-parent payload templates;
- moves outgoing link contracts to their source lifecycle types;
- defines a typed primitive evaluator seam and parameterized relational selectors;
- makes policies machine-readable and keeps computed-state dimensions independent;
- replaces author-authored YAML expression trees with a safe textual MDLM Expression Language;
- defines Obligation Instance identity, blocker evidence, and resolver dispatchability;
- distinguishes recorded gate sign-offs from reviewed applicable sign-offs;
- incorporates observed loose-end ordering and gate behavior from the first vertical slice;
- labels demonstrated, provisional, unimplemented, and deferred behavior explicitly;
- separates process-neutral MDLM core from the bundled V-model Example Process Package;
- separates the generic CLI and expression diagnostics from package-specific command aliases.

# Part I — MDLM Core

## 1. Purpose

`mdlm` is a portable engine for storing versioned Lifecycle Data and evaluating an explicitly selected declarative Process Package. The kernel does not prescribe one lifecycle vocabulary, phase sequence, review model, or verification method. A package defines those structures case by case from typed schemas, links, selectors, policies, states, obligations, scenarios, and phases.

Markdown remains the durable source of truth. Generated indexes, reports, and evaluator projections remain disposable. The same generic CLI and evaluator operate against any package conforming to the supported meta-schema, expression language, and Kernel Capability contracts.

The first complete Example Process Package shipped with MDLM is the software V-model described in Part II. It extracts business needs and stakeholder intent, drives them through requirements, architecture, design, implementation, and independent verification, and aggressively challenges scope. That structure demonstrates MDLM; it is not built into MDLM core and does not claim formal regulatory compliance.

## 2. Model layers

The design separates four layers that must not be confused:

1. **Hard-coded kernel** — the small set of safety and storage primitives that process data cannot redefine: identity, revision lineage, immutability, hashing, atomic writes, schema loading, deterministic rule evaluation, and provenance capture.
2. **Declarative process package** — explicitly selected versioned data defining lifecycle types, link contracts, computed-state rules, obligations, scenario contracts, prompt references, phase structure, selectors, policies, and optional Kernel Capability bindings.
3. **CLI semantic surface** — commands that expose the kernel and process package safely and ergonomically to agents and users.
4. **Implementation profiles** — subsets of the command surface and process enabled for a pilot or release. The complete target surface does not have to exist before the model is exercised.

The CLI is the normal read and mutation layer. Markdown remains the durable, inspectable storage format. The selected process package is normative for repository-specific machine behavior; this overview explains the core model and documents the first bundled example. Tables and reference documentation should be generated from the selected package rather than maintained as competing normative sources.

A repository records an exact package reference and expression-language version. `req init` may offer bundled examples, but it never silently makes one example package part of kernel semantics. Different repositories may select packages with entirely different type catalogs and phases.

The first vertical slice validated three deep conceptual seams: load and validate a process package, resolve a lifecycle type, and evaluate a lifecycle snapshot. The prototype exposes these as `loadProcessPackage`, `resolveType`, and `evaluateLifecycle`. Production adapters and CLI commands should remain layered over similarly small, deep interfaces rather than reproducing evaluator logic.

## 3. Principles

### 3.1 Core principles

1. **Lifecycle data is primary.** Durable claims and their history are not reconstructed from generated indexes or orchestration state.
2. **Stable identity is separate from revision identity.** A datum keeps one stable random ID while immutable revisions capture its history.
3. **Structure is package-defined.** Lifecycle types, phases, policies, states, obligations, and scenarios come from the selected Process Package, not hard-coded V-model nouns.
4. **State is computed in dimensions.** Packages derive independent dimensions rather than maintaining one mutable status field.
5. **Links are stored once.** Outgoing links are durable; backlinks and higher-order relationships are computed.
6. **Work is driven by computed obligations.** The CLI identifies actionable Loose Ends and the scenario capable of resolving them.
7. **Process provenance is informative, not self-invalidating.** Revisions record the assets used to create them, but later package changes do not automatically invalidate historical Lifecycle Data.
8. **Complexity must earn its place.** New primitives and Kernel Capabilities require a kernel release; new process conclusions should use selectors, policies, states, and obligations over existing primitives.
9. **Process behavior is declarative.** Phases and obligations describe required outcomes rather than hiding an imperative script.
10. **Process logic is authored as expressions.** Values, predicates, bindings, conditions, and quantifiers use one safe versioned textual MDLM Expression Language; YAML declares structure rather than exposing an expression AST.
11. **A resolver is not automatically dispatchable.** An obligation may identify the scenario that eventually resolves it while blockers make that scenario unsafe to run now.
12. **Packages do not execute code.** Process definitions, Package Command Aliases, prompts, and expressions cannot weaken kernel integrity or install arbitrary executable plugins.

### 3.2 Bundled V-model example principles

The first Example Process Package adds these package-level commitments:

1. **Product code and formal verification derive from Lifecycle Data.**
2. **Baselines are exact snapshots.** They record exact revisions, hashes, resolved links, evidence, process provenance, role, and scope.
3. **Every substantive authored revision is reviewed** in relevant sibling and architectural context.
4. **Formal verification is independent** from product source and unit tests.
5. **Execution facts, evidence claims, and judgments remain separate.** RUN records execution, RES records a scoped result, and REV records judgment where required.
6. **Prototypes make bounded empirical claims** and never silently become formal evidence.
7. **Scope must be justified** by an authorized parent, constraint, interface obligation, or accepted decision.

## 4. Repository and declarative process package

```text
.lifecycle/
  data/
    <type>/
      <stable-id>/
        r00001.md
        r00002.md
  evidence/
    <RUN-ID>/
      <RES-ID>/
  process/
    manifest.yaml
    meta/
      datum-envelope.schema.json
      expression.schema.json
      manifest.schema.json
      parameter.schema.json
      query.schema.json
      type-definition.schema.json
      template-definition.schema.json
      link-contract.schema.json
      capability-binding.schema.json
      command-alias.schema.json
      state-definition.schema.json
      policy-definition.schema.json
      selector-definition.schema.json
      obligation-definition.schema.json
      scenario-definition.schema.json
      phase-definition.schema.json
      profile-definition.schema.json
      primitive-catalog.schema.json
    primitives/
    templates/
    types/
    states/
    selectors/
    policies/
    obligations/
    scenarios/
    phases/
    prompts/
    skills/
    profiles/
  generated/
    indexes/
    reports/
    diffs/
    reference/
  work/
    # optional ephemeral orchestration state; not lifecycle truth
```

Every authored datum uses one folder per stable ID and one Markdown file per revision. Generated indexes, reports, diffs, and reference documentation are disposable and can be rebuilt.

### 4.1 Hard-coded kernel boundary

The kernel enforces behavior that process files may not weaken or redefine:

- stable ID generation and revision lineage;
- the kernel-owned datum envelope;
- one stored outbound link plus computed backlinks;
- frozen-revision and capability-managed exact-snapshot immutability;
- exact snapshot membership, link resolution, and hashing when that Kernel Capability is selected;
- atomic file operations and collision detection;
- loading and validating supported meta-schema and expression-language versions;
- typed storage, integrity, collection, and graph-relation primitives;
- deterministic expression, selector, policy, state, obligation, and phase evaluation;
- process-package version resolution and provenance capture;
- prohibition on arbitrary code execution from schemas, expressions, selectors, or policies.

A process package cannot redefine a frozen file as editable, ignore a hash mismatch, or make an invalid reference valid. Adding a fundamentally new primitive relation or transaction model requires a kernel release. Adding a selector, policy, state, or obligation over existing primitives does not.

### 4.2 Data-defined process behavior

Within the kernel primitives, the process package defines:

- payload templates and lifecycle-type payload schemas;
- required, optional, and kernel-managed payload paths;
- outgoing link contracts owned by their source lifecycle types;
- computed-state dimensions and precedence;
- reusable parameterized relational selectors;
- deterministic machine-readable policies;
- review requirements and rubric references;
- loose-end obligations, resolver bindings, and waiver policy;
- scenario inputs, outputs, completion rules, prohibited inputs, and prompt references;
- phase applicability, entry conditions, candidate selection, and gate obligations;
- baseline roles, scopes, membership, and composition rules;
- optional Kernel Capability bindings and Package Command Aliases.

Scenario definitions point to versioned prompts. The prompt tells the agent which skills to read and how to use them. Skill selection is therefore part of the executable scenario content, not duplicated as a registry field. Execution provenance records the exact prompt and skill versions actually loaded.

### 4.3 Kernel Capability contracts

A Process Package may opt a type into a versioned Kernel Capability when the type needs fixed integrity behavior beyond the ordinary Datum Envelope. The binding is by capability contract, never by hard-coded type ID.

```yaml
kernel_capabilities:
  exact-baseline@1:
    type: BSL
```

`exact-baseline@1` requires known kernel-managed payload fields and enables atomic membership resolution, hashing, freezing, verification, diffing, and baseline relation primitives. Another package may bind a differently named type, while a package that does not use exact baselines need not bind the capability. The kernel validates the capability's required schema and refuses incompatible substitutions.

Kernel Capabilities are not executable plugins. They expose only kernel-shipped, versioned operations. Adding a capability requires a kernel release; binding a compatible package type does not. Generic CLI commands advertise and operate only on capabilities selected by the active package.

The bundled V-model package binds BSL to `exact-baseline@1`. Additional capability contracts should be introduced only when ordinary schemas, links, selectors, and scenarios cannot safely express the required integrity behavior.

### 4.4 Datum envelope and process-owned payload

Every lifecycle revision has one kernel-owned Datum Envelope:

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

The kernel owns identity, revisions, type, links, provenance, the payload container, and body projection. A lifecycle type validates only its payload and outgoing links. Process definitions cannot remove, rename, or weaken envelope fields.

Some durable claims contain mechanically generated payload sections. A type declares those as `kernel_managed_payload_paths`; the kernel refuses direct author edits and populates them during the relevant atomic operation. Computed storage and integrity values are evaluator projections, not durable Markdown fields.

### 4.5 Deterministic payload templates

Payload templates provide schema reuse without becoming a macro or class language:

```text
titled-datum
  └── rationale-bearing
        └── requirement
              ├── STK
              └── SYS
```

A template or type has at most one parent. Resolution proceeds root to leaf. Fields and required sets are additive. A child may tighten only a deliberately supported subset of constraints; it may not remove requirements, change field types, widen values, or override an inherited link. General JSON Schema subsumption is not a v1 kernel responsibility.

`req schema <type>` should expose the kernel envelope, flattened payload schema, outgoing link contracts, lifecycle behavior, and review-policy result.

### 4.6 Source-owned link contracts

Outgoing link contracts live on the source type or inherited template. There is no separate normative link registry.

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

The contract defines target kind and types, stable-versus-revision identity, cardinality, freeze behavior, and inverse display label. The same relationship ID may occur on multiple source types; each source definition is authoritative. Backlinks are computed. Package validation may enforce compatible historical meaning for repeated IDs without restoring a global registry.

### 4.7 Primitive evaluator interface

The kernel exposes typed inputs, not process conclusions. An expression entity projects envelope identity directly as `subject.id`, `subject.revision_id`, `subject.type`, and `subject.revision`, with process fields under `subject.payload`, runtime storage and integrity under `subject.storage` and `subject.integrity`, and creation provenance under `subject.provenance`. Context roots include `process`, `phase`, and `execution`. Initial collections cover Stable Data and exact revisions, plus capability-bound baseline entities when available. Core relations cover outgoing and incoming links, revisions, dependency changes, and scenario inputs and outputs. The `exact-baseline@1` capability adds baseline members, evidence, memberships, and composition relations.

The process package derives conclusions such as passing reviews, candidate members missing review, current candidates, and applicable gate sign-offs through selectors. It must not ask the kernel for specialized facts such as `candidate.members_missing_review`.

`dependency-changes` returns conservative typed structural records; it does not decide that a datum is stale. Process expressions determine which change records require reassessment for a given claim.

### 4.8 MDLM Expression Language

Whenever a process field represents a value, condition, predicate, binding, or quantifier, it is authored as a source string in the safe, versioned **MDLM Expression Language**. YAML remains responsible for structural declarations. One-line expressions conventionally use a single-quoted YAML scalar with double-quoted language strings; longer expressions use a folded `>-` scalar.

```yaml
language:
  expressions: mdlm-expression@1
```

Examples:

```yaml
when: 'subject.type in ["PSP", "STK", "SYS"]'
```

```yaml
where: >-
  review.payload.outcome == "pass"
  && state(review, "validity") == "valid"
```

```yaml
satisfied_when: >-
  exists("valid-review-contexts-for@1", {subject: subject})
```

```yaml
when: 'subject.provenance.process_ref != process.current_ref'
```

The v1 language supports JSON-like literals, bound variables, typed paths, comparison and membership operators, Boolean composition, parentheses, fact-to-fact comparison, and safe host functions. The closed v1 host-function set is:

```text
state(subject, dimension)
policy(policyRef, arguments)
select(selectorRef, arguments)
exists(selectorRef, arguments)
none(selectorRef, arguments)
count(selectorRef, arguments)
one(selectorRef, arguments)
present(value)
every(selectorRef, arguments, binding, predicate)
```

`exists` and `none` test selector cardinality; `one` requires exactly one result; `every` evaluates a predicate over a finite selector result with an explicitly typed binding:

```yaml
when: >-
  every("candidate-members@1", {candidate: candidate},
        member => state(member, "validity") == "valid")
```

Relations remain structural selector query sources rather than arbitrary expression functions. New safe host functions require an expression-language interface version; package authors cannot define executable functions.

It does not support assignment, mutation, arbitrary functions, unbounded loops, filesystem or network access, dynamic loading, CLI invocation, implicit current time, randomness, environment variables, or general-purpose code execution. Time or environment values required by a package must be explicit typed snapshot context. Expressions execute inside the evaluator. The CLI invokes and explains evaluator operations; the evaluator never shells out to the CLI.

At package load, each source string is parsed with source locations, compiled to a typed internal AST, checked against variables, paths, selectors, policies, states, and argument types, and cached. The YAML AST used by the v0.2 prototype remains a useful internal form but is no longer the authoring interface. Parser implementation is reversible; language behavior and manifest versioning are the contract.

### 4.9 Selectors, policies, and computed states

A Selector is a named parameterized relational query. It may source a primitive collection, traverse one primitive relation, or invoke another selector. Selector references are acyclic and type-correct.

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

A Policy is a deterministic prioritized decision table with typed parameters, a typed result, a default result, and expression rules. The first matching rule wins; equal priorities are invalid. Rubric prose remains Markdown while applicability and outcomes remain machine-readable.

A Computed State definition declares one dimension, allowed values, precedence, and expression rules. Exactly-one dimensions choose the highest-priority match or default. Zero-or-more dimensions include every match. Dependencies derived from `state(...)` calls must be acyclic.

### 4.10 Obligation-driven phase rules

An Obligation selects exact subjects and declares satisfaction, prioritized status, resolver bindings, and waiver policy. Subjects are exact Lifecycle Data Revisions or the exact current Phase or selected Process context; the latter two allow required initial outcomes without fabricating Lifecycle Data. One evaluation for one subject and process reference is an Obligation Instance.

```yaml
id: review-context-required
for_each: 'review-required-revisions@1()'
subject_as: subject
satisfied_when: >-
  exists("valid-review-contexts-for@1", {subject: subject})
resolve_with:
  scenario: create-review-context@1
  inputs:
    subject: subject
```

The evaluator emits one Loose End per unsatisfied instance. Subsequent obligations—review, decomposition, simplification, execution, and baseline composition—are discovered from resulting lifecycle data rather than hidden in an imperative phase script.

Obligation identity is stable and explainable:

```text
<obligation-definition-id>@<version>:<exact-subject-id>:<process-ref>
```

### 4.11 Package validation

The meta-schema defines valid manifests, templates, types, link contracts, expressions, queries, selectors, policies, states, obligations, scenarios, phases, profiles, parameters, and primitive catalogs. A package must be deterministic, internally complete, and free of forbidden recursion.

`req process validate` must reject:

- meta-schema violations and manifest/catalog disagreement;
- unresolved or version-mismatched references;
- template cycles, illegal schema widening, and duplicate inherited links;
- unknown variables, paths, primitive relations, selectors, policies, or states;
- selector and state dependency cycles;
- wrong argument kinds, types, or cardinalities;
- invalid resolver bindings and scenarios that cannot satisfy their obligations;
- policy priority conflicts;
- incompatible or unknown Kernel Capability bindings;
- Package Command Aliases that do not resolve to a declared scenario or generic operation;
- attempts to redefine the envelope or primitive catalog;
- impossible required-link and scenario-output contracts.

Diagnostics should include definition path, expression line and column, offending source, and useful reference suggestions. Package tests should include focused invalid fixtures for each rejection class.

### 4.12 Current implementation evidence

**Validated by vertical slice:** The TypeScript evaluator loads the bootstrap package, validates its meta-schemas, rejects selected bad references and template cycles, resolves the STK template chain, and evaluates a PSP → STK → SYS snapshot through the three public seams. It computes backlinks, review contexts, passing reviews, candidate member completeness, conservative staleness, process drift, gate-signoff applicability, and ordered loose ends.

**Provisional and implemented:** The bootstrap package contains seven types, three templates, source-owned links, two machine policies, four state dimensions, twenty-four selectors, five obligations, eight scenarios, and partial Phase 0 and Phase 2 definitions.

**Specified, not implemented:** Complete package validation, textual expression parsing, package installation and selection, Kernel Capability bindings, Package Command Aliases, the generic CLI, durable repository mutation, atomic writes, hashing, scenario execution, phase and gate evaluation, waiver evaluation, and full explanation records.

**Deferred:** DWP, architecture, interface, verification, implementation, and change breadth in the bootstrap implementation of the bundled example, plus production-performance work in the core evaluator.

## 5. Identity, revisions, integrity, and process provenance

### 5.1 Stable IDs

Stable IDs use a type prefix plus a locally generated random identifier. A 10–12 character Crockford Base32 identifier is recommended.

```text
SYS-7K3M9Q2D8F
CMP-X4N7AB2W6J
DES-8ZT5KQ3P9M
```

The CLI checks for a collision before writing. IDs never encode mutable architecture groups, ownership, sequence, or status.

### 5.2 Revision IDs and open-draft rule

Each stable datum has numbered revisions:

```text
SYS-7K3M9Q2D8F-r00001
SYS-7K3M9Q2D8F-r00002
```

The stable ID means “this conceptual datum.” The revision ID means “this exact version.”

A draft revision may be edited until it appears in a frozen baseline. Once frozen, it is immutable. A later change creates the next revision.

For v1, `req revise` refuses when an unfrozen draft already exists for the stable datum in the current repository. This is both a concurrency safeguard and a lightweight local claim without introducing a claim type.

Separate worktrees may still create the same next revision number. Git must surface that conflict; the CLI never silently merges or renumbers frozen history. Reconciliation follows these rules:

- if neither conflicting draft is frozen, combine the proposals into one surviving draft and abandon the duplicate lineage;
- if one is frozen, preserve it and reissue the other proposal as the next draft revision;
- if both are frozen, preserve one exact revision and reissue the other content as the next revision; baselines referencing the reissued revision must be recreated;
- if one is accepted, it remains authoritative and the other proposal becomes a newer draft revision.

A future concurrency profile may use random draft identifiers and assign sequential revision numbers only when freezing. That is deferred from v1.

### 5.3 Example computed-state dimensions

The kernel does not define maturity, disposition, validity, or overlay names. A package declares its own state dimensions and precedence. The bundled V-model example uses the following dimensions rather than one flat status.

#### Maturity

Exactly one maturity value is displayed, using this precedence:

1. **accepted** — the revision belongs to a current or historical accepted baseline;
2. **candidate** — otherwise, it belongs to a candidate baseline;
3. **review-frozen** — otherwise, it belongs to a frozen review-context baseline;
4. **draft** — otherwise, it is not in a frozen baseline.

An accepted revision can also appear in a newer review or candidate baseline; its displayed maturity remains `accepted`.

#### Disposition

Exactly one disposition applies:

- **active** — normal default;
- **retired** — intentionally no longer applicable;
- **cancelled** — intentionally abandoned before becoming authoritative.

Retirement and cancellation require DEC evidence. Historical maturity is preserved, so a revision may display `accepted · retired`.

#### Validity

Exactly one validity value applies, with this precedence:

1. **invalid** — structural integrity is broken, such as a hash mismatch, malformed frozen revision, or illegal reference;
2. **stale** — a prior claim requires reassessment because a declared input, dependency, resolved link, or evidence target changed;
3. **valid** — no known integrity or staleness condition applies.

`accepted · stale` is valid output: acceptance records historical authorization, while staleness says the evidence should be reassessed before a new use.

#### Relationship and provenance overlays

Zero or more overlays may apply:

- **superseded** — a newer revision of the same stable datum is accepted;
- **newer-draft-exists** — a later editable revision exists;
- **process-drift** — the current process differs from the recorded process provenance.

Process drift is informational only.

#### Work obligations

Work classifications such as `ready`, `blocked`, `deferred`, `awaiting-review`, `awaiting-simplification`, `awaiting-gate`, `failed`, and `waived` belong to exact obligations, not to the artifact’s maturity. A requirement is not globally “waived”; a specific missing-review, missing-decomposition, or other obligation may be waived by an applicable DEC.

#### Concise display precedence

Human-facing summaries order information as:

1. invalidity;
2. terminal disposition;
3. maturity;
4. staleness and relationship overlays;
5. outstanding obligations;
6. informational process drift.

`req show --json` exposes every dimension separately rather than collapsing them into one string.

### 5.4 Exact-baseline capability in the example package

The core `exact-baseline@1` capability makes integrity claims without prescribing candidate, review, or promotion semantics. The bundled V-model binds BSL to that capability. Hashes belong to the exact BSL making the claim. A frozen BSL records:

- exact definition-member revision IDs;
- exact-file-byte SHA-256 hashes;
- resolved link targets at freeze time;
- exact evidence references;
- manifest and schema versions;
- baseline kind and composition;
- process provenance manifest.

Definition members and supporting evidence are separate manifest sections. Reviews and results support claims about a baseline but do not become product-definition members merely because they are referenced.

### 5.5 Process provenance

Each authored revision records the scenario, prompt, process, loaded skill, schema, and policy versions used to create it. A baseline captures the complete resolved process provenance for its members and supporting evidence.

```yaml
created_by:
  scenario: decompose-dwp@4
  prompt_ref: prompts/decompose-dwp.md@6
  process_ref: git:abc123
  loaded_skill_refs:
    - decomposition@7
    - requirement-writing@5
  policy_refs:
    - requirement-review@3
```

A later process change does **not** automatically:

- mark accepted requirements stale;
- revoke accepted baselines;
- invalidate completed reviews;
- require a lifecycle re-run.

The CLI may report **process drift** as informational provenance:

```text
BSL-... was created under process abc123; current process is def456.
```

The user or project policy may explicitly request reassessment under a newer process. That reassessment creates new REV, DEC, or BSL evidence; it does not rewrite history.

A schema migration that makes old data unreadable is a tooling compatibility issue, not evidence that the historical requirement was wrong. The CLI must preserve or migrate the historical interpretation.

# Part II — Bundled V-Model Example Process Package

Sections 6–22 describe the first complete Example Process Package shipped with MDLM. Its manifest version is independent from this overview version. The package may be selected at repository initialization, copied and adapted, or replaced entirely. PSP, STK, SYS, REV, BSL, QST, DEC, the remaining type catalog, Phases 0–6, review rules, V-model verification, and promotion are package vocabulary—not kernel keywords.

The current `.lifecycle/process` package is only a bootstrap subset of this example: it implements seven types and partial Phase 0 and Phase 2 behavior. The tables below describe the complete intended example package.

## 6. Lifecycle datum types

### 6.1 Product and requirements

| Prefix | Type | Purpose |
|---|---|---|
| `PSP` | Product Specification | Concise narrative of the problem, users, goals, non-goals, workflows, success measures, scope, and constraints. Links to detailed lifecycle data rather than duplicating it. |
| `STK` | Stakeholder Requirement | What the product commits to for a stakeholder. |
| `SYS` | System Requirement | Solution-independent system behavior or constraint derived from STKs. |
| `CMP` | Component Requirement | Behavior or constraint allocated to a system architecture element or cross-element slice. |
| `DES` | Design Requirement | Lowest lifecycle requirement level from which product code is generated. |

### 6.2 Architecture and interfaces

| Prefix | Type | Purpose |
|---|---|---|
| `ASP` | Architecture Specification | Defines architecture elements, responsibilities, allocation structure, interactions, constraints, and nominated architectural risks. May be system- or component-level. |
| `ICSP` | Interface Control Specification | Defines the normative externally observable contract across a controlled boundary: operations, schemas, units, timing, errors, security, ordering, compatibility, and versioning. |

Architecture elements have stable IDs embedded in an ASP revision:

```yaml
elements:
  - id: AEL-X8M3Q7P2
    alias: WEB
    title: Web application
```

Aliases are human-facing and may change. Stable element IDs are used by allocations, DWPs, and baselines.

### 6.3 Verification planning and execution

| Prefix | Type | Purpose |
|---|---|---|
| `VSP` | Verification Strategy Specification | Defines the verification strategy for a level, permitted methods, independence rules, evidence and assessment policy, plus named environment-capability profiles required to make the requirements verifiable. |
| `ENV` | Verification Environment | A realized, reproducible execution environment implementing one or more exact VSP environment profiles and qualified by a lightweight qualification activity. |
| `VER` | Verification Activity | Source-independent specification of what must be demonstrated, inspected, tested, analyzed, or qualified, including acceptance criteria and evidence requirements. |
| `VAI` | Verification Activity Implementation | Executable or procedural implementation of a VER. Formal and pilot VAIs are authored without product-source access. |
| `RUN` | Verification Run | Immutable execution manifest for one coordinated execution event against exact execution targets, environments, VERs, and VAI revisions. |
| `RES` | Verification Result | Outcome and evidence for one VER/VAI execution within a RUN. |

### 6.4 Planning, review, and baselines

| Prefix | Type | Purpose |
|---|---|---|
| `DWP` | Decomposition Work Package | Defines and later accounts for one bounded many-to-many decomposition from parent requirement revisions into child requirement revisions. |
| `REV` | Review | Records review of one primary artifact revision in a specified context, including findings and outcome. |
| `BSL` | Baseline | Immutable snapshot of exact revisions, hashes, resolved links, evidence, process provenance, and composed group baselines. |

### 6.5 Decisions, questions, change, and implementation

| Prefix | Type | Purpose |
|---|---|---|
| `MAP` | Wayfinding Map | Index of decision areas, questions, prototypes, and deeper artifacts. It links; it does not restate. |
| `QST` | Question | A blocked or deferred decision awaiting empirical or preferential resolution. |
| `DEC` | Decision Record | Records consequential decisions, assumptions, waivers, scope outcomes, prototype findings, deferrals, and gate sign-offs with rationale. |
| `ART` | Code Pointer or Prototype Artifact | Points to product code, generated assets, or prototype code at an exact repository reference, or carries a disposable inline pilot-control pair. `kind` is `implementation` or `prototype`. |
| `PRB` | Problem Report | Captures a defect, failure, or unexpected condition and its evidence. |
| `CHG` | Change Request | Defines an approved change and traceability-based impact analysis. May originate from PRB, MAP, QST, or DEC. |

## 7. Common fields and authored metadata

All authored revisions use the kernel-owned envelope and a process-owned payload:

```yaml
id: SYS-7K3M9Q2D8F
revision: 3
revision_id: SYS-7K3M9Q2D8F-r00003
type: SYS
payload:
  title: ...
  rationale: ...
  statement: ...
  verification_intent: ...
links: []
created_by:
  scenario: decompose-dwp@4
  prompt_ref: prompts/decompose-dwp.md@6
  process_ref: git:abc123
  loaded_skill_refs:
    - decomposition@7
    - requirement-writing@5
```

The scenario registry identifies the prompt, not the skills. The prompt instructs the agent which skills to load; the execution wrapper records what was actually loaded.

`payload.rationale` is required for requirements and for PSP, ASP, ICSP, VSP, ENV, VER, DEC, DWP, and CHG.

Completed REV records the exact rubric, prompt, process assets, and loaded skills used. RUN and RES record runner, executable target, environment, and assessor versions as applicable.

## 8. Link model

Links are stored only on their source revision. Each lifecycle type owns the contracts for links it may emit; there is no separate normative link registry. The CLI computes backlinks and validates each link against its resolved source type.

Working semantic links usually target stable IDs. Historical evidence and snapshots target exact revisions. A frozen baseline records how stable targets resolved at freeze time.

The table below is a conceptual vocabulary across the target lifecycle, not a second source of link-contract truth. Generated reference documentation should assemble the actual contracts from their source types.

### 8.1 Core relationship vocabulary

| Relationship | Meaning |
|---|---|
| `derived-from` | Requirement or specification was derived from another datum. |
| `decomposes` | DWP or child requirement accounts for a parent slice. |
| `allocated-to` | Requirement is allocated to an ASP architecture element. |
| `governs` | VSP, ASP, or ICSP governs another activity or artifact. |
| `defines-interface-for` | ICSP defines a controlled boundary used by requirements, architecture, or verification. |
| `realizes` | ENV realizes a VSP environment profile; VAI realizes VER. |
| `verifies` | VER verifies one or more requirement stable IDs. |
| `implements` | ART implements one or more DES stable IDs. |
| `executes` | RUN executes VAI revisions. |
| `produces` | RUN produces RES; scenarios produce authored artifacts. |
| `reviews` | REV reviews one exact primary subject revision. |
| `contextualizes` | REV uses a BSL as review context. |
| `resolves` | DEC resolves or defers QST; revision or DEC resolves a finding. |
| `blocks` | QST or unresolved finding blocks another datum or gate. |
| `justifies` | DEC supplies rationale for another datum or exception. |
| `waives` | Waiver DEC suppresses one exact computed obligation within explicit scope. |
| `changes` | CHG changes affected lifecycle data, code, or verification. |
| `reports` | PRB reports a condition that may lead to CHG. |
| `supersedes` | A newer datum replaces a prior concept when stable identity cannot be retained. |
| `promotes` | Accepted BSL is promoted from an exact candidate BSL. |
| `composes` | Level BSL composes exact group BSL revisions. |

The CLI rejects dangling links, invalid type combinations, ambiguous architecture-element references, and mutable “latest” references where exact historical identity is required.

## 9. Baselines, currentness, and evidence reuse

### 9.1 Baseline kinds

- **review-context baseline** — freezes the subject and relevant context for one or more artifact reviews. Membership computes `review-frozen`, not candidacy or acceptance.
- **intent-group-candidate baseline** — freezes one Phase 0 product slice proposed for user approval. Small projects use `DEFAULT`.
- **intent-level-candidate baseline** — composes exact intent group candidates plus shared PSP and VSP revisions.
- **intent-approved baseline** — records user approval of an exact intent level candidate. Included STKs remain subject to Phase 1 engineering assurance.
- **group-candidate baseline** — freezes one architecture group or coherent work slice after artifact, DWP, and simplification reviews.
- **level-candidate baseline** — composes exact group candidates and shared artifacts for a level gate.
- **group-accepted baseline** — downstream-confirmed promotion of an exact group candidate.
- **level-accepted baseline** — downstream-confirmed promotion of an exact level candidate.

A candidate is never mutated into an accepted baseline. Promotion creates a new BSL referencing the exact candidate, supporting downstream evidence, and promotion DEC.

### 9.2 Baseline role, scope, and currentness

Multiple historical baselines may exist for the same level. Currentness is computed by **role and scope**.

- For each group, level, and role, at most one non-superseded BSL is current.
- One accepted BSL remains authoritative while a newer candidate BSL is under evaluation.
- A newer BSL becomes current for its role and scope only through an explicit `supersedes` relationship.
- Review-context, candidate, and accepted baselines do not displace one another merely because they coexist.

Every level has one or more groups. Small projects use a single generated group named `DEFAULT`; they do not use a separate baseline workflow.

```text
BSL-SYS-DEFAULT-candidate
          ↓ composes
BSL-SYS-level-candidate
```

Larger projects use groups derived from ASP architecture elements and cross-cutting slices.

A level baseline composes exact group-baseline revisions plus shared artifacts. It demonstrates:

- complete parent coverage across groups;
- no duplicated or conflicting responsibility;
- consistent ICSPs;
- compatible ASP and VSP revisions;
- no missing cross-cutting behavior;
- an exact flattened revision/hash manifest.

A localized group change makes that group baseline and any composing level baseline stale. Unaffected group reviews remain reusable unless changed traceability or interfaces cross their boundary.

### 9.3 Baseline diff and evidence reuse

Before promotion or reuse, the CLI compares exact baselines and classifies:

- content changes;
- outgoing-link changes;
- resolved target-revision changes;
- allocation changes;
- ASP or ICSP changes;
- VSP profile or ENV changes;
- newly relevant QSTs or findings;
- verification implementation or execution-target changes.

Process provenance differences are reported separately as **process drift** and do not themselves stale lifecycle evidence.

The initial implementation must be conservative: it may invalidate more evidence than necessary, but it must never silently preserve evidence that is materially affected. Every stale classification must be explainable.

## 10. Decomposition Work Packages

A DWP is the durable unit organizing a many-to-many decomposition. It is not a generic task or claim.

### 10.1 Planning revision

The planning revision identifies:

- exact parent requirement revisions;
- applicable ASP revision and architecture element or cross-element slice;
- target child type;
- intended behavioral slice;
- expected coverage;
- explicit exclusions;
- relevant ICSP and VSP revisions;
- known dependencies and blocking QSTs;
- required review policy.

The planning revision receives an individual REV before decomposition begins.

### 10.2 Completion revision

The completion revision records:

- child revisions produced;
- parent-to-child coverage;
- branches terminated or waived by DEC;
- deferred questions;
- cross-group dependencies or overlaps;
- output-review completion;
- simplification findings and dispositions;
- resulting group candidate baseline.

The completion revision receives an individual REV.

### 10.3 Computed DWP states

The CLI computes:

- `planned`;
- `in-progress`;
- `blocked`;
- `awaiting-output-reviews`;
- `awaiting-simplification`;
- `awaiting-completion-review`;
- `complete`;
- `terminated`;
- `stale`.

A DWP is complete only when every parent slice is accounted for, all outputs are reviewed, required collateral findings are triaged, the dedicated simplification obligation is satisfied, the completion review passes, and no blocking QST remains.

## 11. Review model

### 11.1 One review per substantive authored revision

Every substantive authored revision receives its own REV. Several siblings may be reviewed in one session, but the session creates a separate REV for each primary subject.

Each REV records:

- one exact primary subject revision;
- one frozen review-context baseline;
- applicable rubric and policy versions;
- reviewer session and process provenance;
- structured findings;
- pass, fail, or cancelled outcome.

The reviewer evaluates the subject in context: parents, siblings, applicable architecture and interfaces, verification strategy, decisions, and cross-group obligations.

### 11.2 Findings on other artifacts

A REV may record collateral findings against artifacts other than its primary subject.

```yaml
findings:
  - id: F-001
    target: CMP-...-r00003
    relationship: primary
    severity: blocking
    summary: ...
  - id: F-002
    target: ICSP-...-r00002
    relationship: collateral
    severity: needs-triage
    summary: ...
```

Primary blocking findings prevent the REV from passing. Collateral findings create triage loose ends but do not automatically fail the primary subject.

Triage may produce QST, PRB, DEC, DWP revision, artifact revision work, CHG, or dismissal DEC. Completed REVs are immutable.

### 11.3 Review requirements by type

**Always individually reviewed:** PSP, STK, SYS, CMP, DES, ASP, ICSP, VSP, ENV, formal and pilot VER, formal and pilot VAI, DWP planning revisions, DWP completion revisions, CHG, and substantive ART traceability records.

**Reviewed through a containing subject:** qualification VER, qualification VAI, and qualification RES are assessed as part of the ENV review rather than requiring standalone REV records.

**Conditionally reviewed:** DEC when it affects scope, architecture, interfaces, verification policy, waiver, deferral, or gate; MAP before PSP compilation or when originating CHG; PRB during triage; manually authored RES; candidate BSLs according to phase policy.

**Not separately reviewed by default:** REV, review-context BSL, automatically generated accepted BSL, RUN, deterministic automatic RES, hash manifests, raw evidence, and generated reports.

REV does not require review, preventing infinite recursion.

### 11.4 Simplification reviews

The dedicated simplification pass produces a REV whose primary subject is the exact candidate BSL or review-context BSL containing the set under challenge. It may also produce revised artifacts, QSTs, DECs, DWP revisions, or removal recommendations.

A simplification review asks adversarially:

- Is every artifact necessary?
- Can requirements or groups collapse?
- Did architecture create obligations merely to support its own complexity?
- Can an interface, element, behavior, or verification environment be removed?
- Was scope introduced without accepted provenance?

If changes are made, affected artifact reviews and the simplification review become stale and are rerun against a new baseline.

### 11.5 Cross-group review

After group candidates exist, a cross-group review evaluates:

- whole-parent coverage;
- duplicated or conflicting requirements;
- interface consistency;
- cross-cutting security, performance, logging, and operational behavior;
- compatibility of shared specifications;
- unresolved collateral findings.

The level candidate baseline receives a REV before its gate.

## 12. Questions, decisions, waivers, and scope reduction

### 12.1 Questions

A QST is:

- **preferential** — requires stakeholder intent, scope, or taste;
- **empirical** — can be answered by building, measuring, researching, or observing.

QST states are explicit:

- `open`;
- `answered`;
- `deferred`;
- `cancelled`.

A deferred QST requires a DEC with rationale, reactivation condition or gate, blocking impact, and owner when applicable.

### 12.2 Decisions

DECs are reserved for consequential records:

- reasonable alternatives rejected;
- material scope retained, removed, or added;
- non-obvious assumptions;
- prototype or analysis findings;
- architecture or interface choices;
- waivers and deferrals;
- gate sign-offs;
- explicit process reassessment decisions.

Routine review judgments remain in REV. Routine autonomous empirical
clarifications may close through a new QST Revision with cited evidence and are
not forced into DEC. An empirical QST that declares `defer` or `cancel` as its
resolution disposition instead requires attended stakeholder authority and exact
reviewable DEC evidence. Deferral, cancellation, preferential scope judgment, and
other consequential outcomes remain exact DEC evidence.

An `authority-delegation` DEC is standing authority only when a package Selector
matches its exact `justifies` target Revision, authority, delegate, and versioned
Scenario; the DEC is valid and has its policy-required passing Review; and it
declares expiry and reactivation conditions. Delegation never silently transfers
to a replacement target or Scenario version. Scope, waiver, standing delegation, retirement, and cancellation can be published through the explicitly initiated
`record-consequential-decision@1` Scenario after stakeholder authority; waiver
publication additionally requires an exact `waives` link matching its structured
Obligation Instance.

### 12.3 Waivers

`waived` is computed only when an exact loose-end obligation is covered by a structured, applicable DEC:

```yaml
kind: waiver
waives:
  obligation: missing-decomposition
  subject: SYS-...-r00003
  scope: this-revision
  rationale: ...
  expires_when:
    - subject-revised
    - parent-revised
```

A generic `justifies` link does not suppress work. The CLI validates the waiver type, scope, approval policy, and expiry conditions.

### 12.4 Scope rule

Every child must be necessary to satisfy:

- a parent requirement revision authorized for downstream use as candidate or accepted;
- an accepted constraint;
- an ICSP obligation;
- or an accepted DEC.

A child without such provenance is unjustified scope.

Scope reduction is both:

- a continuous instruction supplied by relevant scenario content through the scope-challenge skill;
- a dedicated independent scenario run against each product or definition set.

## 13. Architecture, interfaces, and prototypes

Requirements at level N remain solution-independent relative to level-N architecture. The level-N ASP follows those requirements and organizes decomposition to level N+1.

ICSPs are normative lifecycle data. They define controlled black-box boundaries used by component and design verification. Interface changes stale dependent requirements, VERs, VAIs, and results according to traceability.

Architecture groups are organizational allocations, not identity. Requirement IDs remain opaque if allocation changes.

### 13.1 Prototype rule

Every prototype declares:

- the empirical question or nominated claim it addresses;
- the evidence boundary and what the prototype cannot establish;
- either an exact repository reference or, for a disposable verification pilot,
  one inline known-good and one one-fault known-bad runnable control;
- supported behaviors or claims;
- intentionally unsupported behaviors when used for verification discrimination;
- retention or disposal policy;
- whether it may be used as a pilot execution target.

Prototype code is not product code. Reusing it in implementation requires an explicit DEC or CHG and reconciliation against the applicable DES requirements. It may not bypass Phase 5.

### 13.2 Exploratory prototype

Used during wayfinding or to resolve an empirical QST before a controlled verification chain exists.

It produces:

- `ART(kind: prototype)`;
- evidence files referenced from the ART or DEC;
- DEC recording the question, observations, justified conclusions, remaining uncertainty, and disposal decision;
- optional QST revisions.

It does **not** produce RUN or RES. There may be no controlled ENV, VER, VAI, or executable target yet.

### 13.3 Architecture prototype

Used to investigate nominated ASP or ICSP claims, such as interface feasibility, interaction behavior, latency, failure detection, or an external integration assumption.

It produces prototype ART, evidence references, and DEC. The ASP or ICSP identifies the exact claims addressed. The prototype never proves the architecture as a whole.

An architecture prototype may later serve as the execution target for a pilot verification run if its ART revision, build reference, supported behavior, and limitations are exact and controlled.

### 13.4 Verification pilot target

A prototype, harness, component build, or early product build may serve as a pilot target. Before product code exists, the package may create a disposable inline prototype bound to one reviewed VER. It contains one known-good control expected to pass and one one-fault known-bad control expected to fail that same verification. A useful pilot deliberately includes:

- at least one activity expected to succeed against supported behavior; and
- at least one activity expected to expose intentionally unsupported or incorrect behavior.

This tests whether the VER/VAI/ENV design is discriminating rather than merely executable. Pilot results make claims about the verification design, not requirement acceptance. They must be rerun formally against a controlled component or product build before becoming requirement-verification evidence.

## 14. Verification model

### 14.1 Strategy, environment profiles, and execution chain

```text
VSP environment profile → ENV
Requirement → VER → VAI → RUN → RES
ASP / ICSP ───────────────┘
                     execution target
```

A VSP is written before or alongside the requirements for its level and evolves through definition. It contains named environment-capability profiles, for example:

```yaml
environment_profiles:
  - id: browser-e2e
    purpose: Exercise externally observable browser-to-service behavior.
    controllability:
      - create isolated test users
      - set service fixtures
    observability:
      - browser-visible outputs
      - public API responses
      - structured evidence capture
    external_services:
      - deterministic email sandbox
    timing:
      deterministic_clock: required
```

An ENV realizes one or more exact profiles from an exact VSP revision.

### 14.2 VER and VAI kinds

VER and VAI support:

- **qualification** — demonstrates that an ENV supplies its declared capabilities;
- **pilot** — evaluates whether a proposed VER/VAI/ENV design is executable and discriminating before bulk creation;
- **formal** — supplies lifecycle requirement-verification evidence.

Qualification activities do not verify STK, SYS, CMP, or DES requirements. Pilot activities may exercise representative requirements, but their claim scope remains the verification design.

### 14.3 Execution targets

RUN binds an exact execution target rather than requiring a product build specifically:

```yaml
execution_target:
  kind: environment | harness | prototype | component-build | product-build
  ref: ...
```

Permitted combinations are:

| VAI kind | Permitted execution target | Claim scope |
|---|---|---|
| `qualification` | ENV or qualification harness | environment capability |
| `pilot` | harness, prototype, component build, or product build | verification design |
| `formal` | controlled component build or product build | requirement |

A pilot target must identify the exact prototype ART, harness, or build reference and its declared supported and unsupported behavior.

### 14.4 Verification independence

Formal and pilot verification are black-box relative to the controlled boundary and must not depend on internal implementation structure.

Permitted inputs:

- exact requirement revisions;
- relevant ASP and ICSP revisions;
- exact VSP revision and environment profiles;
- the VER;
- executable product, component, prototype, or harness boundary permitted by the VAI kind;
- controlled credentials, services, and test data.

Prohibited inputs for pilot and formal VAI authoring:

- product source code;
- product unit tests;
- private functions, classes, or implementation notes;
- uncontrolled implementation-specific shortcuts.

Qualification VAI is exempt from source blindness because it verifies the ENV rather than the product. It still must be reproducible and limited to the declared environment capabilities.

For v1, independence is enforced through scenario prompts and recorded provenance. Later versions may use isolated worktrees or containers.

### 14.5 Unit tests

Implementation agents write unit tests as implementation-quality tools. Unit tests are not formal lifecycle verification evidence.

Formal verification is black-box at the smallest controlled boundary appropriate to the requirement:

- STK — user or product-level behavior;
- SYS — system/product boundary;
- CMP — component or integration boundary defined by ASP/ICSP;
- DES — smallest externally observable design boundary.

### 14.6 Verification methods and assessment

VER method is one of Inspection, Demonstration, Test, or Analysis. Each VER declares an assessment mode:

- `automatic`;
- `authored`;
- `witnessed`;
- `stakeholder`.

Defaults:

| Method | Default result handling |
|---|---|
| Test | Automatic pass/fail; no individual result REV unless policy says otherwise. |
| Analysis | Independent REV of data, assumptions, method, threshold, and conclusion. |
| Demonstration | Witness or stakeholder REV of observed behavior. |
| Inspection | Assessor REV unless the inspection is fully automated. |
| Qualification | Assessed within the ENV REV. |

### 14.7 Result claim scopes and outcomes

RES records a scoped claim:

- **qualification:** `claim_scope: environment-capability`, outcome `pass | fail`;
- **pilot:** `claim_scope: verification-design`, outcome `suitable | unsuitable | inconclusive`;
- **formal:** `claim_scope: requirement`, outcome `pass | fail | inconclusive`.

A pilot RES cannot be promoted into formal evidence. The same reviewed VER, VAI, and ENV may be reused if still valid, but the activity must be rerun against a controlled formal execution target.

Assessment workflow states include:

- `recorded`;
- `assessment-required`;
- `accepted`;
- `rejected`;
- `inconclusive`.

These assessment states are separate from the method-specific outcome above.

### 14.8 ENV qualification

ENV qualification uses a deliberately lightweight path:

1. draft ENV linked to exact VSP profile(s);
2. create minimal qualification VER and VAI;
3. execute a RUN against the ENV or qualification harness and generate RES;
4. review the ENV in context of the VSP profile and qualification evidence;
5. compute the ENV as qualified when the qualification RES passes and the ENV REV passes.

Qualification VER, VAI, and RES do not require separate REV records by default. A failed qualification result blocks ENV use but does not report a product requirement failure.

### 14.9 Runs and results

RUN is generated automatically and mechanically validated. It records:

- start and completion times;
- exact ENV, VER, VAI, execution-target, runner, and relevant configuration references;
- activities expected and actually invoked;
- evidence locations;
- execution state.

RUN execution state distinguishes:

- `completed`;
- `aborted`;
- `infrastructure-error`.

Infrastructure errors are not requirement failures.

RES records the scoped outcome for one VER/VAI within a RUN. Whether it needs a REV is determined by the VER assessment policy.

## 15. Obligations and the loose-end engine

A Loose End is an unsatisfied Obligation Instance computed from lifecycle data. It is not a generic list of incomplete files, and it is not a mutable global status attached to a datum.

Core classifications include:

- `ready`;
- `claimed` if a future profile enables claims;
- `blocked`;
- `deferred`;
- `awaiting-review`;
- `awaiting-simplification`;
- `awaiting-gate`;
- `stale`;
- `failed`;
- `invalid`;
- `waived`.

Examples:

- DWP planning revision lacks a passing REV;
- parent slice has no child coverage and no waiver;
- candidate artifact lacks an individual REV;
- group candidate lacks simplification REV;
- VAI pilot has no completed RUN;
- formal RES requires analysis assessment;
- baseline hash no longer matches a frozen file;
- accepted requirement has newer draft work;
- collateral finding requires triage.

### 15.1 Explanation contract

Every loose end should report:

- exact obligation-instance identity and exact subject;
- current status and the failing satisfaction condition;
- selector, policy, state, and process evidence supporting that conclusion;
- exact blocking obligation instances or unresolved bindings;
- whether a resolver is **dispatchable now**;
- the eventual Resolver Scenario;
- the currently actionable resolver, if different;
- prompt reference and bound inputs;
- expected output types and required links;
- waiver policy and current waiver applicability.

The eventual resolver is descriptive, not permission to execute. A blocked gate may eventually be resolved by `record-gate-signoff`, while the work dispatchable now is review of the already-recorded DEC. Orchestration must use `dispatchable`, not merely the presence of a resolver name.

```yaml
obligation_instance: candidate-gate-signoff@1:BSL-...-r00001:git:abc123
subject: BSL-...-r00001
status: blocked
dispatchable: false
blocked_by:
  - passing-review-required@1:DEC-...-r00001:git:abc123
eventual_resolver: record-gate-signoff@2
actionable_resolver: review-datum-in-context@2
```

Historical obligation records explain what was true under an exact subject revision and process reference. When a resolving scenario creates a new revision, current selectors are reevaluated; history is not rewritten and does not require a new lifecycle datum type.

### 15.2 Presentation order

The first vertical slice showed that definition-file order can put blocked reviews ahead of the ready context creation that unblocks them. The provisional human and agent presentation order is:

1. `ready`;
2. `awaiting-review`;
3. `failed`;
4. `stale`;
5. `blocked`.

Stable subject and obligation IDs break ties. This is presentation behavior, not lifecycle truth, and may change after usability evidence.

### 15.3 Phase loop

The phase loop is:

1. evaluate phase entry, candidate selection, obligation instances, and gate state;
2. query loose ends for the phase;
3. dispatch only the scenario for each dispatchable item or coherent batch;
4. create revisions, evidence, findings, QSTs, or DECs;
5. reevaluate from primitive lifecycle data;
6. repeat until only deferred, waived, or gate-held items remain;
7. enter the gate loop.

## 16. Gates and promotion

At a gate:

1. prepare the exact candidate baseline, phase evaluation, and reports;
2. batch and deduplicate preferential QSTs;
3. present the questions and material findings to the user;
4. implement answers through revisions and DECs;
5. rerun affected reviews, simplification, and baseline checks;
6. repeat until blocking items are gone;
7. after explicit stakeholder authority is supplied, have the operating agent record gate sign-off as a DEC against the exact candidate;
8. obtain the review evidence required by policy for that consequential DEC;
9. treat the sign-off as applicable only when the DEC is valid and its required review passes.

The execution-time authority supply permits publication but does not satisfy the gate. Chat text, adapter prose, and completion summaries are not lifecycle evidence; the exact DEC output is. The user supplies the judgment, while the operating agent invokes the public sign-off Scenario and publishes atomically.

A recorded gate decision and an applicable approving gate decision are deliberately different selector results. A reviewed rejection remains exact history but does not satisfy approval or permit progression. While a gate DEC exists but awaits review, the candidate is blocked: review obligations drive the next work and the gate interview is not dispatched again. This prevents duplicate sign-off decisions while preserving review assurance.

Phase progression is package-declared and evidence-derived. A Phase names its
readiness condition, next Phase, authority Policy, public authorization Scenario,
and exact evidence Selector. When package Policy permits, the reviewed approving
gate DEC is also the progression authorization; no redundant second approval is
created. A package may instead require a separate exact reviewed progression DEC.
The active Phase is derived from those immutable records and exact package
provenance, not changed through a mutable phase file or conversational statement.

Any candidate change creates a new exact candidate and requires new gate evidence; neither candidate nor sign-off is mutated in place. Candidate approval allows downstream work. Acceptance is delayed until downstream confirmation criteria are satisfied.

A process-version difference may be shown to the user but is not a gate blocker unless project policy explicitly requires reassessment.

**Validated by vertical slice:** The evaluator reproduced the duplicate-dispatch risk through its public lifecycle-evaluation interface. Adding a relational selector and a higher-priority blocked rule corrected the behavior without adding an evaluator special case.

## 17. Scenario contract

Every scenario definition is versioned and declares:

| Field | Meaning |
|---|---|
| `id` | Stable scenario name and version. |
| `phases` | Phases in which it may run. |
| `inputs` | Named types, kinds, cardinalities, link requirements, and expression conditions. |
| `primary_outputs` | Expected artifacts or generated records with required links. |
| `optional_outputs` | QST, DEC, PRB, revisions, findings, or evidence it may emit. |
| `prompt_ref` | Versioned prompt that instructs the agent, including which skills to read. |
| `review_policy` | Which authored outputs require REV. |
| `participation` | A versioned Policy and typed input bindings producing the Authority Requirement and Attention Schedule. |
| `authority_evidence` | The named exact REV or DEC output that records delegated or attended authority. |
| `completion` | An MDLM expression adding process-specific completion to generic contract checks. |
| `loose_ends` | Obligation classes it resolves. |
| `prohibited_inputs` | Inputs the agent may not access. |

The execution wrapper binds `input.<name>`, `output.<name>`, and `execution`. Generic validation checks cardinality, schemas, source-owned link contracts, required input/output links, and undeclared outputs. A condition on a `one-or-more` input applies to each bound item. The completion expression should not duplicate generic contract checks.

A participation Policy returns whether the Scenario is autonomous, delegated, or attended; its package-defined authority and delegation allowance; and whether attention is absent, immediate, or scheduled at a checkpoint with an optional Consolidation Group. This scheduling is independent of the Scenario's atomic transaction-batching contract.

Skills are not duplicated in the scenario registry. The prompt is executable process content and directs the agent to the relevant versioned skills. Artifacts record the exact prompt and skill versions actually used. The CLI validates that scenario outputs conform to the registered contract.

## 18. Scenario catalog

The tables below summarize the target process. The normative process package stores the scenario contract and prompt reference; the prompt contains the operational instructions and skill-loading directions.

### 18.1 Wayfinding and product definition

| Scenario | Phases | Primary outputs | Optional outputs |
|---|---|---|---|
| Chart wayfinding map | 0 | MAP | QST, prototype candidates |
| Frontier interview | 0 | MAP/QST/DEC revisions | PSP/STK candidates |
| Research empirical question | 0/change | DEC, evidence reference | QST revision, PRB |
| Build exploratory prototype | 0 | ART, DEC, evidence references | QST revision |
| Compile PSP | 0 | PSP | STK candidates, QST |
| Draft STK set | 0 | STK revisions | QST, DEC |

### 18.2 Dedicated simplification

| Scenario | Phases | Primary outputs | Optional outputs |
|---|---|---|---|
| Simplify product definition | 0–1/change | REV of PSP/STK candidate context | PSP/STK/MAP revisions, DEC, QST |
| Simplify requirement set | 2–4/change | REV of group or level candidate BSL | SYS/CMP/DES/DWP revisions, DEC, QST |
| Simplify architecture and interfaces | 2–4/change | REV of ASP/ICSP candidate context | ASP/ICSP/DWP revisions, DEC, QST |

### 18.3 Decomposition

| Scenario | Phases | Primary outputs | Optional outputs |
|---|---|---|---|
| Define DWP plan | 2–4/change | DWP planning revision | QST, DEC |
| Review DWP plan | 2–4/change | REV | findings |
| Execute DWP | 2–4/change | SYS, CMP, or DES revisions | QST, DEC, VSP revision |
| Review decomposition outputs | 2–4/change | one REV per output | findings |
| Complete DWP | 2–4/change | DWP completion revision | QST, DEC |
| Review DWP completion | 2–4/change | REV | findings, DWP revision |
| Detect overlapping DWPs | 2–4/change | REV finding or DEC | QST, DWP revisions |

### 18.4 Architecture, interfaces, and prototypes

| Scenario | Phases | Primary outputs | Optional outputs |
|---|---|---|---|
| Define ASP | 2–3/change | ASP | QST, DEC, prototype candidate |
| Define ICSP | 2–4/change | ICSP | QST, DEC |
| Build architecture prototype | 2–4/change | ART, DEC, evidence references | ASP/ICSP revision, pilot-target declaration |
| Prepare pilot target | 1–5/change | controlled target reference | ART/ASP/ICSP/VSP revision, DEC |
| Review ASP | 2–3/change | REV | findings |
| Review ICSP | 2–4/change | REV | findings |
| Evolve architecture elements | 2–4/change | ASP revision, DEC | DWP/ICSP revisions |

### 18.5 Verification planning and execution

| Scenario | Phases | Primary outputs | Optional outputs |
|---|---|---|---|
| Define VSP | 0–4/change | VSP | QST, DEC |
| Refine VSP environment profile | 1–4/change | VSP revision | QST, DEC |
| Realize ENV | 1–5/change | ENV, qualification VER/VAI | QST, DEC |
| Qualify ENV | 1–5/change | RUN, RES, ENV REV | QST, DEC |
| Write VER | 1–4/change | VER | QST, VSP revision |
| Implement VAI | 1–5/change | VAI | QST, VER/ENV revision |
| Execute verification run | 1–6/change | RUN, RES, evidence | PRB |
| Assess analysis result | 1–6/change | REV | finding, PRB, QST |
| Witness demonstration | 1–6/change | REV | finding, PRB |
| Assess inspection result | 1–6/change | REV | finding, PRB |
| Determine evidence staleness | 1–6/change | computed loose ends | CHG impact |

### 18.6 Artifact review and triage

| Scenario | Phases | Primary outputs | Optional outputs |
|---|---|---|---|
| Review datum in context | 0–6/change | REV | findings |
| Batch sibling reviews | 0–4/change | one REV per subject | findings |
| Triage collateral finding | 0–6/change | QST, PRB, DEC, DWP revision, or revision request | CHG |
| Re-review revised datum | 0–6/change | REV | findings |
| Cross-group review | 1–4/change | REV of level BSL | findings |
| Reassess under newer process | 0–6/change | REV or DEC | revised artifacts, QST |

### 18.7 Baselines and gates

| Scenario | Phases | Primary outputs | Optional outputs |
|---|---|---|---|
| Create review context | 0–6/change | BSL | none |
| Create intent group candidate | 0 | BSL | validation report |
| Compose intent level candidate | 0 | BSL | validation report |
| Create group candidate baseline | 1–4/change | BSL | validation report |
| Compose level candidate baseline | 1–4/change | BSL | validation report |
| Compare baselines | 1–6/change | generated diff, loose ends | none |
| Compare process provenance | 0–6/change | informational report | reassessment recommendation |
| Prepare gate | 0–4/change | gate report | QST batch |
| Run gate interview | 0–4/change | DEC, QST/other revisions | DWP, CHG |
| Promote baseline | 0–5/change | intent-approved or accepted BSL, DEC | none |

### 18.8 Implementation and change

| Scenario | Phases | Primary outputs | Optional outputs |
|---|---|---|---|
| Implement DES requirements | 5/change | product code, ART, unit tests | DEC, QST |
| Review implementation traceability | 5/change | REV | findings, PRB |
| Create PRB | 0–6/change | PRB | evidence |
| Triage PRB | change | REV, DEC | CHG, QST |
| Create CHG | change | CHG | DWP, DEC |
| Review CHG | change | REV | findings |
| Implement CHG | change | revised lifecycle data, code, verification | PRB, QST |
| Close CHG | change | CHG revision, DEC | none |

## 19. Skills

Skills are versioned process assets referenced from scenario prompts. Initial versions may be generated and iteratively refined. The process makes no assumption about whether a skill was authored by a human or an LLM.

A scenario prompt tells the agent which skills to read, in what order, and how they apply to the current scenario. This avoids maintaining a second skill map in scenario metadata. Execution provenance records the prompt and the exact skills actually loaded.

### 19.1 Core lifecycle skills

- **lifecycle-data** — identity, revisions, schemas, link semantics, and layout.
- **traceability** — outbound links, computed backlinks, exact evidence, coverage, and impact walks.
- **baseline-model** — baseline kinds, membership, hashes, provenance, and immutability.
- **baseline-composition** — universal group and level composition.
- **baseline-diffing** — content, link, allocation, interface, environment, and evidence change classification.
- **promotion** — candidate-to-accepted promotion and evidence reuse.
- **loose-end-classification** — actionable states, dependencies, waivers, and scenario routing.
- **process-reassessment** — compare process provenance without automatic invalidation; prepare optional reassessment.

### 19.2 Requirements and decomposition skills

- **requirement-writing** — singular, unambiguous, necessary, rationale-backed, verifiable requirements.
- **requirement-validation** — type- and level-specific semantic quality checks.
- **decomposition** — many-to-many coverage, justified derived requirements, and stopping rules.
- **dwp-planning** — bounded slices, inputs, exclusions, allocation, and expected outputs.
- **dwp-completion** — coverage accounting, termination, and completion evidence.
- **coverage-analysis** — parent coverage, overlap, gaps, and traceability integrity.
- **scope-challenge** — adversarial simplification and sufficient justification.

### 19.3 Architecture and interface skills

- **architecture-specification** — ASP responsibilities, interactions, constraints, and claims.
- **architecture-elements** — stable element IDs, aliases, allocation, and grouping.
- **architecture-evolution** — splits, merges, relocations, and impact.
- **architecture-evidence** — prototype claims and limits.
- **architecture-review** — architecture completeness, necessity, and evidence.
- **interface-control-specification** — ICSP contracts, errors, timing, compatibility, and versioning.
- **boundary-definition** — controlled black-box boundaries.
- **interface-consistency** — matching obligations across groups and levels.
- **interface-review** — completeness, consistency, observability, and verifiability.

### 19.4 Review skills

- **review-model** — REV schema, context, outcomes, immutability, and provenance.
- **contextual-artifact-review** — review one subject while checking parents, siblings, interfaces, and group completeness.
- **review-findings** — primary/collateral findings, severity, evidence, and blocking.
- **review-triage** — route findings into QST, PRB, DEC, DWP, CHG, or revision work.
- **review-policy** — required reviews and type-specific rubrics.
- **review-reuse** — determine whether prior evidence survives change.
- **cross-group-review** — whole-level coverage, duplication, and shared-spec consistency.

### 19.5 Verification skills

- **verification-strategy-specification** — methods, independence, environment profiles, evidence, and assessment policy.
- **verification-selection** — Inspection/Demonstration/Test/Analysis selection and reuse-before-create.
- **verification-writing** — source-independent VER structure and acceptance criteria.
- **verification-environments** — realization, reproducibility, reuse, and profile conformance.
- **qualification-verification** — lightweight ENV qualification VER/VAI/RUN/RES path.
- **verification-activity-implementation** — VAI fidelity to VER and source-blind implementation.
- **verification-independence** — permitted and prohibited inputs and provenance.
- **verification-run-model** — RUN, RES, exact binding, and infrastructure failures.
- **verification-staleness** — changes that invalidate planning, implementation, or results.
- **analysis-assessment** — data, assumptions, methods, thresholds, and conclusions.
- **demonstration-assessment** — witnessed and stakeholder acceptance.
- **inspection-assessment** — manual or automated inspection evidence.
- **evidence-management** — capture, integrity, and retention.
- **reproducibility** — deterministic invocation and environment reconstruction.

### 19.6 Wayfinding, clarification, implementation, and change skills

- **wayfinding-map** — MAP structure and frontier management.
- **product-specification** — concise PSP compilation without duplicating STKs.
- **prototyping** — empirical QSTs, spikes, walking skeletons, and findings.
- **clarification-protocol** — decide-and-record versus QST; preferential versus empirical routing.
- **gate-protocol** — batched questions and exact baseline sign-off.
- **implementation-from-design** — generate product code and unit tests from DES.
- **implementation-review** — ART traceability and unjustified-diff detection.
- **problem-reporting** — capture failures and unexpected conditions with evidence.
- **problem-triage** — classify PRBs and determine QST, DEC, CHG, or dismissal disposition.
- **impact-analysis** — bound an affected set through traceability.
- **change-planning** — define the ordered lifecycle work for an approved change.
- **change-review** — assess necessity, scope, and impact analysis of CHG.
- **change-implementation** — execute approved lifecycle, code, and verification revisions.
- **change-closure** — confirm impacted evidence and close CHG/PRB.
- **research-discipline** — source quality, uncertainty, and durable findings.

## 20. Target phase behavior

The numbered lists below explain intended lifecycle outcomes and a typical discovery order; they are not imperative programs. Normative phase definitions identify entry expressions, candidate selection, applicable scenarios and obligations, and gate expressions. The Loose End engine determines actual ready work from repository state. A scenario may emit only the primary and optional artifact types declared in its contract.

### Phase 0 — Wayfinding

**Purpose:** determine whether the proposed product is the product the user actually wants.

1. Run **Chart wayfinding map**.
2. Run **Frontier interview**, **Research empirical question**, and **Build exploratory prototype** as needed.
3. Record consequential findings as DEC and unresolved decisions as QST.
4. Run **Define VSP** to establish the initial product-level strategy and environment profiles.
5. Run **Compile PSP** and **Draft STK set**.
6. Create review contexts and run **Review datum in context** for MAP when required, PSP, VSP, and every STK.
7. Run **Simplify product definition**; revise and re-review affected artifacts.
8. Triage collateral findings.
9. Run **Create intent group candidate** using `DEFAULT` unless explicit product slices exist, then run **Compose intent level candidate**.
10. Review the level candidate and run **Prepare gate** and **Run gate interview**.
11. Create an intent-approved BSL referencing the exact candidate and gate DEC.

**Possible authored outputs:** MAP, PSP, STK, VSP, QST, DEC, ART prototype, REV, BSL.  
**Generated outputs:** evidence files and reports.

### Phase 1 — Product assurance

**Purpose:** determine whether the Phase 0 product definition is fit to drive system definition.

1. Re-review PSP and every STK under independent product-assurance rubrics.
2. Refine VSP environment profiles through **Refine VSP environment profile**.
3. Write and individually review STK VERs, beginning with a pilot.
4. Realize and qualify required demonstration ENVs.
5. Build or select a controlled prototype, harness, component build, or product build through **Prepare pilot target**; declare supported and intentionally unsupported behavior.
6. Implement and individually review pilot demonstration VAIs.
7. Execute pilot RUNs against the controlled target and assess whether the verification design is suitable, unsuitable, or inconclusive.
8. Treat pilot RES as verification-design evidence only; no pilot result accepts an STK.
9. Run **Simplify product definition** again against the assurance candidate set.
10. Resolve findings and QSTs.
11. Create the `DEFAULT` or explicitly defined product-scope STK group candidate(s), compose the STK level candidate, and perform cross-group review.
12. Run the product-assurance gate.
13. Approve the STK candidate for SYS definition. It becomes accepted only after the required Phase 2 downstream confirmation.

**Possible authored outputs:** revised PSP/STK/VSP, ENV, VER, VAI, REV, DEC, QST, BSL.  
**Generated outputs:** RUN, RES, evidence, reports.

### Phase 2 — System definition

**Purpose:** define solution-independent system requirements and the system architecture that organizes component decomposition.

1. Define or refine the system VSP and environment profiles; review the VSP.
2. Create and review SYS DWP planning revisions.
3. Execute DWPs to create SYS revisions.
4. Review every SYS revision in sibling context.
5. Create and review the system ASP.
6. Create and review system ICSPs.
7. Run **Simplify requirement set** and **Simplify architecture and interfaces**; revise and re-review affected artifacts.
8. Refine VSP profiles based on requirement observability and architecture boundaries.
9. Realize and qualify required ENVs.
10. Write and individually review SYS VERs, beginning with a pilot.
11. Use an architecture prototype, harness, component build, or early product build as an exact pilot target. Include supported and intentionally unsupported behavior where practical.
12. Implement and review pilot VAIs; execute pilot RUNs and assess verification-design suitability. Pilot RES does not accept SYS requirements.
13. Complete and review every SYS DWP.
14. Create group candidate baselines, using `DEFAULT` if there is only one group.
15. Perform group completeness and cross-group reviews.
16. Compose and review the SYS level candidate.
17. Run the SYS candidate gate.
18. Promote supported STK candidates to accepted after successful SYS coverage and required product-promotion review.

**Possible authored outputs:** VSP, DWP, SYS, ASP, ICSP, ENV, VER, VAI pilot, REV, QST, DEC, BSL, prototype ART.  
**Generated outputs:** RUN, RES, evidence, reports.

### Phase 3 — Component definition

**Purpose:** allocate system behavior to architecture elements and define component boundaries.

1. Define or refine the CMP VSP and profiles; review it.
2. Create and review CMP DWPs for architecture elements and cross-element slices.
3. Execute DWPs to create CMP revisions.
4. Review every CMP revision in sibling and interface context.
5. Create and review component ASPs.
6. Create and review ICSPs.
7. Run the dedicated requirement and architecture/interface simplification scenarios.
8. Refine VSP profiles; realize and qualify required ENVs.
9. Write and review CMP VERs, beginning with a pilot.
10. Select an exact architecture prototype, harness, component build, or early product build as the pilot target and declare supported and intentionally unsupported behavior.
11. Implement and review pilot VAIs; execute pilot RUNs and assess verification-design suitability. Pilot RES does not accept CMP requirements.
12. Complete and review every CMP DWP.
13. Create group candidates, perform cross-group and interface reviews, and compose the CMP level candidate.
14. Run the CMP candidate gate.
15. Promote supported SYS candidates to accepted.

**Possible authored outputs:** VSP, DWP, CMP, ASP, ICSP, ENV, VER, VAI pilot, REV, QST, DEC, BSL, prototype ART.  
**Generated outputs:** RUN, RES, evidence, reports.

### Phase 4 — Design definition

**Purpose:** create implementable design requirements while preserving independent black-box verification boundaries.

1. Define or refine the DES VSP and profiles; review it.
2. Create and review DES DWPs from component architecture elements and interfaces.
3. Execute DWPs to create DES revisions.
4. Review every DES revision.
5. Refine and review ICSPs where externally observable design boundaries require it.
6. Run the dedicated requirement and architecture/interface simplification scenarios.
7. Refine VSP profiles; realize and qualify required ENVs.
8. Write and review source-blind DES VERs, beginning with a pilot.
9. Select an exact architecture prototype, harness, component build, or early product build as the pilot target and declare supported and intentionally unsupported behavior.
10. Implement and review pilot VAIs; execute pilot RUNs and assess verification-design suitability. Pilot RES does not accept DES requirements.
11. Complete and review every DES DWP.
12. Create group candidates, cross-group review them, and compose the DES level candidate.
13. Run the DES candidate gate.
14. Promote supported CMP candidates to accepted.

**Possible authored outputs:** VSP, DWP, DES, ICSP, ENV, VER, VAI pilot, REV, QST, DEC, BSL, prototype ART.  
**Generated outputs:** RUN, RES, evidence, reports.

### Phase 5 — Implementation and formal verification implementation

Two independent tracks proceed from the DES candidate baseline.

#### Product implementation track

1. Run **Implement DES requirements** against exact DES candidate revisions.
2. Generate code and implementation-focused unit tests.
3. Create ART mappings from code/build references to DES stable IDs.
4. Review each substantive ART traceability revision.
5. Detect and resolve unjustified diffs.
6. Produce an exact product build reference.

#### Formal verification implementation track

1. Supply VAI agents with exact DES, ASP, ICSP, VSP, VER, ENV, and executable-boundary inputs.
2. Prohibit access to product source and unit tests.
3. Implement formal VAIs.
4. Review every formal VAI revision.
5. Execute pilot or readiness RUNs and resolve reproducibility defects.
6. Revise VER, VAI, VSP, or ENV when evidence shows the verification design is not executable.

When product implementation coverage, ART reviews, and formal verification readiness satisfy policy, promote supported DES candidates to accepted.

**Possible authored outputs:** product code, unit tests, ART, VAI, revised VER/VSP/ENV, REV, QST, DEC, BSL.  
**Generated outputs:** builds, RUN, RES, evidence, reports.

### Phase 6 — Verification

1. Select exact accepted requirement, VER, VAI, ENV, and controlled component- or product-build references.
2. Execute RUNs bottom-up.
3. Mechanically validate every RUN.
4. Generate RES and evidence.
5. Automatically accept deterministic results when policy permits.
6. Run analysis, demonstration, and inspection assessment scenarios where required.
7. Create PRBs for confirmed product failures; distinguish infrastructure errors.
8. Run change flow for approved fixes.
9. Re-execute the impacted verification set.
10. Perform STK demonstrations and final product acceptance.

**Possible authored outputs:** REV assessments, PRB, CHG, DEC, QST, revised lifecycle data.  
**Generated outputs:** RUN, RES, evidence, reports.

## 21. Change flow

A change may originate from PRB, MAP, QST, or DEC.

1. Create or identify the source artifact.
2. Create CHG with exact traceability-based impact analysis.
3. Review CHG.
4. Gate and approve the CHG.
5. Revise lifecycle data in original-V order.
6. Run required artifact reviews and dedicated simplification scenarios.
7. Update candidate and accepted baselines as policy requires.
8. Generate product code and formal verification implementations independently.
9. Execute impacted RUNs and assess results.
10. Close CHG and any originating PRB with exact evidence.

A changed process document alone does not initiate CHG. Optional reassessment under a newer process is an explicit user or policy decision.

## 22. Brownfield

Brownfield support remains deferred. Existing code should initially be treated as executable evidence and characterized before any retrofit or rebuild decision. Rebuild is not the default claim of v0.8.

# Part III — Generic CLI and Package Authoring Surface

## 23. `req` CLI design

Expressions execute inside the evaluator; no expression invokes a CLI command. The CLI provides repository mutation, package management, compilation, inspection, fixture evaluation, and explanation over the same deep evaluator interfaces.

### 23.1 Command classes and guarantees

Commands fall into three semantic classes:

- **Core commands** operate on every compatible repository and selected Process Package.
- **Capability commands** operate only when the selected package binds the required versioned Kernel Capability.
- **Package Command Aliases** are optional declarative shortcuts to a scenario or generic operation. They cannot execute package-supplied code or bypass validation.

All read and evaluation commands support `--json`. Mutation commands validate preconditions, write atomically, and return exact created or revised IDs. Evaluation output includes the selected package, expression-language, primitive-catalog, and definition versions needed to reproduce the result.

### 23.2 Repository and package selection

- `req init [--process <package-ref>]` — create repository structure and explicitly select a package; interactively offer bundled examples when no ref is supplied.
- `req doctor` — check parseability, integrity, IDs, indexes, package compatibility, and tool compatibility.
- `req process init <path> [--from <package-ref>]` — scaffold an empty package or an independently versioned copy of an example without making that example kernel behavior.
- `req process install <package-ref>` — resolve and install a package without silently selecting it.
- `req process use <package-ref>` — validate and record the repository's exact selected package.
- `req process list` — list installed, bundled, and currently selected packages.
- `req process show [--ref <package-ref>]` — show the resolved manifest and catalogs.
- `req process validate [--ref <package-ref>]` — compile schemas and expressions; validate references, narrowing, capabilities, aliases, recursion, typing, and resolver coverage.
- `req process test [--ref <package-ref>]` — evaluate package fixtures and expected diagnostics.
- `req process diff <old-ref> <new-ref>` — classify definitions and language changes without invalidating Lifecycle Data automatically.
- `req process explain-change <old-ref> <new-ref>` — explain possible behavior and reassessment effects.
- `req process capabilities` — print resolved context roots, paths, operators, host functions, collections, relations, Kernel Capabilities, and definition catalogs.
- `req process reference [--output <path>]` — generate human- and machine-readable package reference material.
- `req process provenance <id>` — show the exact package, prompt, skills, schemas, and policies used.
- `req reassess <id> --against-process <ref>` — explicitly create package-defined reassessment work; never automatic.

### 23.3 Expression authoring and diagnostics

Expression commands address a definition field rather than only a raw source string. The location supplies expected result type, available bindings, payload unions, and package version.

- `req process expression check <definition>#<field>` — parse and type-check one expression with line-and-column diagnostics.
- `req process expression format <definition>#<field>` — render canonical safe source syntax without changing meaning.
- `req process expression explain <definition>#<field>` — show expected type, bindings, resolved references, dependencies, and compiled AST.
- `req process expression evaluate <definition>#<field> --snapshot <fixture> [--bindings <json>]` — evaluate against an explicit fixture and show intermediate evidence.

A raw-expression mode may be offered for experimentation only when callers also supply an explicit evaluation context and expected type. Package validation remains authoritative.

### 23.4 Definition inspection and direct evaluation

These commands expose every building block needed to author a case-specific structure and understand why an expression or obligation behaves as it does:

- `req process definition new <kind> <id>` — scaffold a template, type, selector, policy, state, obligation, scenario, phase, profile, or alias definition using the selected meta-schema version.
- `req process definition list|show [kind|id]` — inspect source locations, references, versions, and generated dependents across all definition kinds.
- `req process fixture new <name>` — scaffold an evaluation snapshot and expected-result fixture for package tests.
- `req type list|show|resolve <type>` — inspect declared and flattened payload schemas, links, behavior, and capability bindings.
- `req relation list|show|evaluate <relation> --from <id> [options]` — inspect a primitive relation and its typed result records.
- `req selector list|show|evaluate|explain <selector> --arg <name>=<value>...` — evaluate query sources, predicates, nested selectors, and ordered results.
- `req policy list|show|evaluate|explain <policy> --arg <name>=<value>...` — show priorities, matching rule, default behavior, and typed result.
- `req state list|show|evaluate|explain <dimension> --subject <id>` — show matching rules, dependencies, precedence, and result.
- `req obligation list|show|evaluate|explain <obligation> [--subject <id>]` — show subject selection, satisfaction evidence, status, blockers, dispatchability, resolver bindings, and waiver result.
- `req phase list|show|evaluate|explain <phase>` — show entry, candidates, applicable obligations, gate result, and blockers.
- `req scenario list|show|validate <scenario>` — inspect its input/output contract, prompt, policies, completion expression, prohibited inputs, and resolved obligation classes.
- `req skill show <skill>` — inspect a skill referenced by a prompt.

`explain` output must identify source definitions and expression spans rather than returning only a Boolean conclusion.

### 23.5 Generic datum and revision management

- `req new <type> [--set <path>=<value>...]` — create a stable random ID and first editable revision using the selected package's resolved type.
- `req show <stable-id|revision-id>` — return durable content plus computed links, states, obligation instances, and capability projections.
- `req list [filters]` — list stable data or revisions across package-defined types.
- `req search <query> [filters]` — search content and computed metadata.
- `req revise <stable-id> [--from <revision>]` — create the next editable revision and enforce local draft/concurrency policy.
- `req set <draft-revision> <payload-path> <value>` — perform a schema-aware update outside kernel-managed paths.
- `req abandon <draft-revision>` — remove or tombstone an unfrozen draft with an audit entry.
- `req validate <id|--all>` — validate envelope, resolved payload schema, links, identity, references, and immutable constraints.
- `req history <stable-id>` — show lineage, package provenance, links, states, and exact snapshot membership when available.

Retirement, questions, decisions, reviews, DWPs, and changes are not generic mutations. A package expresses them as types and scenarios.

### 23.6 Generic links and graph traversal

- `req link <source-revision> <target> --type <relationship>` — add one outbound link validated by the resolved source type.
- `req unlink <source-revision> <target> --type <relationship>` — remove a link from an editable revision only.
- `req backlinks <id>` — compute inbound links from stored outbound links.
- `req trace <id> [--relation <id>] [--depth <n>]` — walk the graph with exact identity and freeze resolution.
- `req relation evaluate <relation> --from <id>` — expose the same primitive relation result available to selectors.
- `req dependency-changes <revision> [--against <revision|snapshot>]` — return typed conservative change records without deciding package-specific staleness.

Coverage, impact, review reuse, and similar conclusions are selectors, policies, or obligations supplied by the package and inspected through the evaluator commands.

### 23.7 Kernel Capability commands

- `req capability list|show` — inspect capabilities available in the kernel and bindings selected by the package.

When a package binds `exact-baseline@1`, the CLI additionally exposes:

- `req baseline create --type <bound-type>` — create the package's capability-bound baseline type.
- `req baseline add|remove <baseline> <revision>` — edit definition membership before freezing.
- `req baseline evidence add|remove <baseline> <revision>` — edit supporting evidence separately.
- `req baseline compose <baseline> <component-baseline>...` — record exact composition using the bound type's link contract.
- `req baseline freeze <baseline>` — atomically resolve members and links, populate hashes and provenance, and make the baseline immutable.
- `req baseline verify <baseline>` — verify capability-required hashes, exact references, composition, and manifest integrity.
- `req baseline diff <old> <new>` — emit structural content, link, resolution, evidence, and membership changes.
- `req baseline members <baseline> [--flatten]` — list definition members, evidence, and composition separately.

Candidate roles, review status, currentness, gates, and promotion remain package rules. The bundled example derives them through BSL payload, selectors, policies, and scenarios rather than extending the capability contract.

### 23.8 Lifecycle evaluation and orchestration

- `req evaluate [--phase <phase>] [--snapshot <fixture>]` — return the complete typed lifecycle evaluation without mutation.
- `req state <id>` — summarize all package-defined state dimensions while preserving them separately in JSON.
- `req loose-ends [filters]` — return unsatisfied Obligation Instances with status, evidence, blockers, dispatchability, and resolver bindings.
- `req loose-ends explain <instance>` — show exact expression, selector, policy, relation, and source-location evidence.
- `req phase status <phase>` — return entry, candidates, obligation summary, gate result, and blockers.
- `req next [--phase <phase>]` — return the next dispatchable instance or coherent package-declared batch.

Ordering is presentation over unchanged obligation truth. Orchestrators dispatch only instances marked dispatchable.

### 23.9 Scenario execution

- `req scenario execute <scenario> --input <name>=<value>...` — validate bindings and prohibited inputs, invoke the configured agent adapter, validate declared outputs, and record exact execution provenance.
- `req scenario dry-run <scenario> --input <name>=<value>...` — resolve contracts, prompt, policies, expected outputs, and completion checks without invoking an agent.
- `req scenario execution show <execution>` — inspect bound inputs, prompt and skills loaded, outputs, diagnostics, and completion evidence.

Scenario execution is an adapter boundary, not an expression function. A package declares contracts and content but cannot supply executable host code. RUN and RES in the bundled example are Lifecycle Data created by its verification scenarios, not universal meanings of `req scenario execute`.

### 23.10 Package Command Aliases and example conveniences

The generic commands above are sufficient to author and execute any compatible package. A package may optionally declare a safe alias that binds CLI arguments to one declared scenario or generic operation:

```yaml
command_aliases:
  dwp.create:
    scenario: define-dwp-plan@1
    inputs:
      parents: 'args.parents'
      target_type: 'args.target_type'
      architecture: 'args.architecture'
```

An alias is discoverable through `req process show`, validated with the package, and executed through the same scenario contract. It cannot invoke a shell, load package code, skip prohibited-input checks, or bypass output validation.

The bundled V-model example may provide ergonomic aliases such as `req dwp create`, `req review start`, `req vsp create`, `req env qualify`, `req gate prepare`, and `req change implement`. Until an alias exists, the equivalent operation remains `req scenario execute <scenario>` plus generic datum, link, evaluator, and capability commands. These names are conveniences of that package, not promises made by MDLM core.

# Part IV — Bootstrap Implementation Profile

## 24. Walking-skeleton implementation profile

The implementation does not build the complete CLI before testing the model. The process package and computed evaluator behavior are the first product; durable mutation and convenience commands follow observed need.

### 24.1 Completed evaluator slice

**Validated by vertical slice:** A TypeScript/Node prototype exposes only:

```text
loadProcessPackage(path)
resolveType(package, typeId)
evaluateLifecycle(package, snapshot)
```

Eleven behavior tests exercise only these public interfaces. The runnable example resolves STK and evaluates an in-memory PSP → STK → SYS snapshot. It reports the three valid draft artifacts, ready review-context obligations before their blocked reviews, and exact resolver scenarios. A separate fixture validates that an unreviewed gate-signoff DEC blocks duplicate gate dispatch.

The prototype deliberately does not persist lifecycle data. Its snapshot combines durable envelopes with kernel-computed storage, integrity, and dependency-change projections. Relation traversal scans the small in-memory graph; production indexing is deferred until realistic measurements exist.

The next evaluator work is textual expression compilation, complete package validation, deeper loose-end explanations, and phase/gate results. The next kernel work is durable repository loading, hashing, immutable and atomic mutation, and the initial CLI adapter.

### 24.2 Next core CLI slice

Implement the package-neutral surface before example-specific aliases:

```text
req init
req doctor
req process install/use/list/show
req process validate/test/capabilities
req process expression check/explain/evaluate
req type list/show/resolve
req relation list/show/evaluate
req selector show/evaluate/explain
req policy show/evaluate/explain
req state show/evaluate/explain
req obligation show/evaluate/explain
req phase show/evaluate/explain
req scenario list/show/validate/dry-run
req skill show
req new/show/list/search/revise/set/abandon/history/validate
req link/unlink/backlinks/trace/dependency-changes
req capability list/show
req baseline create/add/remove/freeze/verify/diff/members
req evaluate
req loose-ends
req loose-ends explain
req next
```

Baseline commands join this slice only after the bootstrap package is migrated to bind `exact-baseline@1`; they are capability commands, not required vocabulary for every package. Agent invocation through `req scenario execute` follows contract validation and dry-run support.

The first loose-end classifications are:

```text
ready
blocked
awaiting-review
stale
failed
```

### 24.3 Example pilot obligations through generic operations

The V-model pilot must not quietly pull its specialized nouns into the kernel. Until safe Package Command Aliases exist:

| Example-package obligation | Generic or capability operation |
|---|---|
| Create a DWP | `req new DWP` plus generic links and fields. |
| Complete a DWP | `req revise DWP`, populate outputs and coverage, then review it. |
| Create or refine VSP/ENV/VER/VAI | `req new`, `req revise`, and generic links. |
| Record qualification or pilot execution | Execute manually, then create RUN/RES with `req new` and validate their schemas and references. |
| Triage collateral finding | Create and link QST, DEC, PRB, or revision work manually. |
| Gate sign-off | Freeze the candidate BSL, create DEC, and link it to the exact baseline. |
| Promote a baseline | Create an accepted BSL with generic baseline operations, a `promotes` link, and supporting DEC/evidence. |
| Create a waiver | Create a structured DEC and exact `waives` link manually. |
| Inspect DWP or gate readiness | Use `req show`, `req trace`, and `req loose-ends` rather than specialized status commands. |

### 24.4 Pilot project

Drive one deliberately small project through Phases 0–2:

- one PSP;
- two or three STKs;
- one VSP with one environment profile;
- one `DEFAULT` group;
- two DWPs;
- four or five SYS requirements;
- one ASP;
- one ICSP;
- one exploratory prototype with ART, evidence, and DEC but no RUN/RES;
- one architecture prototype or harness used as an exact pilot target;
- one ENV;
- one qualification VER/VAI/RUN/RES;
- one pilot VER/VAI/RUN/RES with both supported and intentionally unsupported behavior;
- individual REVs;
- one collateral finding and manual triage;
- one post-review requirement revision;
- one candidate gate and baseline promotion expressed through generic and capability operations.

Measure:

- review volume and agent effort;
- quality improvement from contextual reviews;
- correctness and explainability of computed state and staleness;
- review reuse after localized change;
- usefulness of the loose-end queue;
- sufficiency of VSP-embedded environment profiles;
- whether pilot verification distinguishes supported from unsupported behavior;
- whether the process actually removes scope.

Record the pilot measurements and the decision to proceed as DEC evidence before adding V-model Package Command Aliases. Do not add the remaining example-package conveniences until the pilot demonstrates that immutable revisions, baseline diffing, review reuse, computed state, and loose-end routing work.

## 25. v1 simplifications and deferred features

### 25.1 MDLM core

- No arbitrary executable plugins or package-defined host functions; Package Command Aliases bind only to declared scenarios or generic operations.
- No arbitrary imperative workflow language in process files; packages use declarative selectors, obligations, and resolver scenarios.
- No author-authored YAML expression AST; process logic uses the safe versioned MDLM Expression Language and compiles to an internal AST.
- No dispatch based only on a resolver name; orchestration requires explicit dispatchability and satisfied bindings.
- No self-modifying kernel semantics; new primitives and Kernel Capabilities require a kernel release.
- No automatic invalidation due solely to process-package changes.
- No production indexing design until realistic repositories provide measurements.

### 25.2 Bundled V-model example

- No durable claim/lease model; the orchestrator dispatches each DWP once.
- No generic example-package work-item type beyond DWP.
- No separate environment-capability specification datum; environment capabilities live in VSP profiles.
- No first-class verification campaign beyond RUN.
- No enforced source-isolation container in v1; independence is instructional and recorded.
- No brownfield retrofit workflow.
- No formal compliance claim.
- Conservative staleness is acceptable; unsafe evidence reuse is not.

## 26. Invariants

### 26.1 MDLM core invariants

1. The active Process Package and expression-language version are explicit and reproducible; no bundled example is silently treated as kernel behavior.
2. Frozen revisions are immutable, and capability-managed snapshots preserve their kernel integrity claims.
3. A Process Package owns payload templates, source-owned link contracts, policies, states, selectors, obligations, scenarios, phases, and aliases but may not weaken the Datum Envelope or integrity guarantees.
4. At most one unfrozen draft exists locally for a Stable Datum under the selected concurrency profile; conflicts never rewrite frozen history.
5. Backlinks, Computed States, and Obligation Instances are projections over durable data rather than independently mutable truth.
6. Process provenance records the package, scenario prompt, policies, and skills actually used; later package changes do not automatically invalidate historical Lifecycle Data.
7. Process values, conditions, predicates, bindings, and quantifiers are authored in the versioned MDLM Expression Language and cannot execute arbitrary code or invoke the CLI.
8. Higher-order conclusions are derived through selectors over typed primitives; adding a process-specific conclusion does not silently add a kernel fact.
9. A resolver scenario may run only when its Obligation Instance is explicitly dispatchable and all bindings and dependencies are satisfied.
10. Every invalid, stale, blocked, failed, or waived conclusion is explainable through exact definitions, expressions, primitive evidence, and source locations.
11. Phases evaluate declarative obligations and gates; they do not depend on hidden imperative orchestration logic.
12. Package Command Aliases resolve only to declared scenarios or generic operations and cannot install or invoke package-supplied executable code.
13. A Kernel Capability is selected explicitly by version and bound to a compatible package type; the kernel never recognizes a lifecycle type merely by its ID.

### 26.2 Bundled V-model example invariants

1. Every substantive authored revision required by review policy has passing review evidence in the required context before candidate use; qualification support artifacts may be covered by the containing ENV REV.
2. Every definition phase includes an independent dedicated simplification review.
3. Every level has at least one group baseline. For each role and scope, at most one non-superseded composed baseline is current, and one accepted baseline remains authoritative while a newer candidate is evaluated.
4. Accepted maturity comes only from membership in an accepted BSL.
5. Promotion references an exact candidate BSL and downstream evidence.
6. Every child requirement has provenance to an authorized candidate or accepted parent, constraint, interface obligation, or explicit decision.
7. Every formal VER has an independently authored and reviewed VAI.
8. Qualification activities are lightweight ENV evidence and do not verify product requirements.
9. Pilot activities make claims about verification-design suitability and cannot become formal requirement evidence without a new formal run.
10. Exploratory prototypes do not produce RUN or RES; architecture prototypes produce bounded ART/DEC evidence and may serve as exact pilot targets.
11. Formal and pilot VAI authoring does not use product source or unit tests.
12. Every RUN binds exact VER, VAI, ENV, execution-target, runner, and configuration references.
13. Analysis, demonstration, and manual inspection results receive the assessment required by their VER.
14. Scenario skill-loading instructions live in the scenario prompt; the registry stores the prompt reference rather than a duplicate skill list.
15. A recorded gate sign-off becomes applicable only after the gate DEC is valid and its policy-required review passes; an existing unreviewed sign-off blocks duplicate gate dispatch.
16. Conservative staleness is acceptable, but the example package never silently preserves materially affected evidence.
