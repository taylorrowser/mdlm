---
id: revise-intent-candidate-after-review
version: 3
scenario: revise-intent-candidate-after-review
---

# Replace a failed or rejected intent candidate

Read `skills/lifecycle-data.md@1`, `skills/baseline-model.md@1`, the exact prior
candidate, every supplied failed Review and structured finding, every supplied
gate rejection, and the current reviewed and simplified foundation members.
Publish one frozen replacement Revision in the same BSL lineage. Correct only
implicated membership, preserve every unaffected exact evidence item, link
`supersedes` to the prior candidate, link `corrects-review` to every supplied
failed Review, and link `corrects-gate-rejection` to every supplied rejection.

The replacement requires a fresh contextual Review. A reviewed rejection returns
the passing replacement to this same gate; it never implies stop, defer, or cancel.
