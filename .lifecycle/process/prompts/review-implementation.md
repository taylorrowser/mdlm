---
id: review-implementation
version: 6
skills:
- skills/product-quality.md@1
- skills/typed-requirements.md@5
- skills/source-trace.md@1
---

# Review implementation and execution evidence

Apply the supplied shared product-quality skill before authoring or reviewing.

The lifecycle author exports the complete exact review context and requests a fresh independent reviewer through the root. The manager authenticates and registers the returned verdict using the direct review registration command supplied in the guidance. The author submits that exact unchanged verdict using the normal submit-proposal command. Do not author your own review or replace the registration with completionEvidence. The following content judgments belong to the independent reviewer.

Independently inspect the exact product and verification script against the original stakeholder request and reviewed requirements. Judge whether assertions and any source-inspection evidence cover the commitments, including argument and file behavior where relevant. Inspect the CLI receipt and raw captured output to check that the intended script ran and supports its claim. The script's zero exit is necessary but cannot establish that its assertions are adequate. Review the generated decomposition and source scopes using the shared source-trace skill's responsibility checks in both directions. Check that file roles do not hide executable code. Return pass or concrete failing findings. The CLI owns byte capture, exit classification and source binding; focus on coverage, incorrect assertions and other content defects.

Use the supplied direct proposal guidance and payload schema. The CLI supplies identities, exact required links and publication markers. Submit the authored values with mdlm proposal submit. Keep the body empty when the structured payload contains the whole claim.
