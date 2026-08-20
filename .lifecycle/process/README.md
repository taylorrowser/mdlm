# MDLM bootstrap Example Process Package v0.59

This package is the bounded Example Process Package shipped with the
concept-validating MDLM profile. It defines `MAP`, `QST`, `DEC`, `ART`, `PSP`,
`STK`, `SYS`, `ASP`, `ICSP`, `DWP`, `VSP`, `ENV`, `VER`, `VAI`, `RUN`, `RES`,
`REV`, `BSL`, `PRB`, `CHG`, and `PAS`. These are package-owned lifecycle types,
not types recognized by the MDLM kernel.

The package declares `mdlm-expression@1` and binds its `BSL` type to the
`exact-baseline@1` Kernel Capability. Textual expressions, package catalogs, and
all cross-definition contracts are validated when the package loads.

## Ownership boundary

The kernel owns the Datum Envelope, Stable Datum and Revision identity,
immutability, graph storage, hashing, primitive Relations, atomic publication,
and deterministic evaluation. This Process Package owns payload templates,
lifecycle types, outgoing-link contracts, Selectors, Policies, Computed States,
Obligations, Scenarios, phases, prompts, skills, participation, authority, and
profile conditions.

The kernel does not recognize this package's type IDs, Scenario IDs, phase IDs,
review outcomes, pilot metrics, or expansion recommendation. Package conclusions
are derived from kernel primitives through typed expressions.

## Declarative model

Package loading:

1. validates the manifest and authored catalogs;
2. compiles every expression-bearing field from textual source;
3. resolves each lifecycle type through its single Payload Template chain;
4. validates outgoing-link ownership and exact cross-definition references;
5. rejects cyclic or ill-typed Selector, Policy, State, and Template dependencies;
6. verifies Scenario inputs, prohibited inputs, output cardinalities, required
   links, participation, Authority Evidence, and completion contracts; and
7. validates the `exact-baseline@1` binding without teaching the kernel the `BSL`
   identifier.

Obligations distinguish eventual Resolver availability from Dispatchability.
Loose Ends retain exact subjects, blockers, bindings, participation, expected
outputs, completion evidence, and waiver rules. Phase progression and terminal
outcomes derive from exact Lifecycle Data and package provenance rather than a
mutable phase pointer.

Authority Supply permits a non-autonomous Scenario transaction but does not
satisfy an Obligation. Durable authority is the exact REV or DEC declared by the
Scenario. Protected Authority-Evidence Types are derived from those Scenario
contracts, and repository validation requires matching completed Scenario
transactions.

## Implemented profile

### Phase 0 — wayfinding and accepted intent

The package derives MAP, PSP, and STK work; exact Review Contexts; independent
Reviews; bounded same-lineage Correction; product-simplification Review; candidate
baselines; attended Gate Sign-off; and mechanically accepted intent. Failed
Reviews and gate rejection remain immutable evidence and route to causal
Correction, fresh Review, and return to the same gate.

Questions preserve empirical and preferential participation. The mandatory
initial product-intent Question receives immediate attended resolution before
other Question work becomes eligible. Exact source boundaries freeze a QST
Revision before same-lineage resolution. Checkpoint attention groups compatible
Questions without satisfying or deferring them.
Deferral and cancellation require exact scoped Decision evidence and Review.

### Phase 1 — assurance and pilot evidence

The package derives reviewed verification strategy, qualified environment,
pilot-verification definition, bounded repository target evidence,
source-independent implementation, exact run/result evidence, and fresh Review.
Failed VSP, ENV, VER, and VAI Reviews route through bounded same-lineage
Correction. Corrected assurance requires fresh qualification, context, Review,
and run evidence; prior immutable evidence cannot satisfy changed dependencies.

Qualification, pilot, and formal evidence remain distinct. Unsupported ambiguity
reaches the declared Profile Boundary rather than arbitrary selection.

### Phase 2 — system definition and decomposition

The package derives ASP, ICSP, planning and completion DWP Revisions, allocated
SYS outputs, exact-set simplification, independent Review, evidence-preserving
candidates, attended gate judgment, and flattened acceptance. Canonical links
carry architecture, interface, decomposition, allocation, strategy, and coverage
truth. Scope reduction must remove a proper subset while retaining coherent
replacement coverage; complete removal is not fabricated as success.

### Phase 7 — bounded accepted change

Exact accepted STK and shared-SYS change routes preserve immutable history,
derive complete impact from accepted-baseline roots, require reviewed attended
Change Request disposition, publish same-lineage replacements, rebuild affected
consumer evidence serially, retain materially unaffected evidence, and close only
with exact reviewed evidence.

### Pilot assessment

The package freezes exact pilot observations in a pilot-assessment context,
derives PAS publication and independent Review, bounds PAS Correction, and
requires an attended Expansion Decision that adopts `proceed`, `change`, or
`stop`. The recorded recommendation is `change`: useful evidence and routing were
demonstrated, but ceremony remained high and scope removal was not demonstrated.

## Supported operation

A repository is created with `mdlm init <destination>`. Normal work proceeds only
through `mdlm status`, `mdlm next`, `mdlm scenario prepare`, harness-owned work,
`mdlm scenario submit`, `mdlm doctor`, read-only inspection, and ordinary Git.
Scenario submission is the canonical publication boundary for normal
Scenario-owned Lifecycle Data.

Useful package-neutral inspection includes `mdlm process show`, package validation
and fixture testing, schema and definition inspection, Relation/Selector/Policy/
State/Obligation evaluation, Phase status, Loose Ends, Scenario transaction
inspection, graph history and trace, and exact baseline verification or diff.

The operator stops explicitly at Attention Required when authority is unavailable,
Profile Boundary Reached, Lifecycle Complete, Process Dead End, Invalid, stale or
exhausted Assignment, failed doctor, unexpected Git state, genuine ambiguity, or
command failure. A successful transaction, Review, gate, or phase progression is
not itself a stop; the next Operator Outcome controls continuation.

## Scope boundary

Phases 0–2, the bounded Phase 7 change route, and pilot assessment are the
implemented bootstrap subset. Phase 3–6 breadth, production indexing,
source-isolation containers, brownfield onboarding, formal compliance, and broader
concurrency remain outside this profile. This package demonstrates one lifecycle
structure; it does not define universal MDLM semantics.
