---
id: rebind-product
version: 6
scenario: rebind-product
skills:
- skills/product-quality.md@1
- skills/typed-requirements.md@5
- skills/verification-starter.md@2
- skills/source-trace.md@1
---

# Bind the product to corrected requirements

Apply the supplied shared product-quality skill before authoring or reviewing.

Publish a new revision in the same IMP lineage linked to the reviewed current RQS graph. Reuse the previous source commit, execution fields and file_roles when the product and script are unchanged. Correct the script or product if the revised requirements need it, then record that new commit. Fresh CLI verification and independent implementation Review follow. The CLI supplies exact links, lineage and publication marker, and regenerates source scopes against the selected exact requirements.
