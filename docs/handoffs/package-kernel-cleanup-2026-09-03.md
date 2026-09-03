# Process Package and kernel cleanup plan, 2026-09-03

Stakeholder direction: most operational defects since 2026-08-25 came from the
Process Package, not the kernel. Clean up the package while bringing in the
recorded learnings, and give the kernel a simplification pass where it shipped
fast. Keep the full-V goal paused until the stakeholder reactivates it.

Source baseline: `origin/main` `fd2b907ee7e950125f9c96b9f497ae646ecdfb34`,
`mdlm-bootstrap@0.146.0`, profile `bootstrap@61`. Work happens on branch
`agent/package-kernel-cleanup` in
`/home/ubuntu/git/mdlm-worktrees/agent-package-kernel-cleanup` and lands
through ordinary reviewed pull requests, one child issue per pull request.

The defect classes and the rules they yield are recorded in
[`docs/process-package-learnings.md`](../process-package-learnings.md). Every
work item below either installs a check for one class or removes accumulated
inventory that made those classes likely.

## Measured starting point

| Measure | Value |
| --- | ---: |
| Issues closed since 2026-08-25 | 242 |
| Labeled Process Package defects | 64 |
| Labeled kernel defects | 19 |
| Selectors | 585 |
| Selectors with no reference | 17 |
| Selectors referenced once | 150 |
| Scenarios | 93 |
| `revise-*` correction Scenarios | 30 |
| Correction Obligations | 30 |
| Fixture checkpoint commits in the last 200 | 70 |
| `src/assignment.ts` lines | 4469 |
| `assignmentResponseSchema` function lines | 1276 |

## Work items

Ordered by operational effect. Each item names its acceptance seam and the
learning class it closes.

### 0. Fix #696 and unblock 0.146 (#696)

Kernel. Already scoped in the issue. Reuse the existing #679 public test as the
regression, keep the #694 cross-output test green, change nothing in the
package. This unblocks the next qualified release and is the first fresh
evidence for class 3.

### 1. Record the learnings and point the runbook at them (#698)

Docs. Land `docs/process-package-learnings.md` and reference it from
`docs/agents/mdlm-development.md` under focused fixes, so every package defect
is classified against the catalog before editing. No code change.

### 2. Prune unreferenced package inventory (#699)

Package. Delete the 17 Selectors with no reference. Add a package-load
diagnostic that rejects an unreferenced Selector so the count cannot grow back.
Refresh the fixture once. Acceptance: `mdlm process validate` and
`mdlm process test` pass, the fast suite passes, and the Selector count drops
by at least 17. Closes part of class 8.

### 3. Stop committing the canonical package fixture (#700)

Test infrastructure. Replace the tracked
`test/fixtures/canonical-process-package/` archive with an ignored cache under
`node_modules/.cache/` or `.lifecycle/.cache/`, keyed by the package digest and
rebuilt by the existing `scripts/process-fixture.mjs` when missing or stale.
Delete the checkpoint and refresh commands from the ordinary workflow. Keep the
provenance manifest as a generated file. Acceptance: a package edit followed by
`npm run test:fast` needs no refresh commit, and the twenty tests that read the
fixture still pass. Closes class 7 and removes roughly a third of commit
traffic.

### 4. Package liveness proofs (#701)

Kernel and package. Extend `src/process-constraint-compiler.ts` with two
declaration-derived proofs:

- correction-route coverage: every output type that can receive a failing
  Review or gate rejection in a Phase has a same-lineage correction Resolver in
  that Phase;
- progression prerequisite coverage: every Obligation bound to a Phase is
  referenced by that Phase's readiness or gate expressions, or is declared
  non-gating.

Report `proved`, `contradictory`, or `inconclusive` exactly as #645 does.
Acceptance: reverting the package change from any of #599, #610, #631, #653,
or #675 produces a deterministic `contradictory` diagnostic naming both owning
declaration paths. The current package proves or is honestly `inconclusive`
with a named reason. Closes classes 1 and 2 at package load instead of at
transaction 150.

### 5. Every-Scenario scaffold round-trip (#702)

Kernel test. One package-neutral test that, for every Scenario in the selected
package, builds the Assignment scaffold from the compiled contract, fills it
with placeholder values, compiles the proposal, and asserts validation
succeeds. Acceptance: the test fails on the #696 regression before its fix and
passes after. Closes class 3 as a qualification gate.

### 6. Split `src/assignment.ts` (#703)

Kernel. Move the 4469-line module into modules with one responsibility each:
packet projection, response schema, claim and lease, submit and publication,
settlement inspection. No behavior change. `command-application.ts` is the only
importer, so the public surface is small. Acceptance: fast and cutover suites
pass unchanged, and no exported name changes meaning. Then simplify the
projection overlay path that produced the #679 to #696 chain, guarded by item
5. Reduces the kernel surface where class 3 keeps recurring.

### 7. Generate correction routes from one declaration per type (#704)

Package. The 30 `revise-*` Scenarios and 30 correction Obligations share one
shape. Prototype a compact per-type correction declaration that the loader
expands into the existing Scenario and Obligation definitions, so adding a
reviewable type cannot omit its route. Prototype first on Phase 1 ENV and VSP,
measure lines removed and diagnostics gained, and decide whether to adopt.
Acceptance for the prototype: the expanded definitions are byte-equivalent to
the current hand-written ones for the two types. Closes the cause of class 1
rather than its symptom.

### 8. Prompt lint against the Scenario declaration (#705)

Package. Report a prompt that omits a declared input name or mentions a
prohibited input. Acceptance: reverting #502 or #612 produces a diagnostic.
Closes class 6.

## Order and boundaries

Items 0 through 3 are small and independent and go first. Item 4 is the highest
value package work and starts as soon as item 2 lands, because it depends on
the current Selector inventory being clean. Item 6 runs in parallel with items
4 and 5 as kernel work in its own worktree. Item 7 waits for item 4's
diagnostics, which tell us which routes are missing today. Item 8 is last.

Hard rules that survive this cleanup: ADR 0001, 0002, 0003, and 0004; exact
identities and immutable Revisions; atomic publication; no replay; package
digest pinning; one fresh-context review per merge.

Do not expand Phase breadth, change the operator contract, or migrate any
stopped lane. A release candidate is cut only when a merged item unblocks fresh
operation.

## Reporting

Progress, findings, decisions, and blockers are published on the Message Board
with Tags `mdlm`, `cleanup`, and the child issue Tag. The epic issue links each
child. A child issue closes only when its acceptance seam is proved by the fast
suite or a public command, and the reviewed commit is recorded on the issue.
