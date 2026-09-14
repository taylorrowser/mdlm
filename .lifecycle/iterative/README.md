# Iterative Process Package

`mdlm init /path/to/lifecycle --process iterative` starts a fresh `mdlm-iterative@1.0.0` repository. It combines the existing exploratory and formal routes. Existing tiny and exploratory products retain their selected package bytes and history.

Discuss the intended product and agree its smallest useful scope. Choose vertical slices that resolve uncertainty, build a usable integrated prototype, then use it while progressively formalizing necessary behavior. EXP records provisional criteria and choices, TRY binds committed runnable source, OBS records actual execution and observations, and FDB records stakeholder feedback. These planning practices guide agent choices; they are not additional kernel gates.

`draft-requirements` takes the current EXP as context. It creates fresh REQs with optional, many-to-many exact `informed-by` links to EXP/OBS. A requirement may have no predecessor. Read origins through `mdlm show <exact-revision> --json`; the review context includes the links in its requirement graph. Origin records explain a decision but do not verify implementation or approve a baseline. EXP identities never become REQ identities.

Formal work uses the existing REQ/DCP/RQS graph, complete source attribution, exact execution receipt, independent reviews and stakeholder acceptance. Only publish REQs for the current formal scope: the graph includes all current REQs, and source inventory covers the whole selected Git repository. Prototype source has no blanket traceability requirement.

For the River experiment:

1. Reach a usable scoring CLI through exploratory slices. Keep meaningful choices and observations in exact EXP/TRY/OBS/FDB history.
2. Formalize the scoring component in its own complete source repository, including its verifier. Keep the CLI provisional in its prototype repository. Describe component acceptance honestly.
3. Request and approve a change against the component baseline's stakeholder scope. Revise that scope and its affected decomposition group, add necessary interaction requirements, and preserve unchanged scoring leaves. Rebind IMP to the complete integrated source repository with full production and verifier attribution. Preserve the copied scorer's origin and both source histories. A different repository has no automatic same-repository Git comparison baseline, so review the full new snapshot and record explicit affected-source mappings.
4. Independently review, verify and accept the agreed whole product. Then probe an allowed implementation change through another approved change, a new RQS selecting unchanged exact requirements, and fresh implementation evidence. Record the extra set/review work instead of disguising it as changed obligations.

The package reports `profile-boundary-reached` when its current formal scope is reviewed, verified and accepted. This can first mean a scoring component. The stakeholder and experiment operator must compare the exact accepted scope with the agreed whole product before declaring the experiment complete. Optional approved-change work remains available at that boundary. Exploration records remain outside the formal acceptance claim.

Passing exploratory execution permits nomination for stakeholder feedback. Choose feedback continuation when another slice or observation is needed; keep/drop closes that exploratory branch under the existing exploratory semantics. Independent use transcripts can also support observations without rewriting prior evidence. This package does not add general closed-experiment resumption, source exclusions, package migration or automatic promotion.

The package is a deliberately separate copy of the two small example packages, with one shared selector definition and the changes described above. This keeps its identity self-contained without adding package inheritance machinery. Evolve it from fresh operational evidence.
