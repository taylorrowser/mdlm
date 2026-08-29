---
status: accepted
---

# Collapse ordinary operation into next and submit

MDLM will expose one versioned `next` outcome containing the complete Assignment
Packet and one versioned submission outcome, backed by pure decision, stateful
claim, and atomic submit seams. Read-only status and settlement inspection remain
available; ordinary operation goes directly from `next` to `submit`. This
deliberately replaces the split protocol without a compatibility implementation
because packet reconstruction in runners duplicated policy and transport
metadata, increased invalid proposals, and obscured identity and no-replay
boundaries.
