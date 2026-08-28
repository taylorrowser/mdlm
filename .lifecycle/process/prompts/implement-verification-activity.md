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
and intentionally unsupported target behavior. For a repository-backed ART,
bind every exact normal, raw-malformed, omitted-argument, and extra-argument case,
instantiating its ordered command matrix without collapsing an omitted marker
into a supplied empty token or dropping repeated command tokens.

When the ART supplies `prototype_controls`, bind the exact known-good and
known-bad argv without rewriting either command. Apply the same reviewed VER to
both. The known-good control must be expected to pass, and the one-fault
known-bad control must be expected to fail. Record both exact bindings in
`prototype_control_bindings`.

Define bounded checkout, environment-check, and per-product-case deadlines as
infrastructure-safety limits rather than product timing claims. On timeout,
terminate the process group, force termination after a bounded grace period, reap
all descendants, retain partial raw observation, guarantee cleanup, and continue
through every remaining case before aggregation.

In the same atomic response, record the exact authorization DEC with
`effective_scope` equal to the VAI Revision and a `justifies` link to that Revision.
Do not access product source, product unit tests, private functions, classes,
implementation notes, or uncontrolled shortcuts.

Before proposing authored Lifecycle Data, apply the bounded ephemeral
`skills/author-preflight.md@2` contract.
