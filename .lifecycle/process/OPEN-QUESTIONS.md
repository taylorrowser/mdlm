# Bootstrap package v0.2 open questions

The typed evaluator and first vertical slice resolved the process-specific-fact
shape, gate dispatch behavior, and authoring direction. These remaining questions
should be answered through reversible implementation choices and observable
behavior where possible.

1. **Static path typing:** How strict should expression validation be when a
   polymorphic variable can refer to types with different payload fields?
2. **Dependency changes beyond v1:** `dependency-change@1` now covers exact
   content, outbound-link, stable-link-resolution, capability-bound baseline
   membership and composition, evidence-target, and review-context comparisons.
   What typed records should later versions emit for execution-target and
   environment changes?
3. **Repeated link IDs:** Should source-local contracts sharing a relationship ID
   be checked for compatible descriptions and historical meaning?
4. **Collection conditions:** Scenario conditions on `one-or-more` inputs are
   intended to apply to every item; fixtures and diagnostics must confirm this.
5. **Obligation history:** What generated representation explains obligation
   instances that fall out of a selector after their subject is revised?
6. **Review-context volume:** When should coherent sibling reviews share one
   context, and when would sharing obscure the exact judgment?
7. **Baseline policy:** Role/kind agreement, permitted member types, composition,
   and promotion still need a complete machine-readable policy.
8. **Invalid fixtures:** Package validation needs focused invalid fixtures for each
   rejection class, beyond the current unknown-reference and cycle tests.
9. **Expression parser expansion:** The initial comparison slice uses a small
    purpose-built parser behind the versioned language contract. Reconsider a
    compatible library only if later syntax makes the internal parser materially
    harder to maintain without changing observable language behavior.
10. **Resolver eligibility:** Obligation results now separate Dispatchability,
    exact blocker chains, unresolved bindings, the eventual Resolver Scenario,
    and the currently actionable resolver. Expected outputs, required links, and
    waiver applicability remain to be exposed.
11. **Phase evaluation:** Entry, deterministic exact candidate selection, and
    per-candidate gate completion now retain expression, Policy, Selector, and
    exact blocker evidence. Promotion and historical gate-report persistence
    remain outside the evaluator prototype.
12. **Performance:** In-memory graph scans are sufficient for the pilot; indexing
    should follow measurements from realistic lifecycle repositories.
13. **Package Command Aliases:** The alias schema must bind arguments only to
    declared scenarios or generic operations and prove that aliases cannot bypass
    prohibited-input, output-contract, or mutation checks.
