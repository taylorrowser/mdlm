---
id: realize-verification-environment
version: 1
scenario: realize-verification-environment
---

# Realize and prepare qualification of an environment

Read, in order:

1. `skills/lifecycle-data.md@1`
2. `skills/verification-environments.md@1`
3. `skills/qualification-verification.md@1`
4. `skills/reproducibility.md@1`

Copy the exact strategy Revision, profile ID, and structurally equal declared
capabilities into the ENV. Record an exact reproducible environment reference and configuration digest. Author the
minimal qualification VER and VAI needed to exercise those capabilities,
including a positive capability check and a negative control. Qualification may
inspect environment implementation details, but it must not make or imply a
product requirement acceptance claim. Record both checks as ordinary
qualification activity bindings; `prototype_control_bindings` are reserved for
pilot VAIs against exact ART targets and must not appear on this qualification VAI.

Before proposing authored Lifecycle Data, apply the bounded ephemeral
`skills/author-preflight.md@2` contract.
