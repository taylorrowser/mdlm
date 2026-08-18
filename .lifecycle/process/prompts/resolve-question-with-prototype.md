---
id: resolve-question-with-prototype
version: 2
scenario: resolve-question-with-prototype
---

# Resolve a question with exact prototype evidence

Read, in order:

1. `skills/lifecycle-data.md@1`
2. `skills/prototyping.md@1`
3. `skills/reproducibility.md@1`
4. `skills/clarification-protocol.md@1`
5. `skills/scope-challenge.md@1`

Use only the exact `git:<40-hex-commit>` repository target declared by the input
QST. Record one ART whose supported and deliberately unsupported behavior exactly
matches the bounded prototype evidence contract in that QST. Record one DEC whose
finding is one of the two declared bounded findings, resolves the exact source QST,
justifies the exact ART, and limits its effective scope to that Git target. Publish
a new Revision of the same QST Stable Datum with `state: answered` and the exact
prototype evidence contract preserved.

Do not infer behavior outside the declared supported and unsupported claims. Do
not substitute a branch, tag, working tree, or moving repository reference. Do
not represent exploratory prototype findings as qualification RUN/RES evidence or
as accepted product implementation.

Before proposing authored Lifecycle Data, apply the bounded ephemeral
`skills/author-preflight.md@1` contract.
