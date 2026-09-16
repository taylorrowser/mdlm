---
id: record-interface
version: 1
---

# Record an interface agreement

Describe one meaningful boundary and both endpoints: owner or contact role, what each supplies and consumes, and the assumptions each depends on. State representation, units, valid values, ordering or timing where relevant, error behavior and compatibility. Give examples in the body when useful. Mark unresolved prototype decisions explicitly. An external owner name describes responsibility; it does not establish third-party approval. State simulation limits.

The ICD revision identifies this lifecycle claim. A protocol version identifies an endpoint convention and may remain unchanged across documentation revisions. Use protocol_version only when the boundary has one.

Use optional uses-interface links from TRY and REQ to exact ICD revisions. Prototype use is provisional. Requirements must state necessary obligations; referencing an ICD does not turn all its design choices into requirements. Code and verification continue to trace through REQs. An ICD is useful when a boundary needs an explicit agreement, not for every function call.

Publish the smallest useful agreement with the supplied proposal guidance. Read its exact revision with mdlm show <revision> --json. Later use revise-interface guidance for that revision; do not overwrite historical records.
