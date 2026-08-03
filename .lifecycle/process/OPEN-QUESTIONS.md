# Bootstrap package v0.2 open questions

The typed evaluator and first vertical slice resolved the process-specific-fact
shape, gate dispatch behavior, and authoring direction. These remaining questions
should be answered through reversible implementation choices and observable
behavior where possible.

1. **Schema narrowing:** Which deliberately limited JSON Schema operations may a
   payload template tighten, and which require a complete leaf schema?
2. **Static path typing:** How strict should expression validation be when a
   polymorphic variable can refer to types with different payload fields?
3. **Dependency changes:** What exact typed records does the kernel emit for
   content, resolved-link, evidence-target, baseline, and review-context changes?
4. **Repeated link IDs:** Should source-local contracts sharing a relationship ID
   be checked for compatible descriptions and historical meaning?
5. **Collection conditions:** Scenario conditions on `one-or-more` inputs are
   intended to apply to every item; fixtures and diagnostics must confirm this.
6. **Obligation history:** What generated representation explains obligation
   instances that fall out of a selector after their subject is revised?
7. **Review-context volume:** When should coherent sibling reviews share one
   context, and when would sharing obscure the exact judgment?
8. **Baseline policy:** Role/kind agreement, permitted member types, composition,
   and promotion still need a complete machine-readable policy.
9. **Invalid fixtures:** Package validation needs focused invalid fixtures for each
   rejection class, beyond the current unknown-reference and cycle tests.
10. **Expression parser:** The MDLM Expression Language semantics are chosen, but a
    CEL-compatible library versus a small purpose-built parser remains an internal
    implementation choice.
11. **Resolver eligibility:** The next result model must expose dispatchability,
    blockers, eventual resolver, actionable resolver, expected outputs, and waiver
    applicability rather than only status and one resolver string.
12. **Phase evaluation:** Entry conditions, selected candidates, gate completion,
    and exact phase blockers are specified but not yet returned by the evaluator.
13. **Performance:** In-memory graph scans are sufficient for the pilot; indexing
    should follow measurements from realistic lifecycle repositories.
14. **Kernel Capability migration:** The example BSL type needs an explicit
    `exact-baseline@1` binding and a validated required payload contract without
    making `BSL` a kernel-recognized type ID.
15. **Package Command Aliases:** The alias schema must bind arguments only to
    declared scenarios or generic operations and prove that aliases cannot bypass
    prohibited-input, output-contract, or mutation checks.
