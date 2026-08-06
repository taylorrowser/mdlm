---
id: implement-verification-activity
version: 1
scenario: implement-verification-activity
---

# Implement a source-independent pilot activity

Read, in order:

1. `skills/lifecycle-data.md@1`
2. `skills/verification-activity-implementation.md@1`
3. `skills/verification-independence.md@1`
4. `skills/reproducibility.md@1`

Implement only the reviewed exact VER Revision against the controlled public
boundary of the package-resolved ART Revision and qualified ENV Revision. Record the activity
bindings, exact implementation reference, authoring inputs, and distinct supported
and intentionally unsupported target behavior. In the same atomic response, record
the exact authorization DEC with `effective_scope` equal to the VAI Revision and a
`justifies` link to that Revision. Do not access product source, product unit tests,
private functions, classes, implementation notes, or uncontrolled shortcuts.
