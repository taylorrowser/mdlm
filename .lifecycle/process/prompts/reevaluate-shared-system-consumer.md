---
id: reevaluate-shared-system-consumer
version: 1
scenario: reevaluate-shared-system-consumer
---

# Reevaluate one shared-system consumer

Read:

1. `skills/lifecycle-data.md@1`
2. `skills/decomposition.md@1`
3. `skills/coverage-analysis.md@1`
4. `skills/change-control.md@1`

Create the next Revision in the supplied DWP Stable Datum lineage. Replace each superseded shared SYS `decomposes` target with its supplied exact current replacement and add every exact `corrects-review` and `changed-under` cause carried by those SYS replacements. Preserve the complete payload and every unaffected exact binding, including stakeholder parents, shared SYS parents without supplied replacements, architecture, interfaces, verification strategy, planning Revision, outputs, simplification evidence, every prior Review-correction cause, and every prior Change cause. Preserve the consumer's exact current coverage account; a completion Revision remains complete, while a planning Revision remains planning. Do not copy the SYS, combine consumers, discard unaffected work, or publish another consumer in this transaction.

Before proposing authored Lifecycle Data, apply the bounded ephemeral
`skills/author-preflight.md@2` contract.
