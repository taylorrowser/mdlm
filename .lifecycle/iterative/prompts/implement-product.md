---
id: implement-product
version: 26
skills:
- skills/product-quality.md@8
- skills/typed-requirements.md@17
- skills/source-trace.md@9
---

# Implement the reviewed product

Implement the reviewed requirements in a separate source Git repository. Record its exact source_commit, repository_path, public command and honest file_roles. Plan and publish the independent VFY activities first, with `plan-verification`; the IMP cannot be published without selecting them through verification links, and each selected activity must verify exact requirement revisions in the current RQS. The product author may write development tests, but those tests do not replace the independent requirement-verification activities.

Use source-trace guidance for production attribution. When levels are used, attribute a component's behavior code to its low-level leaves where they exist and to its high-level leaf otherwise. The CLI derives inventory and source scopes. Verification code belongs to its separately committed verification repository and needs no in-product source annotations. Keep the lifecycle snapshot unchanged while committing source in the separate checkout, then submit using the exact guidance.

The independent verifier works from requirements and public interface contracts. Supply only the public invocation or deployment details needed to exercise this product. Preserve any failure and distinguish a wrong product from a wrong requirement or oracle before editing.
