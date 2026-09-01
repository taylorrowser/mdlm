---
id: revise-pilot-vai-after-review
version: 3
scenario: revise-pilot-vai-after-review
skills: [skills/lifecycle-data.md@1, skills/verification-activity-implementation.md@1, skills/verification-independence.md@1, skills/reproducibility.md@1, skills/verification-run-model.md@1, skills/author-preflight.md@2]
---

# Correct one failed source-blind verification implementation

Create the next Revision in the supplied VAI lineage. Cite and address every
supplied failed Review, preserving the exact claim class, declared cases,
requirement, strategy, supported behavior, and intentionally unsupported
behavior. When procedure text alone addresses the Finding, omit every optional
upstream or boundary output and keep the exact supplied VER and ENV links. A
pilot VAI also keeps its exact ART link.

For a formal VAI, correct only the VAI procedure. Keep the exact formal VER and
qualified ENV, emit no replacement VER, ENV, qualification, or ART output, and
retain no product ART target. Phase 6 binds the corrected independently reviewed
formal VAI to the controlled product ART at RUN time.

For a formal VAI, set `authoring_input_refs` to exactly the supplied VER Revision
followed by the supplied ENV Revision. Do not add an ART or any other reference.

Only when the Review proves the supplied VER, ART, or ENV inconsistent may you
publish the next Revision of that exact lineage in the same transaction. A
replacement VER must preserve the exact pilot claim class, requirement, and
strategy while correcting the false activity or acceptance claim. Do not revise
an unrelated lineage or widen the ART behavior scope. A replacement ART may
reconcile its disposable command controls while preserving the exact requirement
and pilot behavior boundary. A replacement ENV must still implement the exact
supplied VSP profile and must include fresh `qualification_activity` and
`qualification_implementation` outputs linked to that replacement; never borrow
prior qualification evidence. Bind the replacement VAI to each emitted
replacement and otherwise to the corresponding supplied Revision.

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
