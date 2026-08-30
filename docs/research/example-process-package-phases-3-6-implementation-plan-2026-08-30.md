# Example Process Package Phases 3 through 6 implementation plan

Status: implementation-readiness audit dated 2026-08-30. This is planning
evidence. It does not satisfy the Phase 2 reliability gate or authorize a
package change.

## Finding

The full-V extension is ready to split into dependency-ordered tickets, but it
is not ready to implement. GitHub issue
[#222](https://github.com/taylorrowser/mdlm/issues/222) still requires two
distinct fresh products to complete Phase 2 under one exact reviewed release
identity. The Phase 2 representative-pilot route remains open in
[#439](https://github.com/taylorrowser/mdlm/issues/439) and draft
[PR #441](https://github.com/taylorrowser/mdlm/pull/441); its current public
proof is blocked by kernel issue
[#464](https://github.com/taylorrowser/mdlm/issues/464). The related
per-strategy fanout reduction remains open in
[#446](https://github.com/taylorrowser/mdlm/issues/446) and draft
[PR #448](https://github.com/taylorrowser/mdlm/pull/448). Finish those streams
and collect #222's evidence before opening Phase 3 implementation.

The narrow Phase 3 tracer and the complete Phase 3 goal are different releases.
The tracer proves accepted SYS to reviewed CMP definition and gate behavior. A
second increment adds the representative component pilot and formal CMP VER
coverage required by the accepted process overview. Combining them would hide
whether failures belong to decomposition or verification.

This follows [ADR 0002](../adr/0002-keep-lifecycle-structure-out-of-mdlm-core.md).
Lifecycle structure stays in declarative package data. No phase datum, mutable
cursor, runner protocol, coordinator, or V-model type check belongs in the
kernel.

## Audited source and current inventory

The source baseline is `origin/main` commit
`7f9db37b20e6013ff3e94b6e5c6b5659a8683ca6`, tree
`f4e0486108b802be5cc3e45a754fa0e76d10c1e2`. It contains
`mdlm-bootstrap@0.97.0` and `bootstrap@43`.

| Catalog | Current | Missing full-V inventory |
| --- | ---: | --- |
| Types | 21 | `CMP`, `DES` |
| Phases | 5 | `phase-3-component-definition`, `phase-4-design-definition`, `phase-5-implementation`, `phase-6-verification` |
| Scenarios | 71 | Definition-level CMP/DES authoring, implementation, formal assessment, promotion, and final acceptance contracts listed below |
| Obligations | 68 | CMP/DES definition and verification, implementation readiness, formal execution, promotion, and final acceptance rules listed below |
| Selectors | 409 | CMP/DES discovery, implementation coverage, and formal-evidence currentness selectors |
| Policies | 16 | None currently justified |
| States | 6 | None currently justified |

The profile enables `MAP`, `QST`, `DEC`, `ART`, `PSP`, `STK`, `SYS`, `ASP`,
`ICSP`, `DWP`, `VSP`, `ENV`, `VER`, `VAI`, `RUN`, `RES`, `REV`, `BSL`, `PRB`,
`CHG`, and `PAS`. It enables Phase 0, Phase 1, Phase 2 system definition, Phase 2
pilot assessment, and the narrow Phase 7 route. It explicitly disables
component and design decomposition, formal verification execution, and
component and design implementation. See the current
[manifest](https://github.com/taylorrowser/mdlm/blob/7f9db37b20e6013ff3e94b6e5c6b5659a8683ca6/.lifecycle/process/manifest.yaml),
[profile](https://github.com/taylorrowser/mdlm/blob/7f9db37b20e6013ff3e94b6e5c6b5659a8683ca6/.lifecycle/process/profiles/bootstrap.yaml),
and [package README](https://github.com/taylorrowser/mdlm/blob/7f9db37b20e6013ff3e94b6e5c6b5659a8683ca6/.lifecycle/process/README.md).

The accepted target is the Phase 3 through 6 portion of
[the v0.8 process overview](../mdlm-process-overview-v0.8.md). Evidence
separation and implementation order come from
`docs/research/v-model-verification-and-implementation-sequence-2026-08-28.md`.
The current package route and fanout limits come from
[the post-0.86 architecture scout](https://github.com/taylorrowser/mdlm/blob/7f9db37b20e6013ff3e94b6e5c6b5659a8683ca6/docs/handoffs/full-v-package-architecture-after-0.86.md).
The older
`docs/research/phase-3-smallest-tracer-2026-08-28.md` note still owns the tracer
boundary, but its group-candidate step is stale. Current main uses one direct
level candidate for one coherent definition set.

## Exact contract gaps

These names define the ticket boundaries. When an existing definition can be
widened without making its output ambiguous, widen and version it instead of
adding the named replacement. Never keep both versions of the same behavior.

| Increment | New Scenario contracts | New Obligation contracts | Gate or terminal contract |
| --- | --- | --- | --- |
| Phase 3 definition tracer | `define-component-architecture`, `define-component-verification-strategy`, `create-component-level-candidate` | `component-architecture-required`, `component-verification-strategy-required`, `component-level-candidate-required` | Reuse `candidate-gate-signoff@3` and `record-gate-signoff@3`; stop at a declared Profile Boundary and do not publish a second accepted SYS baseline |
| Complete Phase 3 | Component forms of `write-verification-activity`, `build-pilot-control-prototype`, `realize-verification-environment`, `implement-verification-activity`, and `execute-verification-run`, preferably widened shared contracts | Component forms of `environment-assurance-required`, `pilot-verification-activity-required`, `pilot-target-required`, `pilot-verification-implementation-required`, `verification-run-required`, assurance Review/Correction, plus `formal-verification-activity-required` | Make the Phase 3 gate wait for one suitable representative pilot and complete formal CMP VER coverage; pilot RES never accepts CMP |
| Phase 4 | `derive-design-requirements`, `create-design-level-candidate`; reuse widened architecture, interface, decomposition, verification, Review, Correction, and gate contracts | `design-level-candidate-required`; reuse level-aware decomposition, verification, Review, Correction, and gate obligations | Reuse the candidate gate; publish supported-CMP acceptance only after the DES candidate gate |
| Phase 5 | `implement-design-set`, `implement-formal-verification-activity`, `accept-phase-4-design` | `design-set-implementation-required`, `implementation-traceability-review-required`, `formal-verification-implementation-required`, `formal-verification-implementation-review-required`, `design-acceptance-required` | Automatic DES promotion waits for complete reviewed ART coverage and reviewed formal VAI readiness; no new attended gate |
| Phase 6 | Widen `execute-verification-run`; add `assess-analysis-result`, `witness-demonstration`, `assess-inspection-result`, `accept-product` | `formal-verification-run-required`, `formal-result-assessment-required`, `product-acceptance-required`; reuse `problem-report-required` and CHG obligations | Execute formal evidence bottom-up against existing accepted Revisions; one final attended acceptance DEC satisfies `Lifecycle Complete` |

The exact Phase 3 tracer selector additions are
`phase-3-entry-requirements`,
`phase-3-architecture-representative-requirements`,
`current-component-architectures-for-requirement`,
`current-component-strategies-for-requirement`,
`complete-phase-3-level-candidates`, and
`phase-3-level-candidate-definition-members`. Later selectors should describe
implementation coverage and current formal evidence directly. Do not add
phase-complete or queue selectors.

## Dependency-ordered increments

Every increment advances the package identity once and has one public demo
acceptance seam. Use public `mdlm next`, response submission, `mdlm doctor`, and
ordinary publication commits. A focused package regression protects that same
seam. Do not start an increment until the preceding demo produces its next
typed outcome.

### 0. Admission and Phase 2 readiness

Make no Phase 3 through 6 package change. Finish #464, #439, and #446, then
satisfy #222 with two distinct Phase 2 completions under one exact release
identity.

Public demo acceptance seam: preserve both terminal Phase 2 outcomes, exact
package digest, Assignment packets, responses, receipts, doctor results, and
publication commits. The gate either passes from that evidence or Phase 3 stays
unopened.

### 1. Narrow Phase 3 definition tracer

Add `types/CMP.yaml` and `phases/phase-3-component-definition.yaml`, then the
three Scenario and Obligation pairs listed above with prompts. Widen `DWP` from
SYS output to CMP output, `ASP.level` to component, `ICSP` governance to CMP,
and `VSP.level` and coverage to component. Reuse interface authoring, DWP
planning and completion, Review Context, independent Review, simplification,
same-lineage Correction, direct level candidate, and gate DEC behavior.

Generalize only Phase 2 or SYS-named definitions that gain this second real
consumer. Known examples are `system-output-parents-for` and
`create-phase-2-definition-review-context`. Do not copy the Phase 2 selector
family or restore the deleted group-candidate BSL and Review route.

This tracer omits component `VER`, prototype `ART`, `ENV`, `VAI`, `RUN`, and
`RES`. It consumes exact accepted SYS membership as entry evidence and publishes
no second SYS acceptance baseline.

Public demo acceptance seam: one accepted SYS slice produces reviewed CMP,
component ASP, ICSP, and VSP, reviewed completion and simplification evidence,
one direct level candidate, and a gate DEC. Approval returns
`Profile Boundary Reached` at the missing Phase 3 verification breadth or Phase
4 boundary. It publishes no Phase 4, pilot, or formal data.

### 2. Complete Phase 3 verification design

Add no Lifecycle Data type. Widen the existing VSP, ENV, VER, ART prototype,
VAI, RUN, RES, Review, and Correction definitions for component use. Add only
component-specific authoring where a shared Scenario would make Assignment
outputs ambiguous. Derive one representative pilot per compatible component
strategy and public boundary, plus one formal VER for each independently
assessable CMP claim. The pilot result retains `claim_scope:
verification-design`; it cannot accept CMP.

Public demo acceptance seam: the same one-slice product reuses its reviewed
component VSP, reaches one qualified ENV, one good/bad prototype ART, one
source-blind pilot VAI and suitable RUN/RES, and complete formal CMP VER
coverage. The next outcome is the Phase 4 boundary, not another pilot for a
compatible CMP.

### 3. Phase 4 design definition

Add `types/DES.yaml` and `phases/phase-4-design-definition.yaml`. Widen the
level-aware decomposition module from CMP parents to DES outputs and ICSP
governance to DES. Add DES authoring, direct level-candidate, gate, and
accepted-CMP promotion definitions. Reuse the Phase 3 verification module for
one representative design-boundary pilot and formal DES VER coverage.

Do not restate component architecture inside DES. Do not add a group candidate,
new Review datum, new environment datum, or separate Correction phase.

Public demo acceptance seam: one exact gate-approved CMP candidate slice
produces reviewed DES and refined ICSP evidence with exact
`STK -> SYS -> CMP -> DES` ancestry, one suitable representative pilot, formal
DES VER coverage, one direct level candidate, a gate DEC, and accepted CMP
promotion. The next outcome is Phase 5 implementation work.

### 4. Phase 5 independent implementation tracks

Add `phases/phase-5-implementation.yaml`. Add `ART.implements` links to one or
more exact Revisions from the gate-approved DES candidate and a bounded
DES-to-path mapping for one exact product commit or build. `implement-design-set`
publishes one coherent product-build ART.
`implement-formal-verification-activity` consumes exact VER, ENV, and public
controlled-build inputs while prohibiting product source, unit tests, and
private implementation details. Existing REV records substantive ART
traceability judgment and formal VAI judgment.

Do not add BUILD, implementation-plan, unit-test-result, readiness-summary,
track-state, file, or symbol data. Product code, unit tests, and build logs stay
in Git or build evidence cited by the one ART. The product and formal-VAI
Assignments derive independently from the same gate-approved DES candidate set.

Public demo acceptance seam: the public operator loop exposes both independently
ready Assignments without a coordinator. The product worker publishes one exact
implementation ART. A separately prepared source-blind worker publishes formal
VAI. Both settle through normal submission, and the VAI packet contains none of
the prohibited implementation inputs. The next outcome is Phase 6 readiness.

### 5. Phase 6 formal verification and acceptance

Add `phases/phase-6-verification.yaml`. Extend formal execution so each reviewed
formal VAI runs against the exact accepted requirement, VER, qualified ENV, and
controlled ART. Reuse RUN and RES without a summary datum. Add assessment
Scenarios only for analysis, inspection, or demonstration methods that require
human judgment. Deterministic test results need no REV. Execute the formal
evidence bottom-up against the accepted DES, CMP, SYS, and STK Revisions without
publishing another accepted baseline at each level. Reuse PRB and CHG for
failures. Add final attended product acceptance and the profile's
`Lifecycle Complete` condition.

Public demo acceptance seam: one controlled build executes exact formal VAIs
bottom-up against the already accepted requirement Revisions. One deterministic
pass needs no Review, one witnessed result records the package-declared REV or
DEC, and final attended product acceptance yields `Lifecycle Complete`. In the
same tiny product boundary, a deliberately failing build publishes PRB and CHG
and derives only the impacted reruns.

Phase 7 expansion follows this proof. It should extend Original-V impact through
CMP, DES, ART, formal VAI and RES, and replacement baselines. It is not part of
this Phase 3 through 6 goal.

## Fanout limits

These are package acceptance rules:

- one direct level candidate for one coherent definition set;
- one VSP and ENV per compatible level and profile;
- one representative pilot per distinct strategy and public boundary;
- one formal VER per independently assessable requirement claim;
- one product-build ART per coherent gate-approved DES candidate set and exact
  build commit;
- one RUN/RES per formal VAI because execution evidence is immutable;
- one REV per independently judged subject, with compatible subjects sharing
  one exact Review Context and Assignment when the package permits; and
- exact dependency links invalidate only materially affected evidence.

Refuse data whose only purpose is progress or aggregation. That includes phase
completion, pilot completion, result summary, queue, coordinator, handoff,
per-file, and per-symbol Lifecycle Data. Reuse exact VSP, VER, ENV, prototype,
VAI, Review, and baseline evidence while its declared dependencies remain
current.

## Decisions still open

1. **SYS acceptance timing.** The accepted overview promotes supported SYS after
   the CMP gate, while the current package accepts SYS in Phase 2. Keep the
   narrow tracer's documented temporary deviation and avoid duplicate
   acceptance. A later ticket must decide whether fresh full-V packages move SYS
   acceptance to Phase 3.
2. **Fresh full-V profile cutover.** The post-0.86 scout recommends removing the
   one-time Phase 2 pilot-assessment and dedicated Phase 7 detour from the fresh
   linear profile. Decide during Phase 3 ticket drafting whether old definitions
   remain loadable but disabled or are deleted as one dependency slice. Never
   migrate frozen repositories.
3. **Product commit admission.** Phase 5 must choose from operational evidence
   between a separately bound product repository and an opt-in, process-neutral
   exact-descendant-commit capability. Do not implement that kernel capability
   unless the Phase 5 tracer proves the same-repository need.
4. **Final human evidence shape.** Before Phase 6 implementation, specify which
   demonstration and final-acceptance claims use REV and which use DEC. Reuse
   those types unless a missing durable claim proves a new type is necessary.

No other design decision is currently required. Exact file versions and the
package identity belong to each ticket's rebase against then-current main.

## Primary sources

- [Repository operating instructions](../../AGENTS.md) and
  [MDLM development operations](../agents/mdlm-development.md)
- [Domain vocabulary](../../CONTEXT.md) and
  [domain document routing](../agents/domain.md)
- [ADR 0002](../adr/0002-keep-lifecycle-structure-out-of-mdlm-core.md)
- [Accepted v0.8 process overview](../mdlm-process-overview-v0.8.md), Phase 3
  through Phase 6 sections
- `docs/research/v-model-verification-and-implementation-sequence-2026-08-28.md`
- `docs/research/phase-3-smallest-tracer-2026-08-28.md`
- [Post-0.86 full-V package architecture](https://github.com/taylorrowser/mdlm/blob/7f9db37b20e6013ff3e94b6e5c6b5659a8683ca6/docs/handoffs/full-v-package-architecture-after-0.86.md)
- [GitHub issue #222](https://github.com/taylorrowser/mdlm/issues/222),
  [issue #439](https://github.com/taylorrowser/mdlm/issues/439),
  [PR #441](https://github.com/taylorrowser/mdlm/pull/441),
  [issue #446](https://github.com/taylorrowser/mdlm/issues/446),
  [PR #448](https://github.com/taylorrowser/mdlm/pull/448), and
  [issue #464](https://github.com/taylorrowser/mdlm/issues/464), read 2026-08-30
