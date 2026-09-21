# Iterative Process Package

`mdlm init /path/to/lifecycle --process iterative` starts a fresh repository with the bundled `mdlm-iterative` package. It combines the existing exploratory and formal routes. Existing tiny and exploratory products retain their selected package bytes and history.

Discuss the intended product and agree its smallest useful scope. Choose vertical slices that resolve uncertainty, build a usable integrated prototype, then use it while progressively formalizing necessary behavior. EXP records provisional criteria and choices, TRY binds committed runnable source, OBS records actual execution and observations, and FDB records stakeholder feedback. These planning practices guide agent choices; they are not additional kernel gates.

`draft-requirements` is optional and takes the current EXP as context. Choose it when stakeholder intent justifies a formal scope, during exploration or after its closure. Publishing the fresh REQ/DCP/RQS set starts ordinary formal obligations in the same history. It creates fresh REQs with optional, many-to-many exact `informed-by` links to EXP/OBS. A requirement may have no predecessor. Read origins through `mdlm show <exact-revision> --json`; the review context includes the links in its requirement graph. Origin records explain a decision but do not verify implementation or approve a baseline. EXP identities never become REQ identities.

Formal work uses the existing REQ/DCP/RQS graph, complete source attribution, exact execution receipt, independent reviews and stakeholder acceptance. Only publish REQs for the current formal scope: the graph includes all current REQs, and source inventory covers the whole selected Git repository. Prototype source has no blanket traceability requirement.

Before first acceptance, optional `refine-requirements` records stakeholder
clarification or changed intent even after requirements review has passed. It
requires explicit stakeholder authority, preserves unchanged requirements and
publishes a successor in the same RQS lineage. Refresh expectations for independent
review of that exact successor and export its verification context before authoring
dependent evidence. The original wording, PASS and evidence remain history.
Accepted lineages and work already bound to an approved change retain their
existing change and correction routes.

## Requirement quality and depth

Authors and reviewers use the checklists in `skills/product-quality.md`. Each REQ
states one obligation. Equations, decision tables and state transitions can settle
required behavior; copying code into prose cannot justify it. `skills/typed-requirements.md`
explains variable system/software depth and the initial architecture/depth note in
an owning REQ rationale. The requirement graph supports shared children and uneven
depth without extra review transactions or fixed tiers. This representation keeps
the note in ordinary version history and source-free exports, but adds no separate
architecture query or automatic allocation-impact mechanism.

## Independent verification

Version 2 uses a separate committed verification repository. Export `mdlm verification context <exact-RQS-or-EXP> --output <new-file> --json` for a fresh verification author. The export contains requirements or criteria and public interfaces, without product source or implementation explanations. `plan-verification` and `plan-criterion-verification` publish VFY activities with methods, intended actions, expected results and exact case coverage. Use the smallest case set that adequately covers every obligation; scripts and cases may cover several requirements.

Select the activities on IMP or TRY through exact verification links. `review-verification` records independent adequacy for formal requirements. Execute each with `mdlm execution run <exact-product> <operation> --activity <exact-VFY> --json`, then record its RES using the supplied guidance. `mdlm verification status <exact-product> --json` reports coverage, reviews, current outcomes and gaps for every requirement. Missing, skipped, failed or stale evidence cannot verify a requirement. Formal verified also requires the implementation review to judge the complete selected coverage for each requirement; passing individual partial activities alone is insufficient. Criterion results support learning without claiming a baseline.

Choose methods and execution levels for the actual claim: independent unit/component tests at declared contracts, command-line behavior, browser interaction, output analysis or demonstration. Language adapters may invoke a contract but may not calculate expectations. Retain actual-product integration evidence for cross-component claims. For demonstration, record intended actions and results first, preserve actual computer-use observations, derive a replay script from the interactions and execute it again. The requirement defines the expected result even when the product behaves differently. Case outputs and declared artifacts are captured with exact product, verifier and environment identities.

Product source keeps its own requirement attribution. Language-neutral source_ranges cover nonblank production, build and configuration lines. The verifier needs no in-product source regions. A new product commit needs new execution; a new activity or requirement revision needs applicable coverage and evidence. Historical accepted products keep their installed package and evidence.

The package reports `profile-boundary-reached` when all current exploration is closed by keep/drop or explicit stakeholder stop and no formal requirement set exists. This closes exploration only, without product acceptance, a requirements baseline, formal verification or lifecycle completion. Optional `draft-requirements` remains discoverable at that boundary; choosing it begins formal work without replacing exploratory history.

Once a formal requirement set exists, the package requires its current formal scope to be reviewed, verified and accepted before reporting that boundary. This can first mean a scoring component. The stakeholder and experiment operator must compare the exact accepted scope with the agreed whole product before declaring the experiment complete. Optional approved-change work remains available at that boundary. Exploration records remain outside the formal acceptance claim.

Passing exploratory execution permits nomination for stakeholder feedback. Choose feedback continuation when another slice or observation is needed; keep/drop closes that exploratory branch under the existing exploratory semantics. Independent use transcripts can also support observations without rewriting prior evidence. After a closed experiment and an accepted formal scope, optional `explore-change` revises the same EXP lineage and links its exact comparison ACC. Criteria may deliberately depart from named requirements for candidate trials. Ordinary criteria revisions preserve that comparison. TRY/OBS/FDB continue the experiment without changing formal records or opening a CHG. A new candidate has its own source commit; the older acceptance remains true for its exact source. Active comparison work reports work available rather than a formal profile endpoint. Keep/drop or stakeholder stop closes comparison, without accepting the candidate. Adoption uses the existing approved change route. This package does not add package migration or automatic promotion.

The package is a deliberately separate copy of the two small example packages, with one shared selector definition and the changes described above. This keeps its identity self-contained without adding package inheritance machinery. Evolve it from fresh operational evidence.

Implementation-only maintenance reuses a requirements PASS only from a valid earlier RQS in the same lineage, no later than the accepted baseline named by the current approved CHG. Its selected exact REQ and DCP revisions must equal both that baseline and the candidate. A FAIL on the reviewed selection, baseline, candidate or change prevents reuse. Changed graphs require fresh review. This rule also supports consecutive unchanged maintenance without copying reviews or following a reuse chain. A new RQS and IMP, complete source scopes, canonical verification, fresh independent implementation review and explicit stakeholder acceptance remain required.

`record-operational-use` optionally records a distinct actual session as OPU against
an exact TRY or IMP, including historical revisions. Guidance includes prior uses
of that same revision. Record the actor, time, scenario, actual transcript, durable
evidence reference and limitations. These are authored accounts, not kernel-attested
execution. Repeated use needs neither a new source revision nor a canonical receipt.
The linked IMP identifies the full source even when its formal scope is narrower;
operating provisional behavior does not accept it. OPU does not require stakeholder
feedback or change the formal completion conditions. OBS and RES retain their
separate execution-assessment contracts.

## Correcting a prototype

After an OBS recommends revision, choose `correct-prototype` on the current EXP
when only product code needs correction. It preserves the observed TRY lineage,
exact EXP, triggering OBS, selected independent VFY and public ICD links. Commit
the correction and execute the unchanged verification against the new TRY before
observing it. Prior failures remain history. The observation no longer requests
product or experiment correction once its trial has an accepted successor.

Use `revise-experiment` for changed intent or provisional approach, with independent
verification bound to the revised context. Use independent `revise-verification`
and `update-criterion-verification-selection` for a faulty verifier. Passing
nomination and actual stakeholder feedback remain separate from these corrections.

When a revise observation has answered the learning question, optional
`stop-experiment` takes that exact OBS and records an explicit stakeholder decision
to end its exploratory branch. It remains available after failed execution and
preserves that failure. Record useful learning, remaining defects and the chosen
follow-up in the feedback. Other unresolved trials still need closure. Stopping
does not satisfy a criterion or accept the product; formal requirements,
corrections, independent verification and acceptance retain their ordinary rules.

## Interface agreements

Use optional `record-interface` and `revise-interface` guidance for a meaningful internal software boundary or connection to an external device, service or person. ICDs record both endpoint responsibilities, representation and units, failure behavior, compatibility and assumptions. EXP criteria, prototype TRY and formal REQ records can link to exact ICD revisions with `uses-interface`. Independent verification exports the necessary interfaces selected by its EXP or REQ targets. Record the ICD before selecting it. If it is recorded after framing, use optional `amend-experiment` before the first TRY, then export the amended EXP context for independent verification. A revised ICD changes no existing selection; explicit adoption creates a new criterion context. After a TRY exists, use the normal observation or feedback revision route.

Requirements state the necessary obligations. An ICD may also describe provisional choices. Review context includes the exact ICDs referenced by its requirement graph. A new ICD revision preserves prior uses and evidence; adopting it in accepted scope follows the normal requirement change, verification and acceptance route. Lifecycle revision identity is distinct from a wire protocol version.
