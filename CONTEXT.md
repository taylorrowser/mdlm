# Markdown Lifecycle Manager

MDLM models durable product intent, engineering definition, review, evidence, and
work obligations as versioned lifecycle data evaluated by a declarative process.

## Lifecycle data

**Lifecycle Datum**:
A durable typed claim stored as Markdown and identified independently from its revisions.
_Avoid_: Artifact when specifically referring to lifecycle truth, record

**Stable Datum**:
The conceptual lifecycle datum that persists across revisions and is named by a stable ID.
_Avoid_: Latest version, document

**Revision**:
One exact version of a stable datum, named by a revision ID and immutable once frozen.
_Avoid_: Version when exact lifecycle identity is intended

**Datum Envelope**:
The kernel-owned identity, revision, links, provenance, payload container, and body shared by every lifecycle datum.
_Avoid_: Common template, base type

**Payload**:
The process-defined fields carrying the type-specific claim inside a datum envelope.
_Avoid_: Metadata when referring to substantive lifecycle content

**Payload Template**:
A reusable additive definition of payload fields and constraints inherited by lifecycle types.
_Avoid_: Base class, mixin

## Process model

**Kernel**:
The fixed integrity and storage semantics that a process package cannot weaken, including identity, immutability, hashing, graph traversal, and deterministic evaluation.
_Avoid_: Process engine when referring only to fixed primitives

**Process Package**:
Versioned declarative data defining lifecycle types, policies, states, selectors, obligations, scenarios, phases, prompts, and skills.
_Avoid_: Workflow, configuration when its normative role matters

**Example Process Package**:
A complete installable process package shipped to demonstrate one lifecycle structure without making that structure part of MDLM core semantics.
_Avoid_: The MDLM process, built-in workflow, default model

**Kernel Capability**:
A versioned opt-in contract by which a process type receives a fixed kernel service, such as exact snapshot freezing and hashing, without requiring a particular type ID.
_Avoid_: Hard-coded lifecycle type, plugin

**Package Command Alias**:
An optional declarative CLI shortcut that binds arguments to a scenario or generic operation without executing package-supplied code.
_Avoid_: Plugin command, kernel command

**Primitive**:
A typed kernel-supplied value, collection, or relation from which process conclusions are derived.
_Avoid_: Fact when it already encodes a process-specific conclusion

**Relation**:
A kernel-supplied graph traversal such as incoming links, baseline members, revisions, or dependency changes.
_Avoid_: Relationship when referring to the evaluator operation

**Selector**:
A named parameterized query that derives a reusable set of lifecycle entities or records from primitives.
_Avoid_: Filter when referring to the complete reusable query

**Policy**:
A deterministic prioritized decision table returning a typed result from declared inputs.
_Avoid_: Guideline when the result controls machine behavior

**Computed State**:
One derived dimension of lifecycle interpretation, such as maturity, disposition, validity, or an overlay.
_Avoid_: Status, lifecycle state

**MDLM Expression Language**:
The safe versioned textual language used wherever process data declares a value, condition, predicate, binding, or quantifier.
_Avoid_: Universal language, YAML expression tree, script

## Work and orchestration

**Obligation**:
A declarative requirement that must be satisfied for each subject selected by its rule.
_Avoid_: Task, work item

**Obligation Instance**:
One evaluated obligation for one exact subject under one process reference.
_Avoid_: Artifact status

**Loose End**:
An unsatisfied obligation reported with its cause, blockers, dispatchability, resolver, expected outputs, and waiver policy.
_Avoid_: Todo, incomplete artifact

**Resolver Scenario**:
The declared scenario capable of producing evidence that satisfies an obligation.
_Avoid_: Handler, automatic fix

**Dispatchable**:
A loose end whose resolver may safely run now because its required inputs and dependencies are satisfied.
_Avoid_: Ready when referring only to maturity

**Scenario**:
A versioned contract for agent work with typed inputs, outputs, prohibited inputs, prompt, policy, and completion conditions.
_Avoid_: Workflow step, command

**Phase**:
A declarative scope that selects applicable obligations, scenarios, entry conditions, and gate conditions without prescribing an imperative sequence.
_Avoid_: Pipeline stage when sequential execution is implied

## Review and authorization

**Review Context**:
An exact frozen baseline containing the primary subject and the minimum complete context needed for independent judgment.
_Avoid_: Snapshot when its review purpose matters

**Candidate Baseline**:
An exact frozen definition proposed for downstream authorization but not yet historically accepted.
_Avoid_: Draft baseline

**Accepted Baseline**:
An immutable baseline whose exact definition has received the required authorization and downstream evidence.
_Avoid_: Current baseline

**Gate Sign-off**:
An explicit decision about one exact candidate baseline; it becomes applicable only when its required review evidence passes.
_Avoid_: Approval when exact candidate identity is omitted

**Process Drift**:
An informational difference between recorded process provenance and the currently resolved process package.
_Avoid_: Staleness when no lifecycle dependency changed

**Stale**:
A validity result meaning a declared dependency changed and an earlier claim requires reassessment before reuse.
_Avoid_: Invalid, outdated

**Invalid**:
A validity result meaning structural integrity, identity, schema, reference, or applicable hash guarantees are broken.
_Avoid_: Stale
