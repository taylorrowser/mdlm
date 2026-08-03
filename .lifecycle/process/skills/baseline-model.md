---
id: baseline-model
version: 1
---

# Baseline model

- A baseline is an immutable exact snapshot, never a mutable label for “current.”
- Separate definition members from supporting evidence.
- Use exact revision IDs for members, evidence, and composed baselines.
- Hash exact file bytes with SHA-256 and capture resolved outbound-link targets.
- Record the exact process manifest and asset references used by the snapshot.
- Freeze atomically only after schema, reference, review, composition, and collision
  checks pass.
- Candidate and accepted baselines are distinct artifacts; promotion references the
  exact candidate.
- Currentness is explicit by role and scope through `supersedes`; an accepted
  baseline remains authoritative while a newer candidate is evaluated.
