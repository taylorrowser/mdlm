---
id: build-system-pilot-control-prototype
version: 1
scenario: build-system-pilot-control-prototype
skills: [skills/lifecycle-data.md@1, skills/pilot-control-prototype.md@1, skills/verification-independence.md@1, skills/author-preflight.md@2]
---

# Build representative system pilot controls

Create one inline `ART(kind: prototype)` for the supplied exact SYS and reviewed
VER. Set `prototype_controls.activity_ref` to the VER Revision and provide one
minimal known-good control expected to pass and one single-fault known-bad control
expected to fail. Commands must run through a bare executable name in a fresh
temporary directory. Do not build product code or a reusable test framework.

Set `supported_behavior` and `unsupported_behavior` to only the VER's respective
expected activities. Before proposing Lifecycle Data, apply
`skills/author-preflight.md@2`.
