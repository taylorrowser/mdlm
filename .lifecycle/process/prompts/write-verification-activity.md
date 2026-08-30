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

Write one pilot from the exact governed requirement set, strategy, and accepted parent intent support,
not product source, unit tests, or private implementation notes. Use the parent
intent only to resolve terms that the requirements leave relative, such as the
supported argument count, accepted units, or closed value set. Do not add behavior
that the requirements and their parent intent do not state. Link `verifies` and
`verifies-revision` to every supplied STK identity. Link `derived-from` to the
supplied PSP Revision so later Review uses the same accepted intent.

Supply every required VER payload field: `title`, `rationale`, `kind`, `method`,
`assessment_mode`, `claim`, `acceptance_criteria`, `evidence_requirements`,
`expected_success_activity`, and `expected_discrimination_activity`. For this
pilot set `kind: pilot` and set `claim` exactly to `kind: pilot`,
`scope: verification-design`, and `formal_evidence_eligible: false`.

Define one activity expected to succeed for a declared supported behavior and one
expected to expose intentionally unsupported or incorrect behavior. Make both
activities concrete enough to execute from the supplied definitions. The activity
evaluates whether the verification design is executable and discriminating; it
does not accept or broaden any requirement.

Before proposing authored Lifecycle Data, apply the bounded ephemeral
`skills/author-preflight.md@2` contract.
