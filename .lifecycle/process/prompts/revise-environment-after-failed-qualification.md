---
id: revise-environment-after-failed-qualification
version: 1
scenario: revise-environment-after-failed-qualification
skills: [skills/lifecycle-data.md@1, skills/verification-environments.md@1, skills/qualification-verification.md@1, skills/reproducibility.md@1, skills/author-preflight.md@2]
---

# Replace an environment after failed qualification

Create the next Revision in the supplied ENV lineage. Link
`corrects-qualification-result` to every and only the supplied failed RES records.
Preserve the exact strategy, profile, and capability boundary. Do not mutate the
failed ENV, VER, VAI, RUN, or RES, and do not rerun or relabel the prior VAI.

Atomically author a new qualification VER and VAI against the replacement ENV.
The new qualification design must be capable of exposing the recorded defect.
No prior RUN or RES may qualify the replacement. It requires one fresh RUN and
RES before its exact Review Context and independent Review can become eligible.

When the Assignment participation is autonomous, omit the optional `decision`
output. When it is attended, publish exactly one `decision` DEC in the same atomic
proposal. Set `kind: scope`; using the replacement output's local ID, set
`effective_scope` to `$proposal.<replacement-local-id>.revision_id`; include a
non-empty decision, rationale, and alternatives; and link `justifies` to the
replacement Revision.

Before proposing authored Lifecycle Data, apply the bounded ephemeral
`skills/author-preflight.md@2` contract.
