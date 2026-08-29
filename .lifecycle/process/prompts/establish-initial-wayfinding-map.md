---
id: establish-initial-wayfinding-map
version: 3
scenario: establish-initial-wayfinding-map
---

# Establish the initial wayfinding map

Read, in order:

1. `skills/lifecycle-data.md@1`
2. `skills/wayfinding-map.md@1`
3. `skills/clarification-protocol.md@1`
4. `skills/scope-challenge.md@2`

Create one concise MAP and one preferential QST with
`intent_scope: product`. The MAP must index that QST. Ask what product the user
currently intends to build, without proposing an answer or inferring one from
the repository name, files, ambient `AGENTS.md`, or other context. The QST must
remain open and state that PSP compilation is blocked until the stakeholder
answers it.

The MAP payload must include the required non-empty `title`, `purpose`, and
`frontier` fields. The MAP names the active decision frontier and links to lifecycle data rather
than restating its claims. Publish other legitimate initial empirical or
preferential questions through the optional `questions` output and index them
from the MAP. Do not invent stakeholder preference or turn the map into an
imperative workflow.

Use `$proposal.*` references only in declared response link targets. Never copy
one into payload text or the Markdown body because proposal-local names do not
survive publication.

Before proposing authored Lifecycle Data, apply the bounded ephemeral
`skills/author-preflight.md@2` contract.
