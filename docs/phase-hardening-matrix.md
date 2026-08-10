# Phase-hardening matrix

This matrix records public `mdlm` operator routes as the bundled Example Process
Package is hardened. It describes package behavior, not kernel lifecycle
semantics. These Phase 0 rows cover the issue #93 bounded correction boundary;
gate rejection and correction breadth for other reachable types remain assigned
to their sibling implementation issues.

| Phase | Route | Exact evidence and links | Selector / Obligation | Participation | Resolver | Expected next Operator Outcome | Correction budget | Evidence replaced or reused |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Phase 0 | Happy initial Review | Frozen Review Context containing the exact STK Revision; passing REV with `reviews` and `contextualizes` | `passing-review-required@2` becomes satisfied | Delegated `independent-reviewer`; no stakeholder attention | `review-datum-in-context@2` | Assignment for normally reevaluated downstream work | 0 of 2 autonomous cycles consumed | Passing REV and Review Context remain reusable while exact dependencies do not change |
| Phase 0 | Initial autonomous failure | Current failed REV with blocking Review Findings and `correction_authority: autonomous`; no correction Revision yet | `initial-foundation-review-failures@1`; `foundation-review-correction-required@3` | Autonomous | `revise-foundation-after-review@3` | Fresh serial correction Assignment | 0 consumed; first replacement permitted | Failed Revision, Review Context, REV, and findings remain immutable |
| Phase 0 | First replacement | Same-lineage replacement cites every current failed REV through `corrects-review` | `correction-revisions-through@1` derives one evidence-backed replacement; ordinary context and Review Obligations apply | Autonomous context; delegated independent Review | `create-review-context@1`, then `review-datum-in-context@2` | Fresh context Assignment, then fresh Review Assignment | First cycle in progress | Only exact replacement-dependent context and Review are replaced; unrelated evidence is reused |
| Phase 0 | First replacement passes | Fresh exact passing REV for replacement | `passing-review-required@2` becomes satisfied | Delegated independent Review, then autonomous downstream work | Normal reevaluation | Assignment for blocked downstream work | 1 cycle consumed; no escalation | Corrected evidence becomes current; immutable failure history remains inspectable |
| Phase 0 | First replacement fails | Current failed first replacement with its own exact Review and findings | `first-replacement-review-failures@1`; `foundation-review-correction-required@3` remains Dispatchable | Autonomous | `revise-foundation-after-review@3` | Fresh second serial correction Assignment | 1 consumed; second replacement permitted | Initial and first-cycle histories remain immutable and reusable for explanation |
| Phase 0 | Second replacement passes | Second same-lineage replacement, fresh context, and passing independent REV | `passing-review-required@2` becomes satisfied | Delegated independent Review, then autonomous downstream work | Normal reevaluation | Assignment for blocked downstream work | 2 cycles consumed successfully; no escalation | Passing current evidence resumes work; all failed evidence remains historical |
| Phase 0 | Second replacement fails | Current failed second replacement plus three exact failed Revisions/Reviews and all findings across the lineage | `second-replacement-review-failures@1` and `exhausted-foundation-correction-lineages@1`; `foundation-review-escalation-required@1` | Attended nondelegable `stakeholder`; immediate | `escalate-foundation-review-correction@1` | **Attention Required** with exact lineage, failed Reviews/findings, and exhaustion reason | 2 consumed; autonomous budget exhausted | No historical evidence is deleted or rewritten; attended work receives the complete history |
| Phase 0 | Stakeholder-owned intent failure | Current failed REV declares `correction_authority: stakeholder` with exact findings | `stakeholder-intent-review-failures@1`; `foundation-review-escalation-required@1` | Attended nondelegable `stakeholder`; immediate | `escalate-foundation-review-correction@1` | **Attention Required** with exact lineage, Reviews/findings, and intent reason | Autonomous budget is not consumed | Existing intent and Review evidence remain immutable until attended judgment publishes exact replacement and DEC evidence |
| Phase 0 | Malformed correction response | Assignment transport contains malformed Scenario Proposal; no Lifecycle Data publishes | Assignment lease validation only; package Selectors remain unchanged | Same participation as the active Assignment | Same exact Assignment for its one malformed correction | Correction-required disposition, then same lifecycle route after valid submission | Lifecycle count unchanged | No Revision or Review evidence changes |
| Phase 0 | Lifecycle Review failure | Contract-valid failed REV publishes unchanged | Package Selectors count only `corrects-review`-backed replacement cycles, not Assignment lease attempts | Fresh delegated Review Assignment per replacement | Package correction or escalation Resolver | Assignment or Attention Required according to evidence-derived budget | Assignment malformed-attempt count unchanged | Exact failed judgment is retained |

Every expected row projects Assignment or Attention Required; none projects
Process Dead End. Continued failure after exhaustion remains attended rather than
replenishing autonomous budget.

## Executable evidence

`test/mdlm-review-correction.test.ts` drives initial success, first-cycle success,
second-cycle success, exhausted escalation, immediate stakeholder-intent
escalation, one malformed Assignment Response on each lifecycle-failed correction
Assignment, fresh serial correction and Review Assignments, and downstream resumption through the compiled `mdlm` executable in
fresh Git repositories. `mdlm next` exposes attended work's package-bound exact
inputs through lifecycle-neutral `attentionContext.exactInputs`; the package names
those inputs `subject`, `lineage`, and `failed_reviews`, so immutable Review
Findings and history remain explicit without kernel knowledge of Review or
correction semantics.
