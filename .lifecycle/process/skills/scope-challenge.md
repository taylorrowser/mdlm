---
id: scope-challenge
version: 2
---

# Scope challenge

For each artifact or requirement ask:

1. Which exact parent, constraint, interface obligation, or DEC makes it necessary?
2. What user or system failure occurs if it is removed?
3. Can it merge with a sibling without losing an independently assessable claim?
4. Is complexity present only to support complexity introduced elsewhere?
5. Is a preference being presented as a requirement?
6. Is the evidence strong enough to retain it now rather than defer it?
7. For a correction, which behavior changed from the prior Revision, and is each
   change necessary to resolve an exact finding or implement exact authority?
8. Does a local determinism fix introduce numeric limits, machine representation,
   protocol, rendering, or implementation machinery not required by product
   purpose? Determinism alone does not make that machinery necessary.
9. When a scope-correction DEC is present, do the bounded, defer-or-remove, and
   retain options describe materially distinct outcomes, and does the selected
   disposition match the corrected subject without unrelated expansion?

Recommend deletion, merge, deferral, or clarification explicitly. Do not equate
more detail with quality. Preserve only the smallest set sufficient to cover
accepted intent. Treat an attended DEC as exact scope authority, not as proof
that the resulting wording is coherent or proportionate; independently challenge
the correction against its recorded options and necessity.
