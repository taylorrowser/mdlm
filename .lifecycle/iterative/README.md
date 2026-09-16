# Iterative Process Package

`mdlm init /path/to/lifecycle --process iterative` starts a fresh repository with the bundled `mdlm-iterative` package. It combines the existing exploratory and formal routes. Existing tiny and exploratory products retain their selected package bytes and history.

Discuss the intended product and agree its smallest useful scope. Choose vertical slices that resolve uncertainty, build a usable integrated prototype, then use it while progressively formalizing necessary behavior. EXP records provisional criteria and choices, TRY binds committed runnable source, OBS records actual execution and observations, and FDB records stakeholder feedback. These planning practices guide agent choices; they are not additional kernel gates.

`draft-requirements` takes the current EXP as context. It creates fresh REQs with optional, many-to-many exact `informed-by` links to EXP/OBS. A requirement may have no predecessor. Read origins through `mdlm show <exact-revision> --json`; the review context includes the links in its requirement graph. Origin records explain a decision but do not verify implementation or approve a baseline. EXP identities never become REQ identities.

Formal work uses the existing REQ/DCP/RQS graph, complete source attribution, exact execution receipt, independent reviews and stakeholder acceptance. Only publish REQs for the current formal scope: the graph includes all current REQs, and source inventory covers the whole selected Git repository. Prototype source has no blanket traceability requirement.

For the River experiment:

1. Reach a usable scoring CLI through exploratory slices. Keep meaningful choices and observations in exact EXP/TRY/OBS/FDB history.
2. Formalize the scoring module and its verifier in the same source repository as the provisional CLI. Set IMP acceptance_scope to partial and formal_files to the scoring and verifier paths. Review the complete inventory; only selected files receive formal traceability and are available during canonical verification. Describe module acceptance honestly.
3. Request and approve a change against the component baseline's stakeholder scope. Revise that scope and its affected decomposition group, add necessary interaction requirements, and preserve unchanged scoring leaves. Rebind IMP to the complete integrated source using acceptance_scope whole-product and no formal_files. Attribute all production and verifier source. Keep the same repository history and review explicit affected-source mappings.
4. Independently review, verify and accept the agreed whole product. Then probe an allowed implementation change through another approved change, a new RQS selecting unchanged exact requirements, and fresh implementation evidence. The new selection retains its exact requirement and decomposition revisions; the package can reuse their prior review under the rule below.

The package reports `profile-boundary-reached` when its current formal scope is reviewed, verified and accepted. This can first mean a scoring component. The stakeholder and experiment operator must compare the exact accepted scope with the agreed whole product before declaring the experiment complete. Optional approved-change work remains available at that boundary. Exploration records remain outside the formal acceptance claim.

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
