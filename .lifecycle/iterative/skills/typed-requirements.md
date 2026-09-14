---
id: typed-requirements
version: 5
---

# Author one normal-link requirement graph

Read the exact input records in guidance.context. For an existing RQS, follow its contains and decomposition links with `mdlm show <exact-revision> --json` to inspect REQs and DCPs. A software leaf is a selected software requirement with no selected child group. Write one REQ per statement in the direct requirements batch. Stakeholder requirements use kind: stakeholder and statement for the user outcome or constraint. Software requirements use kind: software and ears for observable behavior. Give each a useful title and keep source or rationale when needed to explain intent. The CLI supplies ordinary identities and generates one RQS containing the complete selected graph. The set receives one independent Review; individual requirements need no extra authoring or review turns.

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

Shared success and failure constraints must retain the functional behavior in the leaves. For example, decomposing add-task only into successful exit and invalid-input rejection loses creation of an incomplete task, next-ID assignment, exact-title persistence and ID output. Keep the complete add behavior as a software leaf when further decomposition is not useful, or give its children those remaining obligations alongside the shared constraints. Authors and reviewers check that terminal descendants collectively retain the parent behavior and that linked leaves explain a source region's actual work. A path to an ancestor cannot replace a missing leaf obligation.

Fill ears.pattern, system and response. Supply the complete subject in system and the response without a trailing period. Event requires event; state requires state; optional requires feature; unwanted requires unwanted. Ubiquitous has no guard. Complex combines at least two guards, with at most one event or unwanted guard. When the source already states an implementable, verifiable contract, preserve its operative wording while fitting the EARS fields instead of summarizing it. Carry relevant parent constraints into the software contract. Keep it as a software leaf with a normal link to its stakeholder parent; add intermediate requirements only when they allocate a useful responsibility. Split obligations when that clarifies their meaning. Mechanical graph completeness does not establish behavioral completeness or appropriate detail.

For corrections and approved changes, inspect the exact prior review and approved change inputs to identify the correction scope. Use `predecessor` with the exact prior revision only for requirements whose claims change. Leave unchanged children and ancestors at their existing revisions. The CLI refreshes affected DCP endpoints, generates RQS selection and queues review. Author a DCP only when membership changes, using `predecessor` for its existing lineage. To retire a requirement, add `{ "type": "retires", "target": "<exact-selected-REQ-revision>" }` to the existing RQS candidate's links, retaining its predecessor and other guidance links. Its authored payload may be empty and its body should be empty. Revise surviving DCP membership to remove retired endpoints; the CLI omits groups whose parent is retired. Removing one parent link from a shared child does not retire it. Reinstatement is outside this package.

For independent review, use the assessments and exact DCP context exported by `mdlm review context <action> <exact-subject> --json`. Judge every child against that exact parent, and independently judge whether the children collectively cover the parent without gaps or contradictions. All children may be valid while the group needs new membership. Record revise-membership to request that correction. An unchanged child’s own exact group retains its prior review; a revised child triggers review of its group. No minimum number of edits applies.

After accepted product baseline, changes require an approved CHG. Its roots and derived descendants define scope; the current frontier defines what to edit now. Unrelated revisions require amended stakeholder approval. Keep the body empty when structured fields carry the claim.
