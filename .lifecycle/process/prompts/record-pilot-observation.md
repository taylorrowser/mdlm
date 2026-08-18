---
id: record-pilot-observation
version: 2
scenario: record-pilot-observation
skills: [skills/lifecycle-data.md@1, skills/pilot-assessment.md@1, skills/author-preflight.md@1]
---

# Record one pilot observation

Apply `skills/author-preflight.md@1` privately before proposing the DEC; publish
none of that working memory and do not provide it to an independent reviewer.

Author one exact DEC observation justified by the supplied complete level candidate.
Set `kind` to `pilot-observation` and `effective_scope` to `Phase 0–2 pilot evidence boundary`.
Populate every typed `pilot_observation` measurement section from exact available
evidence: Review burden, agent effort and exact commit refs, evidence reuse and
Staleness explanation checks, Loose End and gate experience, environment profiles,
verification discrimination, and actual scope removal. Set each `availability` entry to `observed` or `unavailable`. Distinguish observed
counts from estimates; use zero values and empty commit refs where an unavailable
section has no observed quantity rather than omitting or inventing evidence. The later frozen
assessment context, not a generated report or chat history, gathers these observations.
