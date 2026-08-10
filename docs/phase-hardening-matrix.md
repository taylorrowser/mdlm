# Phase-hardening matrix

This matrix records reachable public `mdlm` routes for the bundled Example
Process Package. It describes package behavior, not kernel lifecycle semantics.
Phase 1, Phase 2, VAI, and pilot-assessment hardening remain deferred to issues
#96–#100.

## Phase 0 foundation, simplification, and Review correction

| Route | Exact evidence and links | Selector / Obligation | Participation and Resolver | Expected next Operator Outcome | Correction budget | Evidence replaced or reused |
| --- | --- | --- | --- | --- | --- | --- |
| Greenfield foundation | `mdlm init` setup commit, then MAP, PSP, and smallest sufficient STK set | `initial-wayfinding-map-required@1`, `product-specification-required@1`, `stakeholder-requirements-required@1` | Autonomous package Resolvers | Serial **Assignment** | Not started | Each ordinary Git commit fixes the next Assignment fingerprint; no operational lease is Lifecycle Data |
| Happy subject Review | Frozen exact Review Context and passing REV with `reviews` and `contextualizes` | `review-context-required@2`, `passing-review-required@2` | Delegated `independent-reviewer` | **Assignment** for the next exact subject or simplification context | 0 of 2 | Passing evidence is reused while exact dependencies do not change |
| Initial subject Review failure | Failed REV with exact blocking Findings | `foundation-review-correction-required@5` | Autonomous `revise-foundation-after-review@5` | Subject-bounded correction **Assignment** | 0 consumed | Failed Revision, context, REV, and Findings remain immutable |
| First correction passes | Same-lineage replacement cites every failed REV through `corrects-review`; fresh context and passing REV | `foundation-correction-history@1`, ordinary Review Obligations | Autonomous correction, delegated fresh Review | **Assignment** for resumed downstream work | 1 consumed | Unaffected evidence is reused; only replacement-dependent context and Review change |
| First correction fails | First replacement receives a fresh failed REV | `foundation-review-failures-at-stage@1(stage: "first-replacement")` | Autonomous correction | Second correction **Assignment** | 1 consumed | Initial and first-cycle history remains immutable |
| Second correction passes | Second causal replacement, fresh context, passing REV | `passing-review-required@2` | Delegated Review | **Assignment** for resumed work | 2 consumed successfully | Current passing evidence resumes work; all failures remain historical |
| Second correction fails | Three failed exact subject Revisions/Reviews and complete Findings | `foundation-review-escalation-required@2` | Attended nondelegable stakeholder; `escalate-foundation-review-correction@2` | Immediate **Attention Required** | 2 consumed; exhausted | Complete immutable lineage is supplied; escalation publishes a causal replacement and exact DEC |
| Stakeholder-owned intent failure | Failed REV has `correction_authority: stakeholder` | `foundation-review-escalation-required@2` | Attended stakeholder | Immediate **Attention Required** | Autonomous budget not consumed | Existing intent remains immutable until attended replacement and DEC evidence publish |
| Product simplification ready | One frozen context contains every and only current reviewed MAP, PSP, and STK Revision | `product-simplification-context-required@1`, `product-simplification-required@1` | Autonomous context preparation, then delegated `simplify-product-definition@1` | Context **Assignment**, then independent simplification **Assignment** | Review budget unchanged | Individual Reviews and exact definition members are reused |
| Product simplification passes | REV has `review_kind: simplification-product-definition`, no `blocks`, and `outcome: pass` | `product-simplification-reviews-for@1` | Delegated independent reviewer | Candidate-construction **Assignment** | Review budget unchanged | Passing simplification REV becomes candidate evidence |
| Product simplification fails | Failed simplification REV links canonical exact MAP/PSP/STK blockers through `blocks`; Findings retain exact targets | `blocking-product-simplification-reviews-for@1`, `foundation-review-correction-required@5` | One autonomous correction Assignment per exact blocker | Serial subject correction **Assignment**, never candidate work | Existing two-cycle subject budget | Failed set Review remains immutable; only blocked subjects, dependent contexts, and Reviews are replaced |
| Corrected simplified set | Every blocked subject has causal replacement and fresh ordinary Review; a new exact set context receives fresh simplification Review | Current-context and simplification Selectors | Autonomous context, delegated Reviews | Candidate **Assignment** only after fresh pass | Per-subject budgets retained | Unchanged subjects and Reviews are reused; stale set context is replaced |

## Questions and attention

| Route | Exact evidence and links | Selector / Obligation | Participation and Resolver | Expected next Operator Outcome | Correction budget | Evidence replaced or reused |
| --- | --- | --- | --- | --- | --- | --- |
| Blocking preferential Question | Open QST has exact `blocks` target | `open-question-resolution@3` and `question-participation@1` | Attended nondelegable stakeholder | Immediate **Attention Required** | Decision Review budget not started | Source QST is first frozen by `source-boundary-required@1` |
| Nonblocking preferential Question | QST declares `phase-0-gate` and `phase-0-stakeholder-questions` | Package checkpoint readiness and Consolidation Group projection | Attended stakeholder checkpoint | Other **Assignments** continue; then one checkpoint **Attention Required** conversation | Per normalized Decision | Raw conversation remains ephemeral; serial exact QST/DEC outputs publish after reevaluation |
| Empirical evidence available | QST declares `evidence_available: true` | `open-question-resolution@3` | Autonomous `resolve-question@2` | Resolution **Assignment**; immediate when it blocks exact work | Not applicable | Exact frozen source and resulting QST Revision are retained |
| Prototype-bound empirical Question | Frozen source QST declares exact Git prototype evidence contract | `prototype-question-resolution@1` | Autonomous `resolve-question-with-prototype@2` | Evidence-work **Assignment** | Not applicable | ART, finding DEC, and answered QST publish atomically; unsupported prototype behavior remains explicit |
| Empirical evidence unavailable | Open empirical QST lacks available evidence | Ready low-priority route in `open-question-resolution@3`; `question-participation@1` | Delegable attended `evidence-provider` | Immediate **Attention Required** for evidence work | Not applicable | No unsupported conclusion is inferred |
| Formal deferral | QST declares `resolution_disposition: defer`; resulting QST has reactivation condition and exact deferral DEC | `applicable-question-dispositions-for@1` | Immediate attended stakeholder, then delegated Decision Review | **Attention Required**, Review **Assignment**, then reevaluation | Decision Review correction is bounded | Original and deferred QST Revisions remain immutable; deferral is not checkpoint scheduling |
| Cancellation / unsupported disposition | QST declares cancellation and exact cancellation DEC | `applicable-question-dispositions-for@1` | Immediate attended stakeholder, then delegated Decision Review | **Attention Required**, Review **Assignment**, then explicit closed route | Decision Review correction is bounded | Unsupported work is closed explicitly rather than becoming a dead end |
| Preferential answer | Answered QST and exact scope DEC linked through `resolves` | `applicable-question-answers-for@1` | Checkpoint or immediate stakeholder, then delegated Decision Review | Serial answer publication and Review **Assignments** | Decision Review correction is bounded | Conversation is not stored; normalized evidence is exact |
| Question Decision Review fails | Failed Review of scope, deferral, or cancellation DEC | `question-decision-review-correction-required@1` | Attended `revise-question-decision-after-review@1`; fresh delegated Review | Immediate **Attention Required**, then fresh Review **Assignment** | Two causal replacement cycles | Failed Decisions/Reviews remain immutable; replacement preserves kind and exact QST scope through `corrects-review` |
| Question Decision correction exhausts | Current Decision still fails after two causal replacements | Higher-priority exhausted route in `question-decision-review-correction-required@1` | Attended `revise-question-decision-after-review@1` with the complete lineage | Immediate **Attention Required** | 2 consumed; exhausted | No parallel recovery path is introduced; no disposition applies without a fresh passing Review |

## Candidate, gate, acceptance, and progression

| Route | Exact evidence and links | Selector / Obligation | Participation and Resolver | Expected next Operator Outcome | Correction budget | Evidence replaced or reused |
| --- | --- | --- | --- | --- | --- | --- |
| Candidate construction | Frozen candidate contains every and only current MAP/PSP/STK member and the current passing simplification REV as evidence | `intent-candidate-required@3`, `complete-phase-0-intent-candidates@1` | Autonomous `create-phase-0-intent-candidate@2` | Candidate Review Context **Assignment** | Candidate budget not started | Foundation and simplification evidence is reused exactly |
| Candidate Review passes | Fresh context and passing REV for exact candidate | Ordinary Review Obligations | Delegated independent Review | Gate **Attention Required** after blockers close | 0 of 2 | Member and simplification Reviews remain reusable |
| Candidate Review fails | Failed candidate REV; replacement BSL cites every failed REV via `corrects-review` and `supersedes` | `intent-candidate-review-correction-required@3` | Autonomous `revise-intent-candidate-after-review@3` | Causal replacement **Assignment**, then fresh Review | Two autonomous cycles | Every unaffected member/evidence item is preserved |
| Candidate Review correction exhausts | Current candidate fails after two causal replacement cycles | `intent-candidate-review-escalation-required@1` | Attended `escalate-intent-candidate-review-correction@1` | Immediate **Attention Required** | 2 consumed; exhausted | Complete candidate lineage and Findings are retained; attended DEC records scope authority |
| Gate approval recorded | Gate-signoff DEC has `gate_outcome: approve` and exact candidate `justifies` | `candidate-gate-signoff@3` | Attended stakeholder `record-gate-signoff@3` | Gate Decision Review Context **Assignment** | Gate Decision budget not started | Candidate remains immutable |
| Gate Decision Review fails | Same-lineage replacement DEC preserves exact scope/`justifies` and cites every failed REV | `gate-signoff-review-correction-required@2` | Attended `revise-gate-signoff-after-review@2`, then delegated Review | Immediate **Attention Required**, then fresh Review **Assignment** | Two causal attended cycles | Failed gate Decisions and Reviews remain immutable |
| Gate Decision correction exhausts | Current gate DEC still fails after two causal replacements | Higher-priority exhausted route in `gate-signoff-review-correction-required@2` | Attended `revise-gate-signoff-after-review@2` with the complete lineage | Immediate **Attention Required** | 2 consumed; exhausted | No parallel recovery path is introduced; candidate scope remains exact |
| Reviewed gate rejection | Passing Review of rejection DEC; canonical exact `blocks` and structured findings | `reviewed-gate-rejections-for-candidate@1` | Autonomous exact blocker correction | One implicated member/candidate **Assignment** | Gate rejection does not consume Review budget | Rejected candidate, DEC, Review, rationale, and Findings remain immutable |
| Rejected member correction | MAP/PSP/STK replacement cites rejection with `corrects-gate-rejection`, then fresh ordinary and product-simplification Reviews | Foundation correction and simplification Obligations | Autonomous correction; delegated Reviews | Serial correction/context/Review **Assignments** | Ordinary failed-Review budget applies only if fresh Review fails | Unaffected candidate evidence is reusable; changed set evidence is replaced |
| Replacement candidate | Same-lineage candidate cites `supersedes`, every rejection, every candidate Review failure, current simplification, and preserves unaffected evidence | `complete-superseding-intent-candidates-for@1` | Autonomous candidate correction | Fresh candidate Review **Assignment** | Candidate Review budget applies | Rejection history remains non-approval evidence |
| Same-gate return | Passing replacement candidate Review | `candidate-gate-signoff@3` | Attended stakeholder | **Attention Required** at the same Phase 0 gate | Budgets unchanged | No hidden return cursor; reevaluation selects the same gate |
| Accepted intent | Frozen `intent-approved` BSL exactly promotes the approved candidate and contains exact candidate/gate Review evidence | `intent-approval-required@1`, `phase-0-intent-approvals-for@1` | Autonomous `accept-phase-0-intent@1`; no redundant authority | Acceptance **Assignment**, then Phase 1 **Assignment** | Not applicable | Candidate, approval DEC, and Reviews are reused as exact immutable evidence |
| Phase progression | Accepted intent exists and exact approving gate evidence is applicable | Phase 0 progression declaration | Existing reviewed gate authority; no second stakeholder decision | Phase 1 **Assignment** | Not applicable | Active Phase is derived; no mutable pointer is authoritative |
| Stop, defer, or cancel gate work | Separate exact reviewed terminal DEC, never rejection alone | Package disposition/terminal Selectors | Attended stakeholder | Only its explicitly declared terminal outcome | Not inferred from rejection or retries | Rejection and terminal Decision remain separate claims |

## Transport and liveness invariants

| Route | Expected result | Evidence behavior |
| --- | --- | --- |
| Malformed Assignment Response | One `correction-required` result retaining the same Assignment; second malformed response exhausts it | No Lifecycle Data changes; lifecycle correction budgets do not change |
| Typed inability | Assignment is consumed and orchestration stops truthfully; a later deliberate `mdlm next` may allocate fresh work | No Lifecycle Data publishes |
| Ordinary publication | `mdlm scenario submit`, doctor/diff, and ordinary Git commit precede the next Assignment | Successful transaction publishes atomically; ignored leases never enter authoritative history |
| Every expected unfinished Phase 0 state | **Assignment** or **Attention Required** | No reachable expected Phase 0 route projects null or Process Dead End |

## Executable evidence

`test/mdlm-review-correction.test.ts` drives the compiled `mdlm` executable from
`mdlm init` through ordinary Git commits, exact correction, earliest product
simplification, reviewed rejection, renewed simplification, same-gate approval,
accepted intent, and derived Phase progression. It also covers malformed
Assignment Response correction independently from lifecycle budgets.
`test/req-phase-0-wayfinding.test.ts` covers the complete exact Phase 0 data and
evidence chain. `test/evaluate-bootstrap-participation.test.ts` covers exact
simplification blocker routing, authority evidence, question participation, gate
correction, and package-owned liveness conclusions at the deterministic evaluator
seam.
