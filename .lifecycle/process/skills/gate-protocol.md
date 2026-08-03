---
id: gate-protocol
version: 1
---

# Gate protocol

A gate is a decision about one exact frozen candidate.

1. Verify hashes, composition, member reviews, candidate review, and blocking QSTs.
2. Present candidate ID, role, scope, material changes, findings, omissions, and
   process drift separately.
3. Batch and deduplicate questions without obscuring which artifacts they affect.
4. Ask for explicit approval or rejection; never infer sign-off.
5. Record the answer as DEC linked to the exact candidate revision.
6. If any definition changes, stop and create a new candidate; never patch the
   baseline under review.
7. Treat approval for downstream work separately from later acceptance or promotion.
