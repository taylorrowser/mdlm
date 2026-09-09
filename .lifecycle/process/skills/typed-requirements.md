---
id: typed-requirements
version: 1
---

# Author typed requirements and declared evidence

Use the emitted author schema. REQ keeps one requirement set: outcomes state stakeholder results; commitments state software behavior or allocated contracts. Give each outcome and commitment a short local ID. Each commitment cites outcome_ids. Every outcome needs a software commitment. Software commitments have empty parent_ids. Use allocated commitments only for meaningful component/interface responsibilities, with allocation and parent_ids. Check that children collectively fulfill their parents, including interactions and relevant failures. Keep assumptions explicit and seek stakeholder clarification when they change acceptance.

Fill ears.pattern, system and response. Supply the complete subject in system and the response without a trailing period. Event requires event; state requires state; optional requires feature; unwanted requires unwanted. Ubiquitous has no guard. Complex combines at least two guards, with at most one event or unwanted guard. The CLI renders the sentence. Split independently verifiable obligations when that makes the contract clearer. Requirement completeness and level of detail remain content judgments.

IMP verification_coverage names commitment_id, method (test or inspection), repository-relative file and locator. Map every commitment, including parent commitments, against the exact implements REQ revision. A locator can name the relevant case, function or inspection region. Several commitments may share a case; a commitment may have several rows. The mapping declares evidence, it does not establish that the assertions prove the requirement.

Use `mdlm show <exact-revision> --json` to read projections.views, or omit --json for readable outcome, commitment and evidence rows. The Assignment schemas expose the same collection rules and view fields. Keep the datum body empty when the structured fields carry the claim.
