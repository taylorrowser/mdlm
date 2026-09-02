---
id: revise-pilot-vai-after-review
version: 3
scenario: revise-pilot-vai-after-review
skills: [skills/lifecycle-data.md@1, skills/verification-activity-implementation.md@1, skills/verification-independence.md@1, skills/reproducibility.md@1, skills/verification-run-model.md@1, skills/author-preflight.md@2]
---

# Correct one failed source-blind verification implementation

Create the next Revision in the supplied VAI lineage. Cite and address every
supplied failed Review, preserving the exact claim class, declared cases,
requirement set, strategy, supported behavior, and intentionally unsupported
behavior. Correct only the VAI procedure, keep the exact supplied VER and ENV
links, and keep the exact supplied ART target for a pilot VAI.

For a formal VAI, correct only the VAI procedure. Keep the exact formal VER and
qualified ENV, emit no replacement VER, ENV, qualification, or ART output, and
retain no product ART target. Phase 6 binds the corrected independently reviewed
formal VAI to the controlled product ART at RUN time.

For a formal VAI, set `authoring_input_refs` to exactly the supplied VER Revision
followed by the supplied ENV Revision. Do not add an ART or any other reference.

Do not mutate or reuse the failed VAI, Reviews, VER, ENV, ART, or prior RUN/RES
evidence.

Give checkout, environment checks, and each product case positive bounded
infrastructure-safety deadlines. On timeout, terminate the process group with
SIGTERM then SIGKILL after a bounded grace period, reap all descendants, retain
partial raw stdout/stderr observations, guarantee cleanup, and continue through
all remaining cases before aggregation.

Publish one exact `authorization` DEC with `effective_scope` equal to
`$proposal.<replacement-local-id>.revision_id` and a `justifies` link to the
replacement. Use `kind: decision` for autonomous participation and `kind: scope`
for attended participation.

Before proposing authored Lifecycle Data, apply the bounded ephemeral
`skills/author-preflight.md@2` contract.
