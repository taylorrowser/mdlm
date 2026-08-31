---
id: qualification-verification
version: 2
---

# Qualification verification

- Keep qualification VER and VAI minimal and bounded by declared ENV capabilities.
- Include positive checks and negative controls for controllability and observability.
- Put complete bounded instructions for both checks in the qualification VAI's
  `execution_procedure.content`, and retain its deadline, termination, cleanup,
  and aggregation controls.
- Bind exact ENV, VER, VAI, runner, and configuration in RUN.
- Scope RES to `environment-capability` with only `pass` or `fail`.
- Assess qualification support artifacts through the containing ENV Review.
- Never link qualification evidence as product requirement acceptance.
