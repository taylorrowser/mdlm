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

**Correction**:
Package-declared work that addresses exact blocking evidence through a same-lineage replacement while preserving the failed Revision and judgment, after which normal reevaluation resumes at the blocked obligation.
_Avoid_: Retrying without new evidence, Change Request when no accepted definition changes

**Dispatchable**:
A loose end whose resolver may safely run now because its required inputs and dependencies are satisfied.
_Avoid_: Ready when referring only to maturity

**Scenario**:
A versioned contract for agent work with typed inputs, outputs, prohibited inputs, prompt, policy, and completion conditions.
_Avoid_: Workflow step, command

**Assignment**:
An exact state-bound projection of one Scenario transaction prepared for one agent to return a proposal; it is orchestration context, not authoritative Lifecycle Data.
_Avoid_: Durable task, permission to select unrelated work

**Scenario Proposal**:
Complete candidate publication content for one exact Assignment that becomes Lifecycle Data only after canonical validation and publication.
_Avoid_: Published lifecycle truth, partial direct Markdown edits

**Assignment Response**:
A versioned harness-neutral return for one exact Assignment containing either a complete Scenario Proposal or a typed inability to complete; only a valid proposal can publish Lifecycle Data.
_Avoid_: Free-form completion prose, partial proposal

**Operator Outcome**:
One exact result of normal repository and Process Package reevaluation: Assignment, Attention Required, Profile Boundary Reached, Lifecycle Complete, Process Dead End, or Invalid.
_Avoid_: Null next item, hidden workflow cursor

**Profile Boundary**:
A package-declared successful stop where the selected implementation profile intentionally omits further lifecycle breadth without claiming that the lifecycle itself is complete.
_Avoid_: Process Dead End, Lifecycle Complete

**Process Dead End**:
An explicit outcome in which the supported profile is unfinished but the selected Process Package derives no Assignment or Attention Requirement that can advance it.
_Avoid_: Completed boundary, command failure

**Package Liveness Defect**:
A reachable Process Dead End inside the Process Package's declared supported profile where an expected outcome lacks correction, escalation, or explicit terminal disposition.
_Avoid_: Structurally invalid package, intentionally declared profile boundary

**Authority Requirement**:
A machine-readable Scenario participation result stating whether work is autonomous, package-delegated to a separate authority, or attended by an authority holder, which package-defined authority is required, and whether attended authority may be delegated. Package-delegated work with no scheduled attention requires the separate delegate's judgment, not repeated stakeholder permission.
_Avoid_: Inferring attended permission from prompt prose, treating independent judgment as stakeholder attention

**Authority Supply**:
An explicit execution-time assertion naming the authority that authorized publication. It may come from an attended authority holder or from the separate authority selected by package-delegated/no-attention participation. It permits the operating agent to invoke a non-autonomous Scenario but does not itself satisfy an Obligation; the declared exact REV or DEC output does that.
_Avoid_: Chat approval as lifecycle evidence, operating-session self-judgment, user-operated sign-off command

**Authority Evidence**:
The exact Scenario output named by the package as the durable record of consequential authority: REV for Review judgment and DEC for gates, scope, waiver, deferral, delegation, progression, and comparable Decisions.
_Avoid_: Adapter prose, completion summary, execution log alone

**Authority-Evidence Type**:
A Lifecycle type named by at least one exact selected-package Scenario `authority_evidence.type` contract. The kernel derives this set without recognizing package type IDs; direct creation and Revision creation cannot publish these types, and repository validation requires their matching completed Scenario transaction.
_Avoid_: Hard-coded REV/DEC handling, a type inferred from the claimed creation Scenario alone

**Standing Delegation**:
A reviewed exact DEC authorizing one named delegate for one authority, exact target Revision, and exact Scenario, with declared expiry and reactivation conditions. It is reusable authorization evidence, unlike a delegate explicitly supplying authority for one execution. When supplied for an Assignment, it must satisfy the Scenario's exact package Selector before it can replace a per-execution Authority Supply. It is not a prerequisite when the package itself declares delegated authority with no scheduled attention.
_Avoid_: Per-execution authority assertion, role assumption, unbounded permission

**Attention Schedule**:
A machine-readable Scenario participation result stating whether authority needs no attention, immediate attention, or attention at a named checkpoint, independently of the Scenario's transaction-batching contract.
_Avoid_: Treating every atomic Scenario transaction as a separate interruption

**Consolidation Group**:
A package-defined identity grouping compatible checkpoint-scheduled Authority Requirements that may be presented together without deferring or satisfying their underlying Lifecycle Data.
_Avoid_: Batch execution, durable deferral

**Phase**:
A declarative scope that selects applicable obligations, scenarios, entry conditions, gate conditions, and optional evidence-driven progression without prescribing an imperative sequence.
_Avoid_: Pipeline stage when sequential execution is implied

**Active Phase**:
The Phase derived by following complete package-declared progression from the initial Phase using exact Lifecycle Data and package provenance. It is not a mutable repository pointer.
_Avoid_: `.mdlm-phase`, manually selected current stage

**Phase Progression**:
A package declaration combining readiness, a named next Phase, an Authority Requirement, a public authorization Scenario, and an exact evidence Selector. A reviewed gate DEC may satisfy it directly, or package Policy may require a separate reviewed DEC.
_Avoid_: Chat-based progression, redundant approval by default

## Definition and decomposition

**Accepted Requirement Revision**:
An exact requirement Revision included in an Accepted Baseline; Review alone does not make a requirement accepted, and later substantive revision follows package-declared change control.
_Avoid_: Reviewed requirement, latest requirement

**Decomposition Work Package (DWP)**:
The durable planning and completion lineage for one bounded many-to-many decomposition from exact parent requirement Revisions to exact child requirement Revisions.
_Avoid_: Task, batch, decomposition document

**Architecture Specification (ASP)**:
An exact definition of architecture elements, responsibilities, interactions, constraints, and nominated risks used to organize decomposition.
_Avoid_: Implementation design when the claim is architectural context

**Architecture Element**:
A stable opaque identity embedded in an ASP Revision and used for allocation independently of its changeable human-facing alias.
_Avoid_: Component requirement, alias when identity matters

**Interface Control Specification (ICSP)**:
A normative externally observable contract across a controlled architecture boundary, including operations, schemas, units, timing, errors, security, ordering, compatibility, and versioning.
_Avoid_: Private API, implementation interface

## Problem and change control

**Problem Report (PRB)**:
An exact report of a failure or unexpected condition preserving the immutable evidence in which it was observed.
_Avoid_: Bug ticket when the durable evidence relationship matters

**Change Request (CHG)**:
A reviewed bounded change with exact traceability-based impact, explicit implementation order, approval, and closure evidence.
_Avoid_: Problem Report, generic task, mutable change status

**Original-V order**:
The dependency-respecting change sequence from affected requirements through replacement context, Reviews, baselines, and independent verification evidence.
_Avoid_: Hidden workflow, arbitrary edit order

**Evidence reuse**:
Continued use of exact historical evidence whose declared dependencies have not materially changed; authorization history remains intact even when reuse becomes Stale.
_Avoid_: Treating all nearby evidence as affected

## Process assessment

**Pilot Assessment (PAS)**:
A reviewed durable measurement record over one exact frozen pilot evidence context, ending in a proceed, change, or stop recommendation.
_Avoid_: Generated lifecycle report, informal retrospective

**Expansion Decision**:
An exact DEC that adopts the recommendation of a reviewed Pilot Assessment before broader Example Process Package work begins.
_Avoid_: Implicit continuation, roadmap intention

**Scope reduction**:
Observed removal of challenged behavior or lifecycle content, recorded separately from simplification ceremony that retains everything.
_Avoid_: Review completion, scope clarification without removal

## Review and authorization

**Review Context**:
An exact frozen baseline containing the primary subject and the minimum complete context needed for independent judgment.
_Avoid_: Snapshot when its review purpose matters

**Review Finding**:
A structured concern inside one exact Review naming its exact target, relationship, severity, summary, and optional evidence; package rules may turn blocking findings into Correction work.
_Avoid_: Generic comment, mutable annotation

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
