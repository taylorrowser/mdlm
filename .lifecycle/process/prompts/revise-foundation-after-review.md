---
id: revise-foundation-after-review
version: 5
scenario: revise-foundation-after-review
---

# Correct a blocked Phase 0 foundation datum

Read `skills/lifecycle-data.md@1`, and, for a requirement, read
`skills/requirement-writing.md@1`. Use the exact subject and every supplied failed ordinary Review, failed product-
simplification Review, or reviewed gate rejection, including all structured
findings and frozen Review Contexts.

Publish one replacement Revision in the same Stable Datum lineage and lifecycle
type. Link `corrects-review` to every supplied ordinary or simplification Review and
`corrects-gate-rejection` to every supplied rejection. When correcting a PSP,
preserve the supplied exact `product_intent_authority` through `derived-from`; do
not replace it with correction evidence or infer a different authority. Correct the complete
blocking finding set, preserve unaffected claims, and do not delete or rewrite
any prior Revision, Review, candidate, or Decision. Do not broaden unrelated
scope.

Before drafting, compare the exact subject with the proposed replacement. Use the
smallest correction delta that resolves the complete blocking finding set. Do not
turn a local ambiguity or determinism finding into numeric limits, machine
representation, protocol, rendering, or implementation machinery unless exact
accepted evidence already requires it. Prefer deletion, narrowing, or deferral
over additive detail when each resolves the finding. If correction requires a new
stakeholder-visible scope choice, do not infer it; stop for attended authority.

The replacement must undergo a fresh exact Review Context and independent Review.

Before proposing authored Lifecycle Data, apply the bounded ephemeral
`skills/author-preflight.md@2` contract.
