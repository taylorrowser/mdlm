---
id: revise-requirements
scenario: revise-requirements
version: 4
skills:
- skills/product-quality.md@1
- skills/typed-requirements.md@4
- skills/source-trace.md@1
---

# Revise the accepted requirement graph

Apply the stakeholder's approved change to the exact accepted RQS supplied by this Assignment. Capture the predicted production and verifier inspection set before editing product code. In one batch, revise changed REQs and explicitly reaffirm affected descendants against their selected parent revisions. Use revision_of for existing lineages and normal decomposes links for the new graph. Preserve unchanged wording when justified, while inspecting its continued meaning under the changed parent.

The CLI creates a new same-lineage RQS with the complete graph. It does not replay accepted Assignments or rewrite prior evidence. One independent requirement Review follows, then bind the existing IMP lineage to the reviewed graph, inspect the predicted locations, make necessary product changes and run fresh verification. Compare the prediction with actual inspected or changed locations, recording omissions and overly broad attributions.

Fill the Assignment authorValuesScaffold using authorValuesSchema and submit it with mdlm assignment submit-proposal. Submit only authored REQ fields and links; the CLI generates grouping and source-scope data. Keep the body empty when structured fields carry the claim.
