# Phase-hardening matrix

This matrix records public `mdlm` operator routes as the bundled Example Process
Package is hardened. It describes package behavior, not kernel lifecycle
semantics. The initial rows cover the issue #92 Phase 0 STK Review correction
boundary; later negative routes remain deferred to their own implementation
issues.

| Phase | Route | Exact evidence and links | Selector / Obligation | Participation | Resolver | Expected next Operator Outcome | Correction budget | Evidence replaced or reused |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Phase 0 | Happy Review | Frozen Review Context containing the exact STK Revision; passing REV with `reviews` to that Revision and `contextualizes` to that context | `passing-review-required@2` becomes satisfied | Delegated `independent-reviewer`; no stakeholder attention | `review-datum-in-context@2` | Assignment for the next normally reevaluated Phase 0 Obligation | Not consumed | Exact passing REV and Review Context remain reusable while their declared dependencies do not change |
| Phase 0 | Failed Review | Current failed REV with one or more blocking Review Findings, `reviews` to one exact STK Revision, and `contextualizes` to its frozen context | `failed-phase-0-foundation-revisions@1` selects the subject; `foundation-review-correction-required@2` is Dispatchable | Autonomous correction | `revise-foundation-after-review@2` | One correction Assignment for one exact Stable Datum lineage, with every current failed REV bound as input | Initial correction route only; multi-cycle budget and escalation are deferred | Failed Revision, Review Context, and REV remain immutable historical evidence |
| Phase 0 | Corrected Revision | Next STK Revision in the same Stable Datum lineage; inherited `corrects-review` links cite every bound failed REV; inherited `changed-under` remains distinct and unused | The failed Revision is no longer current; ordinary `review-context-required@2` selects the replacement | Autonomous context creation | `create-review-context@1` | Assignment for a fresh exact Review Context | No imperative retry or return cursor | Only evidence selected from exact replacement dependencies requires fresh publication; unrelated passing Reviews are reused |
| Phase 0 | Resumed after Review | Fresh Review Context for the replacement and fresh passing REV from an independent reviewer | `passing-review-required@2` becomes satisfied for the replacement; blocked `intent-candidate-required@1` becomes ready through reevaluation | Delegated `independent-reviewer` for Review, then autonomous downstream work | `review-datum-in-context@2`, followed by `create-phase-0-intent-candidate@1` | Assignment for candidate construction | Further failed replacement cycles and attended escalation are deferred | Replacement Review evidence is current; unaffected MAP and PSP evidence remains reusable |

## Executable evidence

`test/mdlm-review-correction.test.ts` drives the happy, failed, corrected, and
resumed observations through the compiled `mdlm` executable, fresh temporary Git
repository, `next → scenario prepare → scenario submit`, ordinary commits, and
normal reevaluation. It also verifies the shared requirement link contracts,
complete blocking finding input, same-lineage Revision advance, immutable failed
evidence, fresh independent Review, and downstream resumption.
