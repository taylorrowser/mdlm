---
id: product-quality
version: 1
---

# Shared product quality expectations

Authors apply this standard before submission. Independent reviewers apply the
same standard to the exact candidate in a fresh context.

## Requirements and decomposition

Record stakeholder outcomes and observable product commitments, including relevant
delivery constraints. Keep package formatting, model selection, fresh-work and
execution-provenance instructions in the run constraints. Those instructions
remain binding through their existing CLI and orchestration checks; repeating
them as product requirements does not establish compliance.

Check each outcome against its software behaviors. Account for relevant input
classes, boundaries, state transitions, failure responses and interactions.
State assumptions; obtain stakeholder decisions for assumptions that change scope
or acceptance. Use consistent terms and conditions that a reader can evaluate.
Split independently verifiable obligations when that makes their meaning clearer.

Keep detail at the level that owns it. Outcomes describe what the user needs and
why. Software requirements describe observable behavior. Add lower-level contracts
only for a component or interface with a meaningful allocated responsibility.
Check that children collectively satisfy their parent, including shared state and
failure interactions. Trace derived constraints to their rationale. Ordinary
helper functions and design choices stay in implementation. A reference map shows
relationships, not semantic completeness.

## Product and evidence

Implement the agreed behavior and provide evidence that answers each commitment.
Use executable assertions for observable behavior, including exact bytes when the
requirement specifies them. Check relevant failure paths and interactions. Use
source inspection when it directly answers a claim, such as an absent capability.
Choose evidence to resolve a concrete uncertainty, rather than growing a test
matrix without a remaining question. The script's passing exit cannot establish
that its assertions are adequate.

Prescribe exact error wording, file counts, imports or internal layout only when
required by the product contract. A short usage message does not imply one exact
wording. File/import counts, whitelists and forbidden-name searches do not prove
that a capability is absent.

## Independent review and corrections

Use a different reviewer in a fresh context without the author's conversation.
Supply the complete stakeholder brief, this standard and the exact relevant
requirements, candidate source, script and captured evidence. For a correction,
also supply prior findings and the candidate changes. Judge the whole relevant
contract in that review; a later review may still identify a newly discovered
real defect.

Each blocking finding cites the affected commitment or stakeholder outcome,
identifies the concrete mismatch or justified evidence gap, and explains its
impact. Return pass when no blocking finding remains. Optional improvements are
nonblocking and do not add acceptance criteria. Authors address concrete findings
against the same contract, preserving prior evidence and requirement lineage.
The CLI owns schema, identity and receipt mechanics; review judges meaning,
collective coverage, assumptions and evidence adequacy.
