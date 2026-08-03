---
id: lifecycle-data
version: 1
---

# Lifecycle data

- Treat lifecycle files, not generated indexes or chat history, as durable truth.
- Let the kernel create and validate envelope fields: identity, revision, type,
  links, provenance, and Markdown body projection.
- Author only fields permitted by the resolved type payload schema. Do not place
  type-specific data beside the kernel envelope.
- Create opaque stable IDs with the type prefix and Crockford Base32 payload.
- Edit only an unfrozen draft. A change to frozen content creates the next revision.
- Validate outgoing links against the source type's resolved link contracts; never
  author a backlink.
- Use stable targets for evolving semantic relationships and exact revision targets
  for reviews, decisions, evidence, composition, and promotion.
- Populate `created_by` with the exact scenario, prompt, process, skills, and
  machine-readable policies.
- Validate the envelope, flattened payload schema, links, and one-open-draft rule.
- Never rewrite, renumber, silently merge, or repair frozen history.
