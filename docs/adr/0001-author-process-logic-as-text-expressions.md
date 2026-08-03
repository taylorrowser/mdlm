---
status: accepted
---

# Author process logic as text expressions

Process authors will write values, conditions, predicates, bindings, and quantifiers in a safe versioned MDLM Expression Language rather than directly authoring the YAML representation of its AST. YAML remains responsible for structural declarations, and package loading parses and type-checks expressions into the deterministic internal AST; arbitrary code execution is prohibited. This accepts the cost of a versioned parser because the YAML AST proved too verbose and implementation-shaped for the primary human and agent authoring interface.
