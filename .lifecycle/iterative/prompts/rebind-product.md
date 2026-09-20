---
id: rebind-product
version: 13
skills:
- skills/product-quality.md@2
- skills/typed-requirements.md@7
- skills/source-trace.md@5
---

# Bind the product to the current requirements

Apply the supplied shared product-quality skill before authoring or reviewing.

Publish a new revision in the same IMP lineage linked to the reviewed current RQS graph. Reuse the previous product source commit and file_roles when the product is unchanged. Select independent VFY revisions through verification links. Revise the product or independent activity in its own repository when the requirements require it, and record each exact commit. Fresh CLI verification and independent implementation Review follow. The CLI supplies exact links, lineage and publication marker, and regenerates source scopes against the selected exact requirements.

For an approved change, run `mdlm review context <action> <exact-subject> --json` using this guidance's exact action and subject. In `requirementGraphs[]`, select the graph whose `selection` matches the sole revised RQS in `inputs.requirements`. Copy that graph's `assessment.sourceScopes` into `impact_dispositions[].source_scope`, one row per exact baseline revision and no extra rows. An empty list means `impact_dispositions: []`. Select by identity, not array position.

The broader prospective impact list and inspected source include responsibilities whose requirements may remain unchanged; they are inspection evidence, not the disposition row set. Judge each required row's disposition, candidate mapping and rationale from the actual change, and preserve complete production attribution even when no disposition rows are required.

For approved implementation-only maintenance, the CLI may reuse a valid prior requirements PASS from the same selection lineage. Its exact REQ and DCP revisions must match both the accepted baseline named by this change and the current selection. A changed requirement or decomposition requires fresh requirements review. Reuse publishes no replacement review and does not reuse implementation review, execution evidence or stakeholder acceptance. Publish the changed source and complete attribution; fresh CLI verification, independent implementation review and acceptance still follow.
