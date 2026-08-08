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
unsupported behavior capable of discriminating the pilot design. Do not inspect or
promote product source as verification evidence, claim requirement acceptance,
choose new stakeholder scope, or register a mutable branch or tag. Publication
records existing repository evidence; it does not authorize product scope.
