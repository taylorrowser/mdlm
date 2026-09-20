---
id: typed-requirements
version: 6
---

# Author one normal-link requirement graph

Read the exact input records in guidance.context. For an existing RQS, follow its contains and decomposition links with `mdlm show <exact-revision> --json` to inspect REQs and DCPs. A software leaf is a selected software requirement with no selected child group. Write one REQ per obligation in the direct requirements batch. Stakeholder requirements use kind: stakeholder and statement for the user outcome or constraint. All non-stakeholder levels use kind: software and ears for required behavior, including system, software high-level and software low-level roles. Give each a useful title and keep source or rationale when needed to explain intent. The CLI supplies ordinary identities and generates one RQS containing the complete selected graph. The set receives one independent Review; individual requirements need no extra authoring or review turns.

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

Shared success and failure constraints must retain the functional behavior in the leaves. For example, decomposing add-task only into successful exit and invalid-input rejection loses creation of an incomplete task, next-ID assignment, exact-title persistence and ID output. Give separately changeable outcomes their own requirements, with children covering those remaining obligations alongside the shared constraints. A parent can state one integrated outcome without bundling its children's distinct commitments into its own statement. Authors and reviewers check that terminal descendants collectively retain the parent behavior and that linked leaves explain a source region's actual work. A path to an ancestor cannot replace a missing leaf obligation.

Fill ears.pattern, system and response. Supply the complete subject in system and the response without a trailing period. Event requires event; state requires state; optional requires feature; unwanted requires unwanted. Ubiquitous has no guard. Complex combines at least two guards, with at most one event or unwanted guard. Preserve necessary semantics from stakeholder and approved design inputs while separating their obligations; existing code is never an authoring source to transcribe. Carry relevant parent constraints into the software contract. Add intermediate requirements when they express a useful outcome or allocated responsibility. Apply the shared author and reviewer checklists regardless of record count. Mechanical graph completeness does not establish behavioral completeness or appropriate detail.

## Record architecture and chosen depth

For each system boundary, designate one owning REQ and put a short architecture/depth
note in its `rationale`, separate from the obligation in `statement` or `ears`.
Record responsibilities, state ownership, required interactions, the chosen
requirement roles and why the leaves settle required behavior. State the decision's
origin, proposed or reviewed status, permitted implementation variation and what
would trigger refinement. This is the first trial representation, not a separate
architecture type or automatic architecture impact query.

Each allocated REQ identifies its responsibility and role in its own rationale,
referring to the owning requirement by its unambiguous title in the initial batch
or exact revision once published. Keep the shared architecture note in one place.
The selected RQS/DCP graph binds the exact requirements; `uses-interface` links bind
applicable exact ICD revisions. Record an ICD for a meaningful internal or external
contract, not for every helper. Do not hide necessary behavior only in rationale or
ICD prose: state each obligation in its own REQ.

Stakeholder roles describe needed outcomes; system roles define boundary behavior;
software high-level roles allocate behavior; low-level roles settle necessary
calculations, validation and state transitions. These roles are descriptive, not
extra `kind` values or a fixed tier count. A simple branch may already be precise
enough; another may need several levels. Shared rules remain shared requirements.
The source-free verification export includes the full REQ rationale and selected
ICDs, so author it without implementation excerpts or product-authored expectations.

Revise an architecture note through the normal owning REQ revision and applicable
review/change route. Assess affected allocations and contracts explicitly; prior
notes remain history. Review the note as design rationale, not blanket stakeholder
approval of every recorded choice. Keep exploratory choices provisional until their
necessity is justified for the selected formal scope.

For corrections and approved changes, inspect the exact prior review and approved change inputs to identify the correction scope. Use `predecessor` with the exact prior revision only for requirements whose claims change. Leave unchanged children and ancestors at their existing revisions. The CLI refreshes affected DCP endpoints, generates RQS selection and queues review. Author a DCP only when membership changes, using `predecessor` for its existing lineage. To retire a requirement, add `{ "type": "retires", "target": "<exact-selected-REQ-revision>" }` to the existing RQS candidate's links, retaining its predecessor and other guidance links. Its authored payload may be empty and its body should be empty. Revise surviving DCP membership to remove retired endpoints; the CLI omits groups whose parent is retired. Removing one parent link from a shared child does not retire it. Reinstatement is outside this package.

For independent review, use the assessments and exact DCP context exported by `mdlm review context <action> <exact-subject> --json`. Judge every child against that exact parent, and independently judge whether the children collectively cover the parent without gaps or contradictions. All children may be valid while the group needs new membership. Record revise-membership to request that correction. An unchanged child’s own exact group retains its prior review; a revised child triggers review of its group. No minimum number of edits applies.

After accepted product baseline, changes require an approved CHG. Its roots and derived descendants define scope; the current frontier defines what to edit now. Unrelated revisions require amended stakeholder approval. Keep the body empty when structured fields carry the claim.
