---
id: implement-product
scenario: implement-product
version: 1
skills:
- skills/product-quality.md@1
- skills/typed-requirements.md@1
- skills/verification-starter.md@1
---

# Implement the tiny product

Apply the supplied shared product-quality skill before authoring or reviewing.

Implement the reviewed requirement set and a verification script in the same source commit. The script asserts observable stakeholder behavior, including relevant input, argument and file behavior. Use source inspection for commitments it answers directly, following the shared standard. Exit 0 means pass, 1 means assertion failure, and other exits mean execution error. Catch unexpected exceptions separately so they cannot look like assertion failures. Record repository_path as the absolute separate source checkout, source_commit, the product command argv and product_files, verification_script as its relative path, verification_command as argv, and verification_image as a digest-pinned Docker reference. The CLI runs the command in a clean snapshot of that commit mounted read-only at /workspace, with writable /tmp and no network. Use a prebuilt runtime image and keep all verification dependencies in that environment or the committed source.

Fill the Assignment authorValuesScaffold using authorValuesSchema and submit it with mdlm assignment submit-proposal. The full responseSchema and responseScaffold are only for response diagnostics. The CLI supplies identities, exact required links and publication markers. Submit only authored fields. Keep the body empty when the structured payload contains the whole claim.

Use a separate source Git checkout for product commits. The lifecycle repository HEAD must remain unchanged while its Assignment is open. Record the exact source checkout commit in source_commit.
