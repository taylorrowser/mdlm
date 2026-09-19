---
id: revise-interface
version: 2
---

# Revise an interface agreement

Describe one meaningful boundary and both endpoints: owner or contact role, what each supplies and consumes, and the assumptions each depends on. State representation, units, valid values, ordering or timing where relevant, error behavior and compatibility. Give examples in the body when useful. Mark unresolved prototype decisions explicitly. An external owner name describes responsibility; it does not establish third-party approval. State simulation limits.

The ICD revision identifies this lifecycle claim. A protocol version identifies an endpoint convention and may remain unchanged across documentation revisions. Use protocol_version only when the boundary has one.

Select necessary verification contracts with optional uses-interface links from EXP or REQ to exact ICD revisions. TRY may also record its exact prototype interface use. Prototype use is provisional. Requirements must state necessary obligations; referencing an ICD does not turn all its design choices into requirements. Code and verification continue to trace through REQs. An ICD is useful when a boundary needs an explicit agreement, not for every function call.

Revise the supplied ICD lineage. Explain the changed agreement and affected consumers in compatibility. Prior exact links and evidence keep their original meaning. A new revision is available for exploration, not automatically adopted by existing users. To adopt it in accepted scope, revise affected referring REQs through the approved change process, renew relevant integration evidence, and obtain the normal review and acceptance.

For an EXP with no TRY yet, use optional `amend-experiment` to adopt the recorded
ICD revision and export fresh criterion context before independent verification.
After a TRY exists, use the normal observation or feedback route to revise its
EXP. Publishing an ICD alone leaves every prior exact selection unchanged.
