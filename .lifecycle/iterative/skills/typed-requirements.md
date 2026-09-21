---
id: typed-requirements
version: 10
---

# Author one normal-link requirement graph

Read the exact input records in guidance.context. For an existing RQS, follow its contains and decomposition links with `mdlm show <exact-revision> --json` to inspect REQs and DCPs. A software leaf is a selected software requirement with no selected children. Write one REQ per obligation in the direct requirements batch. Stakeholder requirements use kind: stakeholder and statement for the user outcome or constraint. All non-stakeholder levels use kind: software and ears for required behavior, including system, software high-level and software low-level roles. Give each a useful title and keep source or rationale when needed to explain intent. The CLI supplies ordinary identities and generates one RQS containing the complete selected graph. The set receives one independent Review; individual requirements need no extra authoring or review turns.

Author REQs and DCPs in the proposal's `candidates` array, each with a unique `localId`. A group names its parent's complete immediate children:

```json
{
  "localId": "task-behavior",
  "type": "DCP",
  "payload": {"title": "Task behavior", "publication": "recorded"},
  "links": [
    {"type": "parent", "target": "$need"},
    {"type": "child", "target": "$complete"}
  ],
  "body": ""
}
```

Here `need` and `complete` are REQ candidate localIds in the same proposal. Use a string such as `"REQ-0123456789AB-r00001"` for an existing exact revision. `$<localId>.id` names a candidate's stable identity when a field requires it. REQs carry statements; DCP normal links carry decomposition. Multiple parents and useful levels are allowed. Every software path must reach a stakeholder root. Include exactly one RQS candidate from guidance, preserving its links and predecessor if present; the CLI derives its selection and payload.

Apply the coherent-obligation rule in [product-quality](product-quality.md). Keep the
functional transition in the leaves alongside shared success and failure rules;
generic success or rejection alone does not define the action. A path to an
ancestor cannot replace a missing leaf obligation.

Fill ears.pattern, system and response. Supply the complete subject in system and the response without a trailing period. Event requires event; state requires state; optional requires feature; unwanted requires unwanted. Ubiquitous has no guard. Complex combines at least two guards, with at most one event or unwanted guard. Preserve necessary semantics from stakeholder and approved design inputs while separating their obligations; existing code is never an authoring source to transcribe. Carry relevant parent constraints into the software contract.

Before submission, apply the shared checks to the final normative statements and
exact selected child memberships in this authoring turn. Treat rationale as
explanation. For each classified outcome, identify the obligation that produces
it, including required progress when no external event arrives. Try a case where
every selected child holds but its parent fails; close gaps by reusing existing
shared requirements where applicable. Keep permitted implementation choices open.

## Record architecture and chosen depth

For each system boundary, designate one owning REQ and put a short architecture/depth
note in its `rationale`, separate from the obligation in `statement` or `ears`.
Explain the allocation of responsibilities, state ownership and interactions,
the chosen requirement roles and why the leaves settle required behavior. Put
required interactions in normative obligations, including parent integration claims.
State the decision's origin, proposed or reviewed status, permitted implementation variation and what
would trigger refinement. This is the first trial representation, not a separate
architecture type or automatic architecture impact query.

Each allocated REQ identifies its responsibility and role in its own rationale,
referring to the owning requirement by its unambiguous title in the initial batch
or exact revision once published. Keep the shared architecture note in one place.
The selected RQS/DCP graph binds the exact requirements; `uses-interface` links bind
applicable exact ICD revisions. Record an ICD for a meaningful internal or external
contract, not for every helper.

## Keep normative ownership explicit

Each coherent obligation has an owning REQ. Its `statement` or `ears` states the
required behavior and explicitly names any applicable stable normative ICD clause
identifiers, with `uses-interface` selecting the exact ICD revision. The referenced
clauses may own encoding, schema, ordering and compatibility details; keep their
normative definition there rather than copying it into the REQ. A whole-ICD link
alone does not identify which clauses the REQ requires. Keep unrelated capabilities
under their own owning requirements.

Rationale explains origin, allocation and design choices. If removing a rationale
sentence changes the required result, move that rule into the normative obligation
or an explicitly incorporated ICD clause. Mark normative ICD clauses
separately from provisional or descriptive choices. In the existing requirement
assessment and verification coverage rationale, identify the applicable clause IDs
and their evidence or gaps. This adds no per-clause datum or lifecycle transaction.

## Settle useful depth

Stakeholder roles describe needed outcomes; system roles define boundary behavior;
software high-level roles allocate behavior; low-level roles settle necessary
calculations, validation and state transitions. These roles are descriptive, not
extra `kind` values or a fixed tier count. Stop when a reader can derive the
required inputs, outputs, state changes and relevant failures from the leaf and
its exact applicable contracts; remaining choices must be permitted implementation
variation. Another level must settle a decision, allocate a meaningful responsibility
or express an integration claim. Restating the parent, splitting a formula into
branches or following helper functions does not justify more depth. A singleton
group can be useful when it adds that information. Shared rules remain shared
requirements. The source-free verification export includes the full REQ rationale
and selected ICDs, so author it without implementation excerpts or product-authored
expectations.

Revise an architecture note through the normal owning REQ revision and applicable
review/change route. Assess affected allocations and contracts explicitly; prior
notes remain history. Review the note as design rationale, not blanket stakeholder
approval of every recorded choice. Keep exploratory choices provisional until their
necessity is justified for the selected formal scope.

For corrections and approved changes, inspect the exact prior review and approved change inputs to identify the correction scope. Use `predecessor` with the exact prior revision only for requirements whose claims change. Leave unchanged children and ancestors at their existing revisions. The CLI refreshes affected endpoints in retained DCP groups, generates RQS selection and queues review. Author a DCP only when membership changes, using `predecessor` for its existing lineage. In each authored DCP, use `$<localId>` for every parent or child created or revised in the same proposal; use exact selected revisions for unchanged endpoints. To retire a requirement, add `{ "type": "retires", "target": "<exact-selected-REQ-revision>" }` to the existing RQS candidate's links, retaining its predecessor and other guidance links. Its authored payload may be empty and its body should be empty. Revise surviving DCP membership to remove retired endpoints; the CLI omits groups whose parent is retired. Removing one parent link from a shared child does not retire it. Reinstatement is outside this package.

## Check the refinement

Authors and reviewers use the existing requirement rationale and exact group
assessment fields for these judgments, without a separate proof artifact:

- Identify what each child adds to the parent: a settled decision, an allocated
  responsibility or a necessary interaction. For a derived constraint, explain its
  origin, why it is needed and which parent outcome depends on it. Allocation
  labels alone do not justify a design choice.
- Include relevant shared-state and failure boundaries in the parent counterexample.
  Name the shared requirements and assumptions needed to close the gap; preserve
  the parent's meaning and check actual membership rather than graph reachability.
- Judge each child's validity separately from collective coverage. Resolve a real
  gap through necessary behavior, shared requirements or an authorized clarification.
  Keep permitted variation open and stop at the depth rule above.

For example, a parent says that a failed action preserves saved state. Its child
preserves state on validation, unknown-item and save failures. Saving may succeed
and then the reply be lost: every listed child case can hold while the parent's
meaning remains unsettled. Identify the commit/acknowledgement boundary and obtain
a decision about what counts as failure. This does not authorize new rollback or
retry behavior. A test of rejection or failed saving does not establish the
lost-reply case. Once the chosen boundary and transition are explicit, decomposing
into file or HTTP-handler steps adds no required behavior.

For independent review, use the assessments and exact DCP context exported by
`mdlm review context <action> <exact-subject> --json`. Record `revise-membership`
when collective coverage requires additions, removals or redistribution, even if
all existing children are valid. An unchanged child's own exact group retains its
prior review; a revised child triggers review of its group. No minimum number of
edits applies.

After accepted product baseline, changes require an approved CHG. Its roots and derived descendants define scope; the current frontier defines what to edit now. Unrelated revisions require amended stakeholder approval. Keep the body empty when structured fields carry the claim.
