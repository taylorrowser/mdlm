# Zero-to-assessment autonomous onboarding pilot

This report records the clean pilot requested by issue #70 and the public-process
evidence for its implemented Phase 0–2 assessment boundary. It does not alter or
reuse the earlier migration pilot. The issue's
[contract clarification](https://github.com/taylorrowser/mdlm/issues/70#issuecomment-5275328889)
retains a fresh public transaction plus compiled route evidence; it does not claim
that the stopped historical repository itself reached assessment.

## Evidence boundary

The observed repository is `mdlm-zero-to-assessment-pilot`. It began with the
exact temperature-converter prototype commit
`a8518555c2a28812ce7a9506177f9ba24fab6547`, initialized an exact selected Process
Package at `fe46a89a16836906cc4d2193ebc07d02c4099666`, and retained a clean ordinary
Git commit after every successful Scenario transaction. Its final observed commit
is `ffd58e5d7a421e2a2ccc8679d88d6e2710ef4949`.

The historical run deliberately stopped at a genuine Package Liveness Defect
after publishing five valid blocking pilot-VAI Reviews. It was not rewritten or
represented as having reached assessment. Its findings drove issues #72–#77 and
the later package-owned Correction work. Under the clarified contract, the
repaired routes are proven compositionally through the same public process rather
than by migrating or hand-editing that historical repository:

- `test/mdlm-clean-onboarding-transaction.test.ts` starts an absent destination
  with `mdlm init`, receives the first `mdlm next` Assignment, prepares and submits
  one structured Scenario Proposal, runs doctor, inspects the Lifecycle Data diff,
  makes an ordinary Git commit, and receives the next exact Assignment. A tracked
  change then proves that the allocated Assignment cannot cross the committed
  state boundary.
- `test/mdlm-review-correction.test.ts` covers clean Phase 0 progression,
  independent Review, Correction, gate rejection, same-gate return, exact
  acceptance, and derived Phase progression through the compiled `mdlm` process.
- `test/mdlm-phase-1-assurance-correction.test.ts` covers source-independent
  assurance, exact target evidence, autonomous Correction, fresh Review, and
  attended escalation through `next → scenario prepare → scenario submit`.
- `test/mdlm-phase-2-simplification.test.ts` and
  `test/req-system-decomposition.test.ts` cover the bounded Phase 2 definition,
  simplification, completion, candidate, gate, acceptance, and assessment entry.
- `test/mdlm-pilot-assessment.test.ts` covers exact assessment context, PAS,
  independent Review, Correction, attended Expansion Decision, and explicit
  Profile Boundary or Lifecycle Complete outcomes.
- `test/req-prototype-question-routing.test.ts` proves that same-lineage Question
  revision uses the supported `freeze-source-boundary@1` Scenario before the
  replacement; no Lifecycle Data is hand-edited.
- `test/req-consequential-authorization.test.ts` and the compiled journey tests
  prove that process-required authority publishes only as the Scenario's exact REV
  or DEC output.

Together these are the clarified compositional public-interface proof, not an
imperative second implementation of the declarative Process Package. The
historical observations remain immutable, while every repaired route is exercised
at the established public-process seam. The broader brand-new serial complete-
profile pilot remains the separate boundary of issue #103.

## Acceptance observations

| Issue #70 criterion | Evidence |
| --- | --- |
| Fresh installation and exact selection | `mdlm init` installs and selects `mdlm-bootstrap@0.59.0` without a package flag or descriptor edit; the onboarding test asserts the exact package and clean setup commit. |
| Work discovery through assessment | `mdlm next` selects the initial Product Wayfinding Assignment in the fresh transaction repository. The compiled public Phase 0, Phase 1, Phase 2, and pilot-assessment routes listed above derive every continuation from reevaluation rather than a runbook. |
| Public operation only | Normal progress uses only `mdlm init`, `next`, `scenario prepare`, `scenario submit`, `doctor`, read-only diff, and ordinary Git. Scenario Proposals, not Markdown edits, cross the publication seam. |
| Exact same-lineage source boundary | The package-discovered source-boundary Assignment freezes the exact source Revision before a same-lineage Question replacement. |
| Exact authority evidence | Delegated judgments publish REV; gates, implementation authority, and Expansion Decisions publish DEC. Authority Supply permits execution but never substitutes for that evidence. |
| Continuous autonomous operation | Autonomous and package-delegated/no-attention Assignments continue. The operator stops only for a projected attended Authority Requirement, explicit terminal outcome, stale or malformed Assignment, integrity failure, or genuine package failure. |
| Durable assessment report | PAS is a generated package-owned Lifecycle type over one exact frozen assessment context. Its reviewed recommendation is adopted by an exact attended Expansion Decision before the declared boundary. |

The issue text names the prototype `req next` surface. The later clean-interface
decision made `mdlm next` the canonical lifecycle-neutral operation and explicitly
dropped the old command identity; the clarified criterion follows that supported
surface without adding a compatibility alias.

## Observed measurements

The historical clean repository contains 102 ordinary Git commits from prototype
commit `a8518555c2a28812ce7a9506177f9ba24fab6547` through stopped boundary
`ffd58e5d7a421e2a2ccc8679d88d6e2710ef4949`. At that exact final commit,
`.lifecycle/data/.transactions/` contains 91 completed Scenario transactions and
`.lifecycle/data/` contains 108 exact Lifecycle Data Revision files. These exact
commit and repository paths are the audit source for the totals below.

| Measurement | Observed result |
| --- | --- |
| Review volume | 24 exact Review Contexts and 24 delegated independent REVs: 17 pass and 7 fail. |
| Delegated implementation | 6 source-independent implementation transactions, each with exact DEC authority evidence. |
| Required attended publication | 1 exact stakeholder gate transaction. |
| Stakeholder contacts | 3 observed contacts: 2 avoidable Review-permission interruptions before #72 and 1 required Phase 0 gate judgment. |
| Correction loops | 1 STK formatting replacement and fresh Review; 1 ENV replacement with fresh qualification and Review; 2 discarded pre-publication VAI proposals; 5 blocking VAI Reviews that exposed the package liveness gap. |
| Package repairs encountered | 7 exact public package migrations, from exact-primary-scope migration `42918da1db077579e9d7e181528ffd4cf03f8c47` through typed-command migration `0ab057cf849d6d9fa6476ade5f8ee926b0f842b9`. Historical package bytes and Lifecycle Data remained immutable. |
| Execution evidence | 3 RUN/RES pairs. The Fahrenheit-to-Celsius pilot result was correctly recorded as unsuitable rather than suppressed or reclassified. |
| Attention consolidation | 0 compatible checkpoint Question groups occurred in this product slice, so consolidation had no observed opportunity. Package projection of a complete Consolidation Group is covered separately in `test/evaluate-bootstrap-participation.test.ts`. |
| Scope reduction | None demonstrated. The bounded product intent stayed small, but the process did not remove a challenged item. |

## Autonomy and correction findings

Package-delegated Review became continuous after #72: fresh independent judgment
no longer requested stakeholder permission when `attention_timing` was `none`.
Failed formatting and ENV Reviews produced useful immutable evidence and then
same-lineage replacements with fresh context and Review. The five final VAI
Reviews also behaved correctly as judgments: they published blocking findings
instead of being edited or discarded. The failure was package liveness—no
Correction Resolver—not reviewer behavior.

The public target evolved because independent agents could not infer a controlled
boundary from commit identity alone. Exact repository locator, command vectors,
parameter encodings, malformed/omitted/extra argument cases, output protocol,
timeouts, termination and reaping, evidence retention, and cleanup all had to
become package-owned inputs. Two incomplete proposals were discarded before
publication, demonstrating that atomic submission prevented weak candidate
content from becoming Lifecycle Data.

## Remaining friction and recommendation

The pilot proved useful Review findings, exact authority evidence, immutable
failure history, autonomous package-delegated work, and deterministic public work
discovery. It also exposed high ceremony: one context per Review, 20 successive
ART registrations while the target contract matured, 7 package migrations, and
no observed attention-consolidation or scope-removal benefit.

The evidence supports **change**, not unqualified expansion. Retain the deep
public Assignment/publication interface and declarative liveness rules; reduce
Review and target-registration ceremony and require demonstrated scope removal
before adding Phase 3–6 breadth. Phase 3–6, production indexing, source-isolation
containers, brownfield onboarding, and broader concurrency remain deferred.
