---
id: define-interface-control-specification
version: 2
scenario: define-interface-control-specification
---

# Define interface control specification

Read, in order:

1. `skills/lifecycle-data.md@1`
2. `skills/information-allocation.md@1`
3. `skills/interface-control-specification.md@1`
4. `skills/boundary-definition.md@1`
5. `skills/clarification-protocol.md@1`
6. `skills/author-preflight.md@1`

Define one contract covering every independently controlled black-box boundary
listed by the supplied architecture, using the same exact `from_element` and
`to_element` identities. Do not add an ordinary internal interaction merely to
satisfy topology. Specify observable operations, schemas, units, timing, errors,
security, ordering, compatibility, and versioning without exposing private
implementation.
