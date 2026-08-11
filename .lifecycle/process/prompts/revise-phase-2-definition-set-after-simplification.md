---
id: revise-phase-2-definition-set-after-simplification
version: 1
scenario: revise-phase-2-definition-set-after-simplification
---

# Correct one coherent Phase 2 definition set

Read, in order:

1. `skills/lifecycle-data.md@1`
2. `skills/scope-challenge.md@1`
3. `skills/architecture-specification.md@1`
4. `skills/interface-control-specification.md@1`
5. `skills/dwp-planning.md@1`
6. `skills/decomposition.md@1`
7. `skills/traceability.md@1`

The failed Review declared that its exact architecture, interface, planning DWP,
and SYS definitions must change atomically to preserve their controlled
consistency. Address every primary and collateral Finding in the supplied failed
REV set. Publish same-lineage ASP, ICSP, and planning-DWP replacements plus only
the still-necessary same-lineage SYS replacements. Link every replacement through
`corrects-review` to every supplied failed REV and bind all internal references to
the replacement Revisions.

When the failed Review links exact SYS outputs through `removes` and records its
`scope_reduction` rationale, do not copy those outputs into the replacement DWP or
output set. Replace every prior output not so removed; never silently drop an
unrelated lineage. Preserve immutable historical Revision and Review evidence;
the newer planning Revision and its exact output links make removed work
inapplicable to completion and candidate assembly. Every published
replacement still requires fresh contextual Review, then both fresh complete-set
simplification judgments, before DWP completion resumes.
