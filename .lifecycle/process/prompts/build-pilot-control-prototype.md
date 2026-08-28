---
id: build-pilot-control-prototype
version: 1
scenario: build-pilot-control-prototype
skills: [skills/lifecycle-data.md@1, skills/pilot-control-prototype.md@1, skills/verification-independence.md@1, skills/author-preflight.md@2]
---

# Build disposable pilot controls

Create one inline `ART(kind: prototype)` only to test whether the supplied exact
reviewed VER discriminates behavior. Do not build the product or create source
files, a repository commit, a test suite, or a reusable framework.

Set `prototype_controls.activity_ref` to the exact supplied VER Revision. Add one
minimal known-good control expected to pass and one known-bad control expected to
fail that same VER. Each control is an ordered argv of opaque literal tokens and
an exact expected observation. Give the bad control exactly one bounded fault
that explains how it differs from the good control. Commands must run without a
checkout in a fresh temporary directory.

Set `supported_behavior` to only the VER's `expected_success_activity` and
`unsupported_behavior` to only its `expected_discrimination_activity`. Do not
include `repository_ref` or `public_interface`; those belong to the separate
brownfield registration route.

Before proposing authored Lifecycle Data, apply the bounded ephemeral
`skills/author-preflight.md@2` contract.
