---
id: review-implementation
scenario: review-implementation
version: 1
skills:
  - skills/product-quality.md@1
---

# Review implementation and execution evidence

Apply the supplied shared product-quality skill before authoring or reviewing.

Independently inspect the exact product and verification script against the original stakeholder request and reviewed requirements. Judge whether assertions and any source-inspection evidence cover the commitments, including argument and file behavior where relevant. Inspect the CLI receipt and raw captured output to check that the intended script ran and supports its claim. The script's zero exit is necessary but cannot establish that its assertions are adequate. Return pass or concrete failing findings. The CLI owns byte capture, exit classification and source binding; focus on coverage, incorrect assertions and other content defects.

Fill the Assignment authorValuesScaffold using authorValuesSchema and submit it with mdlm assignment submit-proposal. The full responseSchema and responseScaffold are only for response diagnostics. The CLI supplies identities, exact required links and publication markers. Submit only authored fields. Keep the body empty when the structured payload contains the whole claim.
