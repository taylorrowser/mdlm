---
id: information-allocation
version: 1
---

# Lifecycle information allocation

Allocate each fact to its lowest authoritative level and reference it elsewhere;
do not restate it upward or downward.

- **PSP** owns product purpose, users, externally visible outcomes, scope, and
  product-wide constraints. It does not prescribe requirements or solution
  structure.
- **STK** owns one stakeholder-visible commitment, its verification intent, and a
  solution-independent `system_context` routing key. The key groups commitments
  that share responsibility and trust context; it is not an architecture design.
- **SYS** owns one solution-independent system behavior or system constraint that
  realizes exact STK parents. It does not repeat product rationale or prescribe
  components, interfaces, algorithms, or tests.
- **ASP** owns system contexts, responsibilities, elements, internal interactions,
  independently controlled boundaries, constraints, and architecture risks for a
  coherent accepted STK set. It does not repeat requirement statements or
  implementation details.
- **ICSP** owns the contract covering the ASP's exact independently controlled
  boundary set: participants, direction, behavior, compatibility, and observability. Do not create an ICSP for
  an internal interaction with no independently controlled contract.
- **DWP** owns one cohesive change-and-verification slice: exact many-to-many
  parents, one allocation, applicable controlled interfaces, expected coverage,
  exclusions, dependencies, and Review policy. It does not restate parent or
  architecture content.
- **Verification data** owns strategy, environment, procedure, observations, and
  verdicts. It references verification intent but does not rewrite requirements.

Multiplicity requires a distinct behavior, responsibility, controlled boundary,
risk, trust context, or verification need. Different wording alone is not a
reason to split. Merge facts that have the same owner and consequence; split facts
whose independent change or failure would require separate judgment.
