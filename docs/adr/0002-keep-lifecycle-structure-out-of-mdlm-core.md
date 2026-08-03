---
status: accepted
---

# Keep lifecycle structure out of MDLM core

MDLM core will provide the Datum Envelope, package loader, expression and evaluator semantics, generic CLI, and explicitly selected Kernel Capabilities without recognizing V-model types or phases by name. The complete PSP-to-verification structure will ship as the first Example Process Package; lifecycle-specific CLI conveniences are declarative aliases to its scenarios or generic operations, not executable plugins. This preserves case-by-case process design and prevents the first useful package from becoming accidental kernel architecture.
