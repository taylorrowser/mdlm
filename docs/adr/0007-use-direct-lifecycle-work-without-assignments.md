---
status: accepted
---

# Use direct lifecycle work without Assignments

MDLM now reports available lifecycle work and supplies guidance for an agent-selected action, then validates and atomically publishes a direct proposal without allocating an Assignment. This replaces the next/submit protocol and Scenario-derived authority contracts in ADR-0004 and ADR-0003; package actions declare authority requirements, while exact context, independent review registration, stakeholder authority, immutable evidence and operation settlement retain the useful integrity boundaries. The cutover supports fresh direct-contract packages only, removing the old runtime instead of maintaining two execution paths; historical installed releases and their evidence remain unchanged.
