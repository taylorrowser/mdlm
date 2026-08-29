# MDLM development operations

Operational data is the main development signal. Lifecycle completion and safe Phase transitions are the primary outcomes. Accepted publications are secondary and matter when they advance a lane or close a learning loop. Treat delay before the first demo and accepted publication as a velocity problem. Keep demos moving, preserve failures, fix what operation exposes, and release the smallest set of changes that unlocks more operation.

## Read this first

Start from the supported operator contract in `README.md`. Read `CONTEXT.md` and
the ADRs relevant to the change.

Treat the CLI over Markdown Lifecycle Data and a declarative YAML Process Package
as the product boundary. Pi, Codex, and other runners are adapters and sources of
operational evidence. Runner-specific behavior does not define the kernel or
Process Package contract.

An explicitly recorded demo may delegate stakeholder authority to its operating
agent and must preserve that delegation in the lane evidence. Real attended work
gets stakeholder decisions from the actual stakeholder. Stop when the required
authority is unavailable.

The host operating policy at `/home/ubuntu/git/mdlm-successor-demos/operations/OPERATING-POLICY.md` owns portfolio slot composition, nonlearning controls, defect lead-time tracking, resource scheduling, and pointers to the exact evidence, recovery, and one-shot release runbooks. Follow both documents. If they conflict, preserve evidence and stop for a policy decision.

## Operator-contract work

Keep the ordinary public path to one `mdlm next --json` call and one
`mdlm scenario submit --json` call. `mdlm-next@2` includes the complete
`mdlm-assignment-packet@3`; the harness returns
`mdlm-assignment-response@2`; submission returns
`mdlm-submission-outcome@1`. Keep `deriveOperatorOutcome` pure. Keep repository
authentication and exact lease recovery in `claimNextWork`, and canonical
validation plus atomic publication in `submitAssignmentResponse`.

The kernel owns integrity, identity, authority binding, atomicity, terminal
precedence, and no-replay settlement. The Process Package owns process-specific
eligibility and ordering. The harness transports packets and responses. Remove
ordinary-path code that ranks work, reconstructs packets, copies authority from
prose, predicts durable IDs, or recreates a status/next/prepare state machine.

## Keep four kinds of work moving

Run these lanes independently. Independent issue work may proceed in parallel
with demos. Give each issue, lifecycle lane, and shared evidence record one
writer. A blocked lane must not idle the others.

Name one coordinator for the current critical path from candidate assembly
through qualification and the first fresh demo. Record that ownership and its
measures only in the host records that own scheduling and reporting.
Parallelize bounded diagnosis, read-only review, and future design only when
they cannot delay or replace the next critical-path action. While a concrete
gate is pending, change its runbook or design only to close an observed blocker.

### Full demos

An eligible demo lane is initialized under the exact identity required by [Portfolio discipline](#portfolio-discipline), has clean Git state and valid integrity, has no uncertain-publication or provenance stop, and has one sole owner.

When no exact quiet-window reservation or stakeholder-authorized architecture
sprint exception is active under the host operating policy,
keep exactly three eligible lifecycle operators: one persistent Codex reference
lane and two ordinary Pi agent sessions using the current evaluation model.
Treat every missing retained slot or manager as an operating incident. Follow
the host policy for slot selection, clearance, restoration, and
restoration-breach reporting.

A host-policy fleet transition may keep extra lanes running through their
truthful boundaries. Those draining lanes retire without replacement and do not
create slot incidents.

Keep old-qualified demos running while newer source is edited, merged, reviewed,
preflighted, or qualified. Each running lane stays bound to its exact
last-qualified identity. Never mutate that identity in place. Switch a slot only
when its qualified replacement starts.

Pause demos only during an authenticated active qualification quiet window.
Restore the old-qualified fleet as soon as the window clears, whether
qualification passes or fails, and replace slots only as qualified replacements
start.

An operator-contract cutover may use a recorded stakeholder-authorized sprint
exception instead. Preserve every lane at its authenticated boundary. After the
cutover acceptance checks pass, launch one fresh disposable canary under exact
source, Process Package, artifact, runner, model, and harness identities. Restore
the three-slot fleet only after that canary completes Phase 0, including a
rejected then corrected Review proposal, and enters the first Phase 1 RUN/RES
loop without a contract, authority-envelope, missing-input, generated-ID, or
ambiguous-publication failure.

Continue each lane through accepted Reviews, publications, qualification, and Phase entry. Its operational endpoint is the controller result `Lifecycle Complete` or `Profile Boundary Reached`, or a package-declared terminal outcome. The exact stop conditions in the host policy's linked recovery runbook mark the lane stopped or blocked, not complete.

### Focused fixes

Assign every known demo-blocking issue a sole owner when an isolated worktree and host capacity are available. Fix lanes may run in parallel with all demo lanes.

Rank fixes by operational effect:

1. unsafe publication, provenance, or integrity behavior;
2. defects blocking several demos or the next release gate;
3. defects blocking one demo;
4. findings with no current operational effect.

Reproduce the observed failure once, add the smallest regression that fails for that reason, make the narrow fix, run focused tests and checks to green outside an active exact quiet-window reservation, and obtain one fresh-context review PASS. Return to a demo after review. Broader hardening belongs in a separate nonblocking issue.

### Integration qualification

Keep one rolling integration lane separate from feature and fix writers. It tests only the exact candidate commit and tree recorded in `/home/ubuntu/git/mdlm-successor-demos/operations/releases.json`. Every command and result names that identity. If assembly changes either identity, preserve the old result and start qualification again on the replacement candidate.

The integration lane owns expensive checks:

- run the complete test suite under the host policy's serialized resource reservation;
- record total time, failures, and the slowest tests or files;
- distinguish product failures from flaky, redundant, or obsolete tests;
- optimize or remove slow tests that do not uniquely protect a current requirement, demonstrated defect, or trust boundary;
- rerun affected groups on that same candidate tree after test-only diagnosis.

Feature and fix writers rely on focused checks instead of repeating the full suite. Integration failures create focused follow-up work. They do not erase valid operational evidence.

In repository tests, protect the pure decision with direct
`deriveOperatorOutcome` cases and freeze the serialized public contract through
real `claimNextWork` packets and `submitAssignmentResponse` outcomes. Keep one
compiled public transaction per fixed trust boundary. Use lower-level helpers
only for malformed, stale, replay, authority, provenance, or other failure
behavior that the public transaction cannot isolate.

Assert the current Process Package version or digest only when package
selection, provenance, or migration is the behavior under test. Transaction
tests assert their own public contract and leave current package identity to
the canonical package and initialization checks.

The root runner writes a Markdown cost report under `artifacts/test-cost/` after
each qualification. Set `MDLM_TEST_COST_REPORT` when the integration record
needs an exact destination. Read the file table and runtime-class totals after
an integration run. These numbers are observations, not limits, and never fail
a gate.

Keep reconstructed public-workflow tests out of the PR inner loop when they are
in the slowest fifth of the report and do not uniquely protect a changed trust,
publication, authority, or integrity seam. Move those files to release
qualification, keep one direct public test for each real seam, and cover route
permutations through the package or evaluator interface. When a slow file does
protect a changed seam, run that one file as the diff-focused regression instead
of repeating the release suite.

Use `npm run test:fast` for the bounded decision, package-fixture, and public
contract loop. Use `npm run test:cutover` once on an integrated candidate for
both builds, the MDLM-Pi contract, and the installed journey. Source-level tests
do not prove a public CLI or installed artifact. Keep intentionally failing
historical red evidence outside default suite discovery while preserving its
exact bytes and purpose.

Before an installed or disposable journey starts, arm its failure capture. An
unexpected outcome writes the exact terminal JSON, accepted transaction trace,
repository and package identities, and artifact digests, then preserves the
repository. Cleanup removes successful roots only. Repair missing capture before
starting another fresh journey.

The host operating policy alone owns lifecycle pauses and every reservation and restoration rule, including breach reporting. Follow its `RELEASE-QUALIFICATION.md` pointer for gate preparation, execution, one-shot treatment, outcome classification, and manifest requirements inside an active reservation.

### Release assembly

Build releases around changes that unblock demonstrations. Batch related reviewed component fixes into one candidate unless useful operation requires an earlier release. Do not wait for unrelated cleanup.

Every included change must have focused green evidence and a fresh-context review PASS. Merge eligible changes, fetch `origin/main`, and record its exact commit and tree in `/home/ubuntu/git/mdlm-successor-demos/operations/releases.json`. The candidate record also names included commits, pull requests, and issues, Process Package identity and digest, artifacts and digests, runner commit, model, harness, public targets, expected demo unblocks, integration status, and carried blockers.

Qualification occurs after merge on that recorded `origin/main` commit and tree. Any later merge or branch update supersedes the candidate and requires qualification of the replacement exact commit and tree. Build artifacts and start fresh demos only from the qualified tree.

When preflight fails, preserve its exact result and open one focused issue for
the observed failure set. Fix, review, and merge that issue, then bind the
release record and runbook to the new exact identity and obtain a fresh review.
Restart every preflight on that replacement identity. Do not fold unrelated
design or hardening into the failed gate.

Source, Process Package, and artifact work does not freeze a running lane. Keep
each lane on its exact last-qualified identity until a qualified replacement
starts. Runner-only recovery may continue a valid lane when authenticated
evidence supports it, but a mixed-runner lane does not count toward a
single-identity reliability gate.

## Execution sequence

1. Read the portfolio, exact lane evidence, open issues, and release candidate record.
2. Operate lanes under [Full demos](#full-demos), [Focused fixes](#focused-fixes), and [Integration qualification](#integration-qualification).
3. Classify each finding and link it to the lane's exact evidence before editing code.
4. Follow [Release assembly](#release-assembly) when fixes qualify for a candidate.
5. Update portfolio and release records from exact Git, runner, snapshot, and package evidence.

At each coordinator checkpoint, use `OPERATING-POLICY.md` for measures and
scheduling and `MONITORING.md` for the report. Confirm that the host-owned
records identify the critical-path coordinator and next command, account for
every eligible demo slot, expose delay before the first demo or accepted
publication, and name the latest operational evidence and current blocker.

If the next command is known and idle, run it before adding plans, reviews, or
documentation. A passing qualification proves an exact release can start a
demo. It is not demo evidence. Measure the learning loop through the first
fresh operation on that release and the accepted publication or truthful
boundary it reaches.

## Portfolio discipline

The machine-readable portfolio and concise human summary are the operating index. Before the first run, every lane records its product, purpose, expected endpoint, expected known failure, sole owner, paths, source commit and tree, Process Package identity and digest, artifact digests, runner commit, model, harness, and public targets. During operation it records the current phase, Assignment, last accepted publication, state, issue, and next action.

Use these states plainly: active, attended, blocked, stopped, terminal, complete, or superseded. Use `complete` only for an operational endpoint defined under [Full demos](#full-demos). A missing process is not a state. Runner output, snapshots, Git state, and package status decide the state.

Keep release candidates separate from demo history. Demo records answer what happened. Release records answer what exact bundle should run next.

## Phase expansion boundary

After the cutover canary restores the fleet, keep Phase 3 and later Process
Package work behind the two-product,
same-identity Phase 2 reliability gate owned by [issue
#222](https://github.com/taylorrowser/mdlm/issues/222). Apply that issue's exact
pass criteria. After the gate passes, add one complete operational slice at a
time and run it before expanding the next Phase.

Judge simplification across the full V-model. Prefer shared level-aware rules,
reused unchanged evidence, grouped compatible review context, and artifacts that
bind bounded sets of implementation paths. Reject an early-phase simplification
when it splits requirements or repeats evidence in a way that multiplies later
CMP, DES, implementation, verification, Review, RUN, or RES Lifecycle Data.
