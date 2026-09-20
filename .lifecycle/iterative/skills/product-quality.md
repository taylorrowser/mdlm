---
id: product-quality
version: 3
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

### Author checklist

- Give each requirement one subject and one obligation under defined conditions.
  Split outcomes with independent reasons to change, responsibility owners or
  acceptance decisions. Conditions and branches of one function or state transition
  can form one coherent obligation, including preservation of unaffected state.
  Arithmetic correctness and serialization of concurrent updates are separate
  duties: either can fail while the other holds. A table row alone is not a reason
  to split; define its domain, boundaries and precedence so the table settles one
  function. A saved/rejected/unconfirmed response table may be one obligation;
  local rejection without sending and eventual settlement after silence are
  separate decisions. Parents may integrate distinct duties allocated to children.
- Justify each obligation by stakeholder intent, a parent or a derived need with
  its origin and upstream consequences. Prototype behavior alone is insufficient.
  Never copy code into prose. Express necessary semantics through precise text,
  equations, decision tables or state transitions.
- Settle relevant inputs, outputs, units, numeric rules, ordering, state changes,
  boundaries and failures at the level that owns them. Distinguish permitted
  variation from an unresolved decision. A small scope can need many short REQs.
- Use meaningful depth until an implementer and verifier can determine required
  behavior without inventing a product decision. Record the per-system architecture
  and depth rationale as described in typed-requirements. Keep decomposition,
  allocation and interface agreements distinct; reuse shared children by reference.
- Plan verification for every obligation, including retained parents and relevant
  interactions. Identify intended actions and expected results from the definition.
  Shared cases and scripts may cover several requirements.
- Account for every authored product responsibility through meaningful source
  regions linked to implementation-ready leaves. Explain build, configuration,
  dependency and generated-source treatment under source-trace, distinguishing
  mandatory behavior from justified support and permitted implementation choices.

### Reviewer checklist

- Can I state each requirement's one obligation and a concrete violation? For
  bundled outcomes, name the separate obligations and the decision their combination
  obscures. Sentence length and conjunction counts are not the criterion.
- Is each constraint necessary and authorized? Challenge prototype habits and
  convenient implementation choices presented as stakeholder needs.
- Could two readers derive materially different required outcomes from the same
  definition? Give a counterexample, then request the missing rule or confirm that
  the difference is permitted. Do not impose a language or algorithm without need.
- Does the architecture/depth rationale fit each system? Do the leaves settle the
  required behavior, and do the children collectively satisfy every parent,
  including shared state, failures and cross-component interactions?
- Does verification establish the complete obligation at its claimed boundary,
  with independent expectations and reproducible evidence? Component checks alone
  cannot establish a website/API workflow. Passing child cases alone cannot
  establish their integrated parent.
- Does source attribution explain all authored responsibilities without hiding
  unrelated behavior in broad regions? Trace links show responsibility; source-aware
  review and verification establish conformance.

For example, preserving saved state after rejection, returning a rejection reason
and retaining editable browser input are three obligations. In contrast,
`rank = 1 + count(players with strictly lower totals)` defines one ranking rule,
including ties. Review these checks within the existing set-level transaction;
there is no extra authoring, review or test transaction per requirement.

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
