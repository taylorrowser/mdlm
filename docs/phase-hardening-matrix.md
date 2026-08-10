# Phase-hardening matrix

This matrix records every distinct reachable public `mdlm` route in the hardened
Phase 0 and Phase 1 strategy/environment/pilot-VER boundary. It describes Example
Process Package behavior, not kernel semantics. Failed VAI procedure correction,
Phase 2, and pilot-assessment hardening remain deferred to issues #97–#100.

## Foundation and product simplification

| Route | Exact evidence and links | Selector / Obligation; participation and Resolver | Next Operator Outcome | Budget; evidence replaced or reused |
| --- | --- | --- | --- | --- |
| Greenfield foundation | Setup commit, then current MAP, PSP, and smallest sufficient STK set | Initial foundation Obligations; autonomous authoring Scenarios | Serial **Assignment** | No correction consumed; ordinary Git commits fix each next Assignment fingerprint |
| Foundation Review passes | Exact Review Context; passing REV with `reviews` and `contextualizes` | `passing-review-required@2`; delegated `independent-reviewer` | Next foundation/context/candidate **Assignment** | Passing evidence is reused while exact dependencies do not change |
| Initial foundation Review fails | Immutable failed REV and complete findings | `foundation-review-correction-required@5`; autonomous `revise-foundation-after-review@5` | Exact subject correction **Assignment** | 0 of 2 consumed; failed Revision/context/REV retained |
| First correction fails or passes | Same-lineage replacement cites all supplied failures through `corrects-review`; fresh context and REV | `foundation-review-failures-at-stage@1`; ordinary Review Obligations | Second correction **Assignment** on fail; resumed work on pass | 1 consumed; unrelated evidence reused |
| Second correction fails or passes | Second causal replacement and fresh REV | Foundation correction/escalation Obligations | **Attention Required** on fail; resumed work on pass | 2 consumed; complete history retained |
| Stakeholder-owned foundation failure | Failed REV has `correction_authority: stakeholder` | `foundation-review-escalation-required@2`; attended `escalate-foundation-review-correction@2` | Immediate **Attention Required** | Autonomous budget untouched; attended replacement and scope DEC are new |
| Failure after attended foundation correction | Attended replacement keeps every exact `corrects-review` cause and its scope DEC `justifies` that replacement; each later replacement accumulates the exact failed Reviews | Decision-backed replacement is excluded from `foundation-correction-history@1` `autonomous-corrections`; ordinary correction interface remains active | First and second autonomous correction **Assignments**, then **Attention Required** if both fresh Reviews fail | 0, then 1, then 2 autonomous cycles consumed; attended and autonomous lineage remains complete for later escalation |
| Candidate creation | Frozen candidate contains every and only current reviewed MAP/PSP/STK Revision | `intent-candidate-required@2`; autonomous `create-phase-0-intent-candidate@1` | Review Context **Assignment** | Foundation Reviews reused; candidate is the earliest complete evidence-bearing set |
| Product simplification passes | Review Context contains the candidate and every exact MAP/PSP/STK member; the independent Assignment receives every member body; candidate REV is `simplification-product-definition`, `pass`, with neither `simplification` nor `blocks` | `valid-review-contexts-for@1`, `phase-0-candidate-review-context-members@1`, and `valid-product-simplification-reviews@1`; delegated `review-datum-in-context@2` | Gate **Attention Required** when Questions are closed | Candidate Review is also the dedicated simplification judgment; no duplicate ceremony |
| Product simplification fails on a member | Failed candidate REV groups every current blocking finding under one exact `simplification.target`; its sole canonical `blocks` link names that same MAP/PSP/STK member | `valid-product-simplification-reviews@1`, `product-simplification-blockers-for-candidate@1`, and `foundation-review-correction-required@5` | One serial member correction **Assignment** | Existing foundation budget applies; unchanged members and Reviews reused; a distinct target is surfaced by the fresh complete-set Review |
| Product simplification fails on candidate | Failed REV groups its blocking findings under the exact candidate target and has one matching `blocks` link | `intent-candidate-review-correction-required@3`; autonomous `revise-intent-candidate-after-review@3` | Superseding candidate **Assignment**, then fresh independent Review | First of two candidate cycles; all failures remain immutable |
| Stakeholder-owned candidate simplification failure | Current blocking candidate REV also declares `correction_authority: stakeholder` | `intent-candidate-correction-participation@1` selects attended `revise-intent-candidate-after-review@3` through the existing correction Obligation | Immediate **Attention Required** | Exact failed REV and initial lineage are supplied; the Decision-backed attended replacement is excluded from `autonomous-corrections`, preserving both autonomous cycles |
| Simplification pass carries a blocker | `pass` plus `simplification` or any `blocks` link | REV schema plus `valid-product-simplification-reviews@1` | Invalid proposal; same Assignment receives contract diagnostics | Nothing publishes or consumes lifecycle correction budget |
| Simplification fail omits a blocker | `fail` without the structured target/findings or without exactly one matching `blocks` link | REV schema plus `valid-product-simplification-reviews@1` | Invalid proposal; same Assignment receives contract diagnostics | Nothing publishes; prior candidate and Reviews remain reusable |
| Simplification blocker is out of scope or mismatched | Structured target and link differ, or target is neither the candidate nor one of its exact members | `invalid-product-simplification-blockers-for-review@1` and `valid-product-simplification-reviews@1` | Invalid proposal; no Correction is derived | Nothing publishes; no wrong-subject correction can become actionable |
| Corrected member set | Every blocked member has a causal replacement and fresh passing Review | Candidate correction remains blocked until exact member correction and Review complete | Superseding candidate **Assignment** | Changed members/contexts/Reviews replaced; unaffected set evidence reused |
| Candidate first or second correction passes | Superseding BSL cites complete failed-Review history through `corrects-review`; fresh simplification REV passes | `review-correction-history-for@1`; normal gate reevaluation | Same Phase 0 gate **Attention Required** | 1 or 2 cycles consumed successfully; history retained |
| Candidate first correction fails | Fresh failed simplification REV on first replacement | Candidate correction Policy remains autonomous | Second candidate correction **Assignment** | 1 consumed; exact lineage and findings supplied |
| Candidate second correction fails | Current candidate has two `corrects-review`-backed correction Revisions and another failed REV | `intent-candidate-correction-participation@1` on the same correction Obligation/Scenario | Immediate stakeholder **Attention Required** | 2 autonomous cycles exhausted; no parallel escalation module; attended scope DEC is required authority evidence |

## Questions and Decision Review

| Route | Exact evidence and links | Selector / Obligation; participation and Resolver | Next Operator Outcome | Budget; evidence replaced or reused |
| --- | --- | --- | --- | --- |
| Blocking preferential Question | Open QST has exact `blocks` target | `open-question-resolution@3`; attended stakeholder `resolve-question@2` | Immediate **Attention Required** | Source first freezes; raw conversation remains ephemeral |
| Nonblocking preferential Question | QST declares `phase-0-gate` and `phase-0-stakeholder-questions` | Package checkpoint and Consolidation Group | Other **Assignments**, then one checkpoint **Attention Required** conversation | Serial QST publication reevaluates later Questions |
| Empirical evidence available | QST declares available evidence | Question Policy; autonomous `resolve-question@2` | Evidence resolution **Assignment** | Frozen source and resulting QST Revision retained |
| Prototype-bound empirical Question | Frozen QST declares exact Git prototype contract | `prototype-question-resolution@1`; autonomous prototype Resolver | Evidence **Assignment** | ART, finding DEC, and QST publish atomically |
| Empirical evidence unavailable | Open empirical QST lacks evidence | Ready low-priority `open-question-resolution@3`; attended/delegable evidence provider | Immediate **Attention Required** or typed inability | No unsupported conclusion publishes |
| Formal deferral | QST declares `defer`; replacement has reactivation condition and exact deferral DEC | Question Policy; attended stakeholder then delegated Decision Review | Attention, then Review **Assignment** | Scheduling is not deferral; exact source and disposition retained |
| Cancellation / unsupported disposition | QST declares `cancel`; exact cancellation DEC | Question Policy; attended stakeholder then delegated Decision Review | Attention, then explicit closed route after Review | Unsupported work closes explicitly, never by null/dead end |
| Preferential answer | Answered QST and exact scope DEC linked through `resolves` | Applicable-answer Selector; delegated Decision Review | Serial Review **Assignment** | Conversation omitted; normalized evidence exact |
| Question Decision Review fails | Failed REV over scope/deferral/cancellation DEC | `question-decision-review-correction-required@1`; attended `revise-question-decision-after-review@1` | Immediate **Attention Required**, then fresh Review | Replacement preserves kind/scope and cites complete failure history |
| Question Decision failure continues | Two causal DEC replacements and another failed REV | Same correction Obligation/Scenario reports exhausted lineage | Immediate **Attention Required** | No disposition applies until a fresh passing Review; no alternate recovery path |

## Gate, acceptance, and progression

| Route | Exact evidence and links | Selector / Obligation; participation and Resolver | Next Operator Outcome | Budget; evidence replaced or reused |
| --- | --- | --- | --- | --- |
| Gate approval recorded | Gate DEC is `approve` and `justifies` the exact candidate | `candidate-gate-signoff@3`; attended `record-gate-signoff@3` | Gate Decision Review Context **Assignment** | Candidate/simplification evidence reused |
| Gate Decision Review fails | Failed REV over current gate DEC | `gate-signoff-review-correction-required@2`; attended `revise-gate-signoff-after-review@2` | Immediate **Attention Required**, then fresh Review | Same-lineage DEC preserves scope and cites complete failed-Review history |
| Gate Decision failures continue | Two causal replacements and another failed REV | Same attended correction interface reports exhausted lineage | Immediate **Attention Required** | No parallel recovery route; exact candidate scope retained |
| Reviewed gate rejection | Passing Review of `reject` DEC; canonical exact `blocks`; complete findings | Reviewed-rejection Selectors; normal correction reevaluation | Exact member or candidate correction **Assignment** | Rejection is immutable non-approval and consumes no Review-correction cycle |
| Rejected member correction | MAP/PSP/STK replacement cites rejection through `corrects-gate-rejection`; fresh ordinary Review | Foundation correction and Review Obligations | Serial correction/context/Review **Assignments** | Unaffected candidate evidence reusable |
| Rejection after exhausted member correction | Current MAP/PSP/STK has two prior causal Review corrections; reviewed rejection names it through `blocks` | `foundation-review-escalation-required@2`; attended `escalate-foundation-review-correction@2` receives the exact rejection | Immediate **Attention Required**, then fresh context/Review after attended replacement | Rejection does not reset or consume Review-correction budget; replacement must cite it through `corrects-gate-rejection` |
| Replacement after rejection | Superseding candidate cites every rejection, preserves all old evidence, and uses current reviewed members | `complete-superseding-intent-candidates-for@1`; candidate correction Scenario | Fresh candidate simplification Review **Assignment** | Rejection and unaffected evidence retained |
| Same-gate return | Replacement simplification REV passes | `candidate-gate-signoff@3` | **Attention Required** at the same gate | No hidden return cursor or Phase restart |
| Stop, defer, or cancel gate work | Separate exact reviewed terminal DEC | Explicit package disposition route, never rejection alone | Only its declared terminal outcome | Rejection and terminal Decision remain separate claims |
| Accepted intent | Frozen `intent-approved` BSL exactly `promotes` approved candidate and contains candidate simplification REV, approving DEC, and DEC Review | `intent-approval-required@1`; autonomous `accept-phase-0-intent@1` | Acceptance **Assignment**, then Phase 1 work | Mechanical publication reuses reviewed authority; no redundant judgment |
| Phase progression | Accepted intent and applicable approving gate evidence both exist | Phase 0 readiness/authorization expressions | Phase 1 **Assignment** | Active Phase is derived; no mutable pointer or second approval |

## Phase 1 strategy and assurance correction

| Route | Exact evidence and links | Selector / Obligation; participation and Resolver | Next Operator Outcome | Budget; evidence replaced or reused |
| --- | --- | --- | --- | --- |
| VSP authored | Current accepted-intent STK Revisions; VSP carries Stable `governs` and exact `governs-revision` | `verification-strategy-required@1`, then ordinary context/Review Obligations | VSP context and independent Review **Assignments** | Downstream ENV and pilot VER fan-out waits for passing VSP Review |
| Initial VSP Review fails | Immutable exact VSP, context, and every current failed REV/Finding | `verification-strategy-review-correction-required@2`; autonomous `revise-verification-strategy-after-review@2` | Exact VSP correction **Assignment** | 0 of 2 consumed; accepted intent and unrelated Reviews reused |
| Corrected VSP fails or passes | Same-lineage VSP cites every failed Review of the exact Revision being corrected; fresh exact context and REV | `review-correction-history-for@1`; ordinary Review Obligations | Second correction **Assignment** on fail; dependent assurance on pass | 1 consumed; failed history retained; old exact-strategy-dependent ENV evidence is not silently rebound |
| VSP second correction fails | Third failed REV after two causal autonomous replacements | `phase-1-assurance-correction-participation@1` on the same correction Scenario | Immediate stakeholder **Attention Required** with complete lineage/findings | 2 consumed; attended replacement requires exact scope DEC authority evidence |
| Initial ENV Review fails | Exact failed ENV and Review plus its one exact VSP | `environment-review-correction-required@2`; autonomous `revise-environment-assurance-after-review@2` | Exact ENV/qualification correction **Assignment** | 0 of 2 consumed; old ENV, qualification, RUN/RES, context, and REV remain immutable |
| Corrected ENV assurance | Same-lineage ENV cites every failed Review of the exact Revision being corrected; fresh qualification VER/VAI point only to replacement | Environment correction completion plus `verification-run-required@1` and exact context selectors | Fresh qualification run **Assignment**, then fresh context and independent Review **Assignments** | Prior RUN/RES cannot qualify replacement; unrelated requirement/VSP evidence reused |
| ENV first or second replacement fails | Fresh exact context and failed ENV REV over replacement | Shared Phase 1 correction Policy and ENV correction Scenario | Next autonomous correction, then **Attention Required** after cycle two | Same 0/1/2 budget; each replacement rebuilds qualification claims rather than borrowing evidence |
| Initial pilot VER Review fails | Exact requirement/VSP boundary and every current failed pilot VER REV/Finding | `pilot-verification-activity-review-correction-required@2`; autonomous `revise-pilot-verification-activity-after-review@2` | Exact pilot VER correction **Assignment** | 0 of 2 consumed; target and qualified ENV evidence remain reusable because their exact dependencies did not change |
| Corrected pilot VER fails or passes | Same-lineage pilot VER retains exact claim class, requirement, and strategy links and cites every failed Review of the exact Revision being corrected | Shared correction history and Phase 1 participation Policy plus ordinary Review Obligations | Second correction **Assignment** on fail; implementation work on pass | Fresh context/REV replace only changed VER judgment; ENV/ART evidence reused |
| Pilot VER second correction fails | Two causal autonomous replacements and another exact failed REV | Same correction Scenario under attended participation | Immediate stakeholder **Attention Required** | 2 consumed; no VAI correction is fabricated because issue #97 owns that deferred route |
| Stakeholder-owned assurance finding | Current failed REV declares `correction_authority: stakeholder` | Shared correction participation default and exact type-specific Scenario | Immediate stakeholder **Attention Required** | Autonomous budget untouched; attended correction requires scope DEC |
| Missing causal Review link or changed boundary | Proposed replacement omits a prior/current REV, cites an unrelated REV, changes lineage, or changes required exact bindings | Source-owned type links, Scenario required links, and correction completion Selectors | Invalid proposal; same Assignment gets contract diagnostics | Nothing publishes; malformed transport attempts do not consume lifecycle budget |

## Phase 1 evidence availability and supported boundary

| Route | Exact evidence and links | Selector / Obligation; participation and Resolver | Next Operator Outcome | Budget; evidence replaced or reused |
| --- | --- | --- | --- | --- |
| No pilot target yet | Current pilot VER and exact requirement have no boundary-complete ART | `pilot-target-required@1`; autonomous `register-pilot-target@1` | Target-registration **Assignment** | Existing requirement/VSP/VER/ENV evidence reused; typed inability publishes nothing |
| Intentionally unsupported target behavior | ART records bounded supported and intentionally unsupported behavior plus exact public invocation/rejection protocol | Target and implementation Selectors; normal VAI/run Obligations | Source-independent implementation/run **Assignments** | Unsupported behavior is positive discrimination evidence, not a terminal disposition |
| Empirical evidence unavailable | Open empirical QST has no available evidence | Source-boundary and `open-question-resolution@3`; attended/delegable evidence-provider participation | Source-freeze **Assignment**, then immediate **Attention Required** or typed inability | No unsupported conclusion publishes; explicit defer/cancel requires reviewed DEC |
| Multiple applicable VSPs, ENVs, or pilot targets | More than one exact current candidate | Bootstrap Profile `terminal_outcomes.profile_boundary` condition | **Profile Boundary Reached** after any other runnable work drains | Explicitly unsupported in this narrow profile; no arbitrary evidence selection and no Process Dead End |
| Missing or incomplete target boundary | ART lacks immutable commit observation, supported/unsupported bounds, typed command encoding, isolation, or exact observation protocol | ART schema and `register-pilot-target@1` completion | Invalid proposal or fresh registration **Assignment** | Incomplete ART is not eligible and cannot leak into VAI work |

## Transport and liveness invariants

| Route | Expected result | Evidence behavior |
| --- | --- | --- |
| Malformed Assignment Response | One correction-required response retaining the same Assignment; second malformed response exhausts it | No Lifecycle Data publishes and lifecycle correction counts do not change |
| Typed inability | Assignment is consumed and orchestration stops truthfully; a deliberate later `next` may allocate fresh work | No Lifecycle Data publishes |
| Ordinary publication | `scenario submit`, doctor/diff, and ordinary Git commit precede the next Assignment | Transaction is atomic; ignored leases never become Lifecycle Data |
| Every expected unfinished Phase 0 state | **Assignment** or **Attention Required** | No expected Phase 0 route projects null or Process Dead End |

## Executable evidence

`test/mdlm-review-correction.test.ts` drives the compiled `mdlm` executable from
`mdlm init` through ordinary Git commits, failed Review correction, candidate-
centered simplification, reviewed gate rejection, exact member correction, fresh
simplification, same-gate approval, accepted intent, and derived Phase 1 entry.
`test/mdlm-phase-1-assurance-correction.test.ts` drives VSP, ENV, and pilot VER
replacement, exact causal-link rejection, fresh ENV qualification output,
unaffected evidence reuse, exhausted-budget attention, self-contained attended
packets, and each VSP/ENV/target ambiguity through `mdlm next`, `scenario prepare`,
and `scenario submit`, including proof that an attended Phase 1 replacement does
not consume either autonomous correction cycle.
`test/evaluate-bootstrap-participation.test.ts` covers exact simplification
blockers, immediate stakeholder-owned candidate attention with preserved budget,
candidate exhaustion through the same interface, Question Decision correction,
accepted-intent progression, and package-owned participation.
