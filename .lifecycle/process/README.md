# MDLM bootstrap Example Process Package v0.121

This package is the bounded Example Process Package shipped with the
concept-validating MDLM profile. It defines `MAP`, `QST`, `DEC`, `ART`, `PSP`,
`STK`, `SYS`, `CMP`, `DES`, `ASP`, `ICSP`, `DWP`, `VSP`, `ENV`, `VER`, `VAI`, `RUN`, `RES`,
`REV`, `BSL`, `PRB`, `CHG`, and `PAS`. These are package-owned lifecycle types,
not types recognized by the MDLM kernel.

The package declares `mdlm-expression@1` and binds its `BSL` type to the
`exact-baseline@1` Kernel Capability. Definition files are the only catalog and
phase-membership source. The loader derives both rather than validating a
second list in the manifest or phase files.

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

1. validates the manifest and generates catalogs and phase membership from the
   exact definition files;
2. compiles every expression-bearing field from textual source;
3. resolves each lifecycle type through its single Payload Template chain;
4. validates outgoing-link ownership and exact cross-definition references;
5. rejects cyclic or ill-typed Selector, Policy, State, and Template dependencies;
6. compiles every Scenario's public Assignment type and link routes, using two
   symbolic invocations for batchable Scenarios;
7. verifies Scenario inputs, prohibited inputs, output cardinalities, required
   links, participation, Authority Evidence, and completion contracts; and
8. validates the `exact-baseline@1` binding without teaching the kernel the `BSL`
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

The package derives MAP, PSP, and STK work; atomic Review Context and REV
transactions; bounded same-lineage Correction; product-simplification Review; candidate
baselines; attended Gate Sign-off; and mechanically accepted intent. Failed
Reviews and gate rejection remain immutable evidence and route to causal
Correction, fresh Review, and return to the same gate.

Questions preserve empirical and preferential participation. The mandatory initial product-intent Question receives immediate attended
resolution before other Question work becomes eligible. Its answered Revision
stores one normalized, self-contained attended answer rather than a transcript.
The initial Decision retains that answer exactly. A same-lineage correction may
change it only through an explicit attended narrow, defer, or remove authority.
Exact Review Contexts preserve the Question lineage, source boundary, answer
authority, causal failed Review, and correction support. `compile-psp@3`
receives the accepted current Decision without source access. Exact source
boundaries freeze a QST Revision before same-lineage resolution. Checkpoint
attention groups compatible Questions without satisfying or deferring them.
Deferral and cancellation require exact scoped Decision evidence and Review.

### Phase 1 — assurance and pilot evidence

The package derives reviewed verification strategy, qualified environment,
pilot-verification definition, bounded repository target evidence,
source-independent implementation, exact run/result evidence, and atomic Review
Context plus REV publication.
Failed VSP, ENV, VER, and VAI Reviews route through bounded same-lineage
Correction. Corrected assurance requires fresh qualification, context, Review,
and run evidence; prior immutable evidence cannot satisfy changed dependencies.

Qualification, pilot, and formal evidence remain distinct. Unsupported ambiguity
reaches the declared Profile Boundary rather than arbitrary selection.

### Phase 2 — system definition and decomposition

The package derives ASP, ICSP, planning and completion DWP Revisions, allocated
SYS outputs, exact-set simplification, atomic ordinary Phase 2 Review Context
and independent Review publication, evidence-preserving
level candidates without an intermediate singleton group, attended gate
judgment, and flattened acceptance. Canonical links
carry architecture, interface, decomposition, allocation, strategy, and coverage
truth. Scope reduction must remove a proper subset while retaining coherent
replacement coverage; complete removal is not fabricated as success.

### Phase 3 — complete component verification design

The fresh profile consumes the exact accepted Phase 2 SYS baseline and derives
one component ASP, ICSP, VSP, one same-lineage SYS-to-CMP DWP, and a coherent
CMP set. Shared level-aware routes add reviewed formal VER coverage for current
STK, SYS, and CMP claims plus one bounded good/bad component pilot. A direct
component candidate receives its own Review, followed by one attended gate
Decision and one independent Decision Review.

### Phase 4 — lean design definition

The reviewed Phase 3 candidate enters one CMP-to-DES DWP using the existing
component ASP and compatible ICSP. The shared decomposition, completion,
correction, candidate, gate, and formal-VER routes preserve exact ancestry and
reuse compatible component pilot evidence. One independently reviewed direct
DES candidate and reviewed attended gate mechanically promote the exact CMP
candidate to an accepted baseline and progress into Phase 5.

### Phase 5 — implementation and formal verification implementation

Two independent routes consume the exact reviewed and gate-approved DES
candidate. The product route publishes one controlled exact-commit ART with
complete DES links and bounded relative-path mappings. The source-blind route
publishes one separately authorized formal VAI for every exact formal VER without
receiving product source, product unit tests, private implementation details, or
the product ART. One ART Review Context remains separate from one exact VAI-only
sibling context. Every ART and VAI receives its own independent Review. Complete
passing coverage mechanically accepts the DES candidate and progresses into
Phase 6 without publishing RUN or RES.

### Phase 6 — formal verification and final acceptance

The shared execution route runs each exact reviewed formal VAI against its
accepted STK, SYS, CMP, or DES Revision, qualified ENV, and one controlled
implementation ART. Applicable passing evidence unlocks its direct requirement
parent, so execution derives bottom-up without a queue. Automatic results need
no Review. A judgment-required passing result uses the generic frozen Review
Context and independent Review route. Aborted, infrastructure-error, and
inconclusive attempts remain immutable and leave a fresh execution transaction
ready without replay. A completed formal failure blocks ancestor execution,
uses the existing PRB route, and stops at the profile's explicit fault boundary.
Once every exact formal claim applies, one attended
product-acceptance DEC receives an independent Review and returns `Lifecycle
Complete`. Phase 6 adds no accepted-baseline copy, summary, or completion datum.

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
through `mdlm next`, harness-owned work using the included Assignment packet,
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

Phases 0–6 through one lean reviewed implementation and formal-verification
slice are the implemented fresh bootstrap subset. Phase 7 change execution,
production indexing, source-isolation containers, brownfield onboarding, formal
compliance, and broader concurrency remain outside this profile. This package
demonstrates one lifecycle structure; it does not define universal MDLM semantics.
