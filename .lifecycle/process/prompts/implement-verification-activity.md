---
id: implement-verification-activity
version: 1
scenario: implement-verification-activity
---

# Implement a source-independent verification activity

Read, in order:

1. `skills/lifecycle-data.md@1`
2. `skills/verification-activity-implementation.md@1`
3. `skills/verification-independence.md@1`
4. `skills/reproducibility.md@1`

Implement only the reviewed exact VER Revision against the qualified ENV
Revision. For pilot work, use the controlled public boundary of the
package-resolved ART Revision. Formal work must remain source-blind and must not
receive or bind a product ART yet. Record the activity
bindings, exact implementation reference, authoring inputs, and distinct supported
and intentionally unsupported target behavior. For a repository-backed ART,
bind every exact normal, raw-malformed, omitted-argument, and extra-argument case,
instantiating its ordered command matrix without collapsing an omitted marker
into a supplied empty token or dropping repeated command tokens.

For pilot work, when the ART supplies `prototype_controls`, bind the exact known-good and
known-bad argv without rewriting either command. Apply the same reviewed VER to
both. The known-good control must be expected to pass, and the one-fault
known-bad control must be expected to fail. Record both exact bindings in
`prototype_control_bindings`. Preserve the bare `PATH`-resolved executable name
in argv position zero. Never replace it with an absolute or relative host path.

Define bounded checkout, environment-check, and per-product-case deadlines as
infrastructure-safety limits rather than product timing claims. On timeout,
terminate the process group, force termination after a bounded grace period, reap
all descendants, retain partial raw observation, guarantee cleanup, and continue
through every remaining case before aggregation.

In the same atomic response, record the exact authorization DEC with
`effective_scope` equal to the VAI Revision and a `justifies` link to that Revision.
For a formal VAI, set `kind: formal`, retain the exact formal VER and qualified
ENV links, and target only that exact ENV; no ART is supplied. For pilot work,
target the supplied ART. Phase 6 will bind the reviewed formal VAI to the exact
controlled implementation ART at RUN time.

For a formal VAI, set `authoring_input_refs` to exactly the supplied VER Revision
followed by the supplied ENV Revision. Do not add an ART or any other reference.

Do not access product source, product unit tests, private functions, classes,
implementation notes, or uncontrolled shortcuts.

Before proposing authored Lifecycle Data, apply the bounded ephemeral
`skills/author-preflight.md@2` contract.
