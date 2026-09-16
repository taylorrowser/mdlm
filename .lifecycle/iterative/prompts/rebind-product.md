---
id: rebind-product
version: 10
skills:
- skills/product-quality.md@1
- skills/typed-requirements.md@5
- skills/source-trace.md@5
---

# Bind the product to the current requirements

Apply the supplied shared product-quality skill before authoring or reviewing.

Publish a new revision in the same IMP lineage linked to the reviewed current RQS graph. Reuse the previous product source commit and file_roles when the product is unchanged. Select independent VFY revisions through verification links. Revise the product or independent activity in its own repository when the requirements require it, and record each exact commit. Fresh CLI verification and independent implementation Review follow. The CLI supplies exact links, lineage and publication marker, and regenerates source scopes against the selected exact requirements.

For approved implementation-only maintenance, the CLI may reuse a valid prior requirements PASS from the same selection lineage. Its exact REQ and DCP revisions must match both the accepted baseline named by this change and the current selection. A changed requirement or decomposition requires fresh requirements review. Reuse publishes no replacement review and does not reuse implementation review, execution evidence or stakeholder acceptance. Publish the changed source and complete attribution; fresh CLI verification, independent implementation review and acceptance still follow.
