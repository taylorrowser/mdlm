# Phase-hardening matrix

This matrix records every distinct reachable public `mdlm` route in the Phase 0
boundary. It describes Example Process Package behavior, not kernel semantics.
Phase 1, Phase 2, VAI, and pilot-assessment hardening remain deferred to issues
#96–#100.

## Foundation and product simplification

| Route | Exact evidence and links | Selector / Obligation; participation and Resolver | Next Operator Outcome | Budget; evidence replaced or reused |
| --- | --- | --- | --- | --- |
| Greenfield foundation | Setup commit, then current MAP, PSP, and smallest sufficient STK set | Initial foundation Obligations; autonomous authoring Scenarios | Serial **Assignment** | No correction consumed; ordinary Git commits fix each next Assignment fingerprint |
| Foundation Review passes | Exact Review Context; passing REV with `reviews` and `contextualizes` | `passing-review-required@2`; delegated `independent-reviewer` | Next foundation/context/candidate **Assignment** | Passing evidence is reused while exact dependencies do not change |
| Initial foundation Review fails | Immutable failed REV and complete findings | `foundation-review-correction-required@5`; autonomous `revise-foundation-after-review@5` | Exact subject correction **Assignment** | 0 of 2 consumed; failed Revision/context/REV retained |
| First correction fails or passes | Same-lineage replacement cites all supplied failures through `corrects-review`; fresh context and REV | `foundation-review-failures-at-stage@1`; ordinary Review Obligations | Second correction **Assignment** on fail; resumed work on pass | 1 consumed; unrelated evidence reused |
| Second correction fails or passes | Second causal replacement and fresh REV | Foundation correction/escalation Obligations | **Attention Required** on fail; resumed work on pass | 2 consumed; complete history retained |
| Stakeholder-owned foundation failure | Failed REV has `correction_authority: stakeholder` | `foundation-review-escalation-required@2`; attended `escalate-foundation-review-correction@2` | Immediate **Attention Required** | Autonomous budget untouched; attended replacement and scope DEC are new |
| Candidate creation | Frozen candidate contains every and only current reviewed MAP/PSP/STK Revision | `intent-candidate-required@2`; autonomous `create-phase-0-intent-candidate@1` | Review Context **Assignment** | Foundation Reviews reused; candidate is the earliest complete evidence-bearing set |
| Product simplification passes | Candidate REV is `simplification-product-definition`, `pass`, and has no `blocks` | `valid-product-simplification-reviews@1`; delegated `review-datum-in-context@2` | Gate **Attention Required** when Questions are closed | Candidate Review is also the dedicated simplification judgment; no duplicate ceremony |
| Product simplification fails on members | Failed candidate REV; canonical exact `blocks` names only implicated MAP/PSP/STK members; findings explain the whole blocker set | `product-simplification-blockers-for-candidate@1` and `foundation-review-correction-required@5` | One serial member correction **Assignment** | Existing foundation budget applies; unchanged members and Reviews reused |
| Product simplification fails on candidate | Failed REV canonically `blocks` the exact candidate | `intent-candidate-review-correction-required@3`; autonomous `revise-intent-candidate-after-review@3` | Superseding candidate **Assignment**, then fresh independent Review | First of two candidate cycles; all failures remain immutable |
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
`test/evaluate-bootstrap-participation.test.ts` covers exact simplification
blockers, candidate exhaustion through the same interface, Question Decision
correction, accepted-intent progression, and package-owned participation.
