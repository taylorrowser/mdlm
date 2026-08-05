# Bootstrap package v0.2 open questions

The typed evaluator and first vertical slice resolved the process-specific-fact
shape, gate dispatch behavior, and authoring direction. These remaining questions
should be answered through reversible implementation choices and observable
behavior where possible.

1. **Static path typing:** How strict should expression validation be when a
   polymorphic variable can refer to types with different payload fields?
2. **Dependency changes beyond v1:** `dependency-change@1` now covers exact
   content, outbound-link, stable-link-resolution, capability-bound baseline
   membership and composition, evidence-target, review-context, and informational
   process-provenance comparisons.
   What typed records should later versions emit for execution-target and
   environment changes?
3. **Repeated link IDs:** Should source-local contracts sharing a relationship ID
   be checked for compatible descriptions and historical meaning?
4. **Collection conditions:** Scenario conditions on `one-or-more` inputs are
   intended to apply to every item; fixtures and diagnostics must confirm this.
5. **Obligation history:** Resolved for the prototype by evaluating explicit,
   named historical repository snapshots independently and returning their exact
   Obligation explanations separately from current instances. Durable repository
   history discovery remains an adapter concern rather than a lifecycle type.
6. **Review-context volume:** The narrow Phase 0 pilot shares one frozen intent
   context across coherent MAP, PSP, and STK subjects while producing one REV per
   subject. What broader package rule should decide when sharing would obscure
   the exact judgment?
7. **Baseline policy:** Role/kind agreement, permitted member types, composition,
   and promotion still need a complete machine-readable policy.
8. **Invalid fixtures:** Package validation needs focused invalid fixtures for each
   rejection class, beyond the current unknown-reference and cycle tests.
9. **Expression parser expansion:** The initial comparison slice uses a small
    purpose-built parser behind the versioned language contract. Reconsider a
    compatible library only if later syntax makes the internal parser materially
    harder to maintain without changing observable language behavior.
10. **Resolver eligibility:** Obligation results separate Dispatchability,
    exact blocker chains, unresolved bindings, eventual and actionable Resolver
    Scenarios, expected outputs, Waiver Policy evidence, and dry-run bindings.
    Repository execution reuses that exact authorization boundary.
11. **Phase evaluation:** Entry, deterministic exact candidate selection, and
    per-candidate gate completion now retain expression, Policy, Selector, and
    exact blocker evidence. Promotion and historical gate-report persistence
    remain outside the evaluator prototype.
12. **Performance:** In-memory graph scans are sufficient for the pilot; indexing
    should follow measurements from realistic lifecycle repositories.
13. **Package Command Aliases:** The first Scenario-targeting slice now compiles
    cardinality-typed arguments to one exact declared Scenario and routes through
    its canonical execution contract. Allowlisted generic-operation targets and
    richer scalar argument types remain deferred.
14. **Qualification attachment:** The Phase 1 tracer explicitly links a passing
    generated qualification RES from the still-editable ENV before freezing and
    reviewing that ENV. Should a later package Scenario produce an ENV revision
    with this link, or is the visible generic link mutation preferable for
    qualification evidence assembly?
15. **DWP candidate sequencing:** The Phase 2 tracer simplifies one frozen
    definition-set context, publishes and reviews the DWP completion Revision,
    then freezes the resulting group candidate. Should a later package contract
    atomically reserve the resulting candidate identity before completion, or is
    this explicit context-to-completion-to-candidate sequence preferable?
16. **Multi-requirement change order:** The change tracer authorizes one affected
    SYS Revision before replacement evidence. Should a later package represent a
    multi-requirement original-V plan as another DWP lineage, a CHG payload order,
    or separately derived per-subject Obligations with explicit dependency edges?
