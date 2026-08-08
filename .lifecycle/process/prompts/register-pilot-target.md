---
id: register-pilot-target
version: 1
scenario: register-pilot-target
skills: [skills/lifecycle-data.md@1, skills/reproducibility.md@1, skills/traceability.md@1, skills/scope-challenge.md@1]
---

# Register an exact pilot target

Record one existing exact Git commit as an ART derived from the supplied exact
requirement Revision. Before proposing output, use a public Git object lookup to
confirm the 40-hex object resolves as a commit, then retain that observation in
`evidence_refs`; a branch, tag, abbreviated hash, or unobserved object is not an
eligible target. Use `kind: prototype` or `kind: implementation` truthfully.
Bound `supported_behavior` to behavior actually present at that immutable commit
and relevant to the exact requirement. Record at least one intentionally
unsupported behavior capable of discriminating the pilot design.

Record the complete controlled public execution interface needed by a fresh
source-blind implementer: an exact repository locator, the parameterized public
command vector using ordered literal, checkout-path, and parameter tokens. Keep
each parameter name and its exact public encoding or token mapping together in its
command token so no declared parameter can be disconnected from execution. Record a
fresh-temporary-directory
working-directory contract, and exact
observable success and rejection protocols for exit status, stdout, and stderr.
The command may expose public entrypoint paths but must not expose product source,
unit tests, private functions, implementation notes, or uncontrolled shortcuts.

Do not inspect or promote product source as verification evidence, claim a
verification result or requirement acceptance, choose new stakeholder scope, or
register a mutable branch or tag. Publication records existing repository evidence;
it does not authorize product scope.
