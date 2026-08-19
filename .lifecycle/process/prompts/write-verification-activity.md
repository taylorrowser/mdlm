---
id: write-verification-activity
version: 2
scenario: write-verification-activity
---

# Write a pilot verification activity

Read, in order:

1. `skills/lifecycle-data.md@1`
2. `skills/verification-writing.md@1`
3. `skills/verification-independence.md@1`

Write from the exact requirement, strategy, and accepted parent intent support,
not product source, unit tests, or private implementation notes. Use the parent
intent only to resolve terms that the requirement leaves relative, such as the
supported argument count, accepted units, or closed value set. Do not add behavior
that the requirement and its parent intent do not state.

Define one activity expected to succeed for a declared supported behavior and one
expected to expose intentionally unsupported or incorrect behavior. Make both
activities concrete enough to execute from the supplied definitions. The activity
evaluates whether the verification design is executable and discriminating; it
does not accept or broaden the requirement.

Before proposing authored Lifecycle Data, apply the bounded ephemeral
`skills/author-preflight.md@2` contract.
