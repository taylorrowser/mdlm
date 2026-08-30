# Full-V Process Package architecture after 0.86

Status: issue-ready architecture scout, not an accepted ADR or implementation
specification.

## Decision boundary

Do not expand the package until one fresh direct-agent lane has used the public
CLI with `mdlm-bootstrap@0.86.0`, digest
`sha256:53ae0a7069cfb0736bbced16d628c67f6311a540faf2c9983607488ee8cd350e`.
The lane must cross a real submit, settlement, publication commit, and subsequent
`mdlm next` without an Invalid outcome. Prefer evidence through the repaired
Phase 2 architecture response if the lane reaches it. Do not migrate, replay, or
resume an older lane to manufacture this proof.

The integrated installed-package qualification is already PASS at MDLM commit
`925bdc292f13514f302bcb7b2fade83f061a4f30`. Its durable terminal record is:

`/home/ubuntu/git/mdlm-successor-demos/operations/integration/925bdc292f13514f302bcb7b2fade83f061a4f30-94fd78e57ccd1f4c0889b1893df8930006f8c65f/agent-native-preflight/20260830T031250Z/quiet-window-reservation-terminal-pass.json`

That proves the installed artifact and package fixture. It is not a substitute
for direct-agent operation. At the time of this scout, active direct lanes still
cite the older qualified 0.81 package.

## Evidence and gap

The accepted process overview calls for:

- a Phase 2 SYS pilot-verification route before the SYS gate;
- CMP definition in Phase 3 and DES definition in Phase 4;
- independent product and formal-VAI implementation in Phase 5; and
- bottom-up formal execution and acceptance in Phase 6.

Package 0.86 contains 21 types, 5 phases, 70 Scenarios, 67 Obligations, and 411
Selectors. It contains no CMP or DES type and no Phase 3 through 6 definition.
The profile explicitly disables component/design decomposition and formal
verification. Its VSP, ENV, VER, VAI, RUN, RES, ART, REV, BSL, PRB, and CHG
contracts already contain most of the needed vocabulary, but the executable
assurance Scenarios and Obligations are bound to Phase 1 and STK.

The historical clean pilot stopped with 102 commits, 91 transactions, 108
Lifecycle Data revisions, and 24 Review Contexts. Its reviewed recommendation
was `change`: useful evidence, high ceremony, and no demonstrated scope
reduction. See `docs/zero-to-assessment-pilot.md` and
`docs/mdlm-v0.8-implementation-conformance.md`. The 0.86 qualification trace
also shows that a single Phase 1 slice already publishes MAP/QST/DEC/PSP/STK,
multiple BSL/REV pairs, VSP, ENV, VER, and VAI before its first qualification
RUN. Adding four phases by copying that shape is not coherent expansion.

## Architecture rule

Treat the Process Package as the Module and `next`/`submit` as its Interface.
All new behavior belongs behind the existing declarative package seam. Add no
active-phase datum, mutable cursor, phase-transition command, runner protocol,
coordinator, telemetry datum, or kernel lifecycle rule.

Lifecycle Data should record a product definition, authority, or durable
evidence. Phase control stays derived from existing data. A new datum whose only
purpose is to move the process to another step fails the deletion test.

Use these proportional defaults for the first full-V slice:

- one level candidate for one coherent definition set;
- one VSP and ENV per compatible level/profile, not per requirement;
- one representative pilot per level to test verification discrimination;
- one formal VER per independently assessable requirement claim;
- one product-build ART for one coherent accepted DES set; and
- one RUN/RES per formal VAI, because those are immutable execution evidence.

Do not create default group baselines, one pilot per requirement, duplicate
environment registrations, result-summary data, phase-completion data, or
separate orchestration phases for correction. Reuse REV for judgment, BSL for
candidate/acceptance snapshots, PRB/CHG for failure and change, and DEC for
nondelegable authority.

## First independently shippable issue

### Collapse singleton Phase 2 candidate composition

Ship this immediately after the direct 0.86 proof and before adding Phase 2
verification breadth.

Current narrow Phase 2 creates a `group-candidate` BSL, a Review Context BSL and
REV for that candidate, then a `level-candidate` BSL for the same single DWP.
There is no implemented multi-group reconciliation. The intermediate group adds
no decision or reusable product evidence.

Change `create-system-level-candidate` so one reviewed DWP completion directly
freezes the exact completion, outputs, ASP, ICSPs, VSP, and simplification
evidence as the level candidate. Keep the level-candidate Review and gate.

Delete the singleton route rooted at:

- `scenarios/create-decomposition-group-candidate.yaml` and its prompt;
- `obligations/decomposition-group-candidate-required.yaml`;
- the group input and `composes` requirement from
  `scenarios/create-system-level-candidate.yaml`;
- `obligations/system-level-candidate-required.yaml` dependence on a reviewed
  group candidate; and
- selectors used only to create, inspect, correct, or review the singleton group
  candidate.

Do not add a replacement datum. If operational evidence later contains real
multiple groups, open a separate issue from that evidence. Until then the
profile supports one coherent definition set truthfully.

Focused regression: from one reviewed DWP completion, `next` assigns direct
level-candidate creation; no group-candidate or group-review Obligation exists;
the level candidate contains exactly the former group definitions/evidence plus
the shared level context and still reaches the existing gate.

Minimal operational acceptance: one fresh package-bound public lane reaches the
Phase 2 candidate route, publishes the level candidate without any intermediate
group BSL/Review transaction, passes `doctor`, commits, and receives the existing
level-candidate Review or gate Assignment. Preserve the Assignment packet,
response, receipt, package digest, and post-commit Operator Outcome.

## Smallest coherent Phase 2 verification route

Make this the next issue. It adds no Lifecycle Data type and no phase.

### Required contract changes

1. Widen VSP `governs` and `governs-revision` targets from STK to `[STK, SYS]`.
   Keep the shared strategy's stable and exact coverage links; each formal VER
   still binds one exact requirement claim through `verifies-revision`.
2. Widen ART `derived-from` to SYS so a bounded architecture prototype can cite
   the representative SYS without a wrapper DEC.
3. Permit `realize-verification-environment`,
   `implement-verification-activity`, and `execute-verification-run` in Phase 2.
   Their ENV/qualification/pilot contracts and edges do not change.
4. Add exact SYS authoring Scenarios for a system VSP, a representative pilot
   VER, a bounded pilot-control ART, and formal SYS VERs. Do not make the
   Assignment renderer guess between STK and SYS output types.
5. Extend Phase 2 contextual Review to VSP, ENV, VER, and VAI. Freeze one context
   per causal checkpoint, not per subject: VSP first; then the ENV/qualification
   evidence and VER set; then VAI. Publish one REV per reviewed subject. This
   preserves the rule that failed upstream planning cannot fan out while sharing
   context among subjects that become reviewable together.
6. Derive readiness with package Obligations. One representative current SYS
   selected from the level definition requires a suitable pilot RUN/RES before
   the level gate. Every independently assessable current SYS requires a formal
   VER, but formal VAI implementation and formal RUN wait for Phases 5 and 6.

### Exact evidence graph

The route should publish only these existing data and links:

```text
SYS <-governs/governs-revision- VSP <-realizes- ENV
                                      ^          ^
                                      |          | assessed-in
                         governed-by VER        RES
                                      ^          ^ produces
                                      | realizes RUN
                                     VAI <-executes
                                      | uses ENV
                                      | targets ART -derived-from-> SYS

pilot VER -verifies/verifies-revision-> representative SYS
formal VER -verifies/verifies-revision-> exact SYS claim
```

Keep the qualification edges already used in Phase 1: qualification VER
`qualifies` ENV; qualification VAI `realizes` VER and `uses`/`targets` ENV; RUN
`executes` VAI, `uses`/`targets` ENV, and `produces` RES. Pilot RES remains
verification-design evidence and must not enter an accepted requirement
baseline.

Do not add PAS, a Phase 2 verification summary, a pilot-complete BSL, a result
assessment wrapper, or a second target registration. A suitable pilot result is
the readiness fact. Formal VER presence is the future-work contract.

Focused regression: one representative SYS derives one reviewed pilot chain and
formal VER coverage; a suitable pilot unblocks the existing level gate, while
an unsuitable/inconclusive result enters the existing VAI/ENV/ART correction
shape and cannot count as SYS acceptance.

Minimal operational acceptance: in one fresh direct lane, preserve the exact
Phase 2 pilot Assignment packets and receipts through a suitable RUN/RES, then
show that `doctor` passes and the next outcome is candidate/gate work rather than
Invalid, Process Dead End, or another pilot for a nonrepresentative SYS.

## Route to the entire V

Each row is independently reviewable and should advance the package identity
once. Do not implement later rows until the preceding route has public evidence.

| Increment | Add or widen | Delete or refuse | Operational proof |
| --- | --- | --- | --- |
| Phase 3, component definition | Add CMP; add `phase-3-component-definition`; widen DWP parent/output links to SYS/CMP, `target_child_type` to CMP, ASP level to component, ICSP governance to CMP, and VSP level to component. Add exact CMP DWP execution and candidate/acceptance Scenarios. Reuse the Phase 2 assurance and correction module. | Remove the post-Phase2 Profile Boundary for reviewed `proceed`. Remove PAS/expansion routing from the active full-V profile once its one-time expansion purpose is fulfilled. Do not copy Phase2-named selectors; rename/generalize only selectors with a second level consumer. | One SYS slice produces reviewed CMP/ASP/ICSP, one representative suitable pilot, formal CMP VER coverage, a direct level candidate, gate, and accepted SYS promotion. |
| Phase 4, design definition | Add DES and `phase-4-design-definition`; widen DWP parent/output links to CMP/DES, `target_child_type` to DES, ICSP governance to DES, and VSP level to design. Add exact DES DWP execution and candidate/acceptance Scenarios. | No component-architecture restatement in DES. No default group candidate. No new pilot, environment, review, or correction datum type. | One accepted CMP slice produces reviewed DES/ICSP, one representative suitable pilot, formal DES VER coverage, direct level candidate, gate, and accepted CMP promotion. |
| Phase 5, implementation | Add `phase-5-implementation`; add ART `implements` links to one-or-more exact accepted DES revisions; add one `implement-design-set` Scenario producing one exact product-build ART; add a formal-VAI Scenario consuming exact VER, ENV, and controlled ART without product-source inputs. Review substantive ART traceability and each formal VAI with existing REV. | Do not add BUILD, implementation-plan, unit-test-result, readiness-summary, track-state, or handoff data. Unit tests and build logs stay Git/build evidence referenced by ART. Do not serialize the product and VAI tracks through a coordinator. | Two independent Assignments become ready from the same accepted DES baseline. One publishes the product ART; another source-blind context publishes formal VAI. Both settle through normal `submit`; neither can see prohibited inputs. |
| Phase 6, formal verification and acceptance | Add `phase-6-verification`; extend `execute-verification-run` completion for formal VAI against component-build/product-build ART and formal RES outcomes. Add method-specific result assessment only for analysis, inspection, or demonstration; automatic test results need no REV. Add one generic accepted-level BSL Scenario that promotes an exact candidate only when its required formal RES set passes. Progress bottom-up DES, CMP, SYS, then STK from baseline membership. Add final attended product-acceptance DEC and terminal condition. | Do not add execution-summary RES, result-per-phase BSL, acceptance flags on requirements, or separate verification subphases. Do not duplicate PRB/CHG; formal failure enters the existing change route and the active phase derives impacted reruns. | A controlled build executes exact formal VAIs bottom-up. At least one automatic pass needs no Review, one witnessed/attended result uses REV or DEC as declared, accepted baselines promote in order, and final STK acceptance yields Lifecycle Complete. A deliberately failing build produces PRB/CHG and only impacted reruns. |

## Phase and change routing

The full profile should be linear: Phase 0, Phase 1, Phase 2, Phase 3, Phase 4,
Phase 5, Phase 6. Keep change handling as Obligations enabled in the active phase,
not as a mutable jump to a special coordinator phase. Original-V ordering is
derived from CHG impact links and accepted-baseline roots. After the affected
data and evidence are current, ordinary active-phase work resumes.

For fresh full-V repositories, remove `phase-2-pilot-assessment` and the dedicated
Phase 7 detour from the enabled phase chain. The old package and its frozen demos
remain immutable evidence. The new package must not migrate or rewrite them.
Retain PAS source definitions only if package migration tests prove current
repositories must still load them; otherwise delete the PAS type, assessment
phase, observation/context/assessment/expansion Scenarios, their Obligations,
prompts, and selectors as one dependency slice.

## Acceptance budget for every increment

Use one focused package/evaluator regression at the stable route seam, package
validation, package fixture tests, build/typecheck, and one fresh-context review.
The operational proof is one fresh public-CLI lane with exact package digest,
Assignment/response/receipt hashes, successful `doctor`, ordinary publication
commits, and the next typed outcome. Do not require a portfolio-wide replay or a
second test matrix. Freeze old lanes on every package change and start fresh.

The first complete-V proof needs one deliberately tiny product, one requirement
slice at each level, one controlled product build, and both a passing and a
failing formal observation. Breadth beyond that is new evidence, not acceptance
for the architecture.

## Non-goals

- no kernel or runner feature;
- no new public command;
- no lifecycle telemetry or queue datum;
- no source-isolation container in the first full-V route;
- no regulatory-compliance claim;
- no multi-group or multi-profile generalization without operational demand;
- no demo pause, migration, replay, or evidence rewrite; and
- no CONTEXT glossary or ADR change. This plan uses existing domain terms and
  keeps the accepted core/package boundary intact.
