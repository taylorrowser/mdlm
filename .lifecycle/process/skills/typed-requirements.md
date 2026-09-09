---
id: typed-requirements
version: 1
---

# Author one normal-link requirement graph

Read the packet requirementGraphs projection for the selected exact requirements, ordinary links and leaf status. Write one REQ per statement in the Assignment's requirements batch. Stakeholder requirements use kind: stakeholder and statement for the user outcome or constraint. Software requirements use kind: software and ears for observable behavior. Give each a useful title and keep source or rationale when needed to explain intent. The CLI supplies ordinary identities and generates one RQS containing the complete selected graph. The set receives one independent Review; individual requirements need no extra authoring or review turns.

Author values identify repeated items with handles. For example, a stakeholder item uses `{slot: "requirements", handle: "need", payload: {title: "Keep tasks", kind: "stakeholder", statement: "Retain my task list"}, body: ""}`. A software item's `links` can include `{type: "decomposes", target: {output: "need"}}`. For an existing parent use `{datum: "<exact-REQ-revision>"}`. Omit generated RQS and SCP items from author values.

Link software requirements to exact parent REQ revisions using decomposes. Use the Assignment's batch-local handles for newly authored parents, and the exact supplied revisions for existing parents. Several parents and useful software levels are allowed. Software leaves are the low-level code contracts. Check that children collectively fulfill parent behavior, including interactions, state preservation and relevant failures. Every software path must reach a stakeholder requirement. Keep assumptions explicit and seek stakeholder clarification when they change acceptance.

Fill ears.pattern, system and response. Supply the complete subject in system and the response without a trailing period. Event requires event; state requires state; optional requires feature; unwanted requires unwanted. Ubiquitous has no guard. Complex combines at least two guards, with at most one event or unwanted guard. Split independently verifiable obligations when that clarifies the contract. Mechanical graph completeness does not establish behavioral completeness or appropriate detail.

For a correction or approved revision, use revision_of for an existing REQ lineage and update or reaffirm affected descendants in the same batch. Preserve old links and evidence. An unchanged child still pointing to an old parent is not a reaffirmation against the new parent. The CLI regenerates the complete RQS and later source scopes against the newly reviewed exact graph. Keep the body empty when structured fields carry the claim.
