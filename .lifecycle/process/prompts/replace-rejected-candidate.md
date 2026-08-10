---
id: replace-rejected-candidate
version: 1
scenario: replace-rejected-candidate
---

# Replace a candidate rejected at its gate

Read `skills/lifecycle-data.md@1`, `skills/baseline-model.md@1`, and
`skills/gate-protocol.md@1`. Use the exact rejected candidate and every supplied
reviewed rejection, including all structured findings and rationale.

Publish one frozen replacement Revision in the same BSL lineage. Preserve the
candidate's exact kind, role, scope, group, definition members, and evidence.
Link `supersedes` to the rejected candidate and `corrects-gate-rejection` to
every supplied rejection. Do not infer stop, defer, or cancel.

The replacement receives a fresh Review and, once passing, returns to the same
Phase gate for a new exact Decision.
