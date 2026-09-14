---
id: implement-product
version: 6
skills:
- skills/product-quality.md@1
- skills/typed-requirements.md@5
- skills/verification-starter.md@2
- skills/source-trace.md@1
---

# Implement the tiny product

Apply the supplied shared product-quality skill before authoring or reviewing.

Implement the reviewed requirement set and a verification script in the same source commit. The script asserts observable stakeholder behavior, including relevant input, argument and file behavior. Use source inspection for commitments it answers directly, following the shared standard. Exit 0 means pass, 1 means assertion failure, and other exits mean execution error. Catch unexpected exceptions separately so they cannot look like assertion failures. Record repository_path as the absolute separate source checkout, source_commit, the product command argv and file_roles for every tracked entry, verification_script as its relative path, verification_command as argv, and verification_image as a digest-pinned Docker reference. The CLI runs the command in a clean snapshot of that commit mounted read-only at /workspace, with writable /tmp and no network. Use a prebuilt runtime image and keep all verification dependencies in that environment or the committed source. Apply the source-trace skill to production and verifier files; the CLI derives inventory and source scopes during submission.

Use the supplied direct proposal guidance and payload schema. The CLI supplies identities, exact required links and publication markers. Submit the authored values with mdlm proposal submit. Keep the body empty when the structured payload contains the whole claim.

Use a separate source Git checkout for product commits. Submit against the unchanged lifecycle snapshot from the guidance. Record the exact source checkout commit in source_commit.
