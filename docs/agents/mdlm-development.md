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

### Targeted demos

An eligible demo lane is initialized under the exact identity required by [Portfolio discipline](#portfolio-discipline), has clean Git state and valid integrity, has no uncertain-publication or provenance stop, and has one sole owner.

When no exact quiet-window reservation or stakeholder-authorized architecture
sprint exception is active under the host operating policy, the available demo
mix and cap is one Codex direct-agent lane and one Pi direct-agent lane using the
current evaluation models. Run either or both when an exact testable release
artifact is ready and the lane can close a named learning loop. Zero or one live
lane is valid while implementation or package work is producing the next
artifact. An unused slot is not an incident.

A host-policy fleet transition may keep extra lanes running through their
truthful boundaries. Those draining lanes retire without replacement and do not
create slot incidents. Retain the deepest or most useful lane in each harness.

Each running lane stays bound to its exact qualified identity. Never mutate that
identity in place. Do not launch an old-release replacement merely to occupy a
slot. Produce the next testable source and Process Package artifact first, then
launch the relevant Codex and/or Pi lane promptly enough to prove the named seam.

Pause demos only during an authenticated active qualification quiet window or at
another boundary explicitly owned by the host policy. After clearance, resume a
preserved lane only when it still closes a named learning loop; otherwise use
the capacity for the next qualified artifact.

An operator-contract cutover may use a recorded stakeholder-authorized sprint
exception instead. Preserve every lane at its authenticated boundary. After the
cutover acceptance checks pass, launch one fresh disposable canary under exact
source, Process Package, artifact, runner, model, and harness identities. Expand
to the other targeted harness only after that canary completes Phase 0,
including a rejected then corrected Review proposal, and enters the first Phase
1 RUN/RES loop without a contract, authority-envelope, missing-input,
generated-ID, or ambiguous-publication failure.

Continue each lane through accepted Reviews, publications, qualification, and Phase entry. Its operational endpoint is the controller result `Lifecycle Complete` or `Profile Boundary Reached`, or a package-declared terminal outcome. The exact stop conditions in the host policy's linked recovery runbook mark the lane stopped or blocked, not complete.

### Focused fixes

Assign every known demo-blocking issue a sole owner when an isolated worktree and host capacity are available. Fix lanes may run in parallel with all demo lanes.

Rank fixes by operational effect:

1. unsafe publication, provenance, or integrity behavior;
2. defects blocking several demos or the next release gate;
3. defects blocking one demo;
4. findings with no current operational effect.

Reproduce the observed failure once, add the smallest regression that fails for that reason, make the narrow fix, run focused tests and checks to green outside an active exact quiet-window reservation, and obtain one fresh-context review PASS. The one fresh reviewer performs the whole review directly and returns the sole verdict, without spawning standards or ticket subreviewers. Return to a demo after review. Broader hardening belongs in a separate nonblocking issue.

### Integration qualification

Keep one rolling integration lane separate from feature and fix writers. It tests only the exact candidate commit and tree recorded in `/home/ubuntu/git/mdlm-successor-demos/operations/releases.json`. Every command and result names that identity. If assembly changes either identity, preserve the old result and start qualification again on the replacement candidate.

The integration lane owns expensive checks:

- run the complete test suite under the host policy's serialized resource reservation;
- record total time, failures, and the slowest tests or files;
- distinguish product failures from flaky, redundant, or obsolete tests;
- optimize or remove slow tests that do not uniquely protect a current requirement, demonstrated defect, or trust boundary;
- rerun affected groups on that same candidate tree after test-only diagnosis.

Feature and fix writers rely on focused checks instead of repeating the full suite. Integration failures create focused follow-up work. They do not erase valid operational evidence.

Build the exact worktree before a public CLI regression whose helper invokes
`dist/mdlm.js`. A missing executable is preflight setup failure and supplies no
behavioral evidence.

In repository tests, protect the pure decision with direct
`deriveOperatorOutcome` cases and freeze the serialized public contract through
real `claimNextWork` packets and `submitAssignmentResponse` outcomes. Keep one
compiled public transaction per fixed trust boundary. Use lower-level helpers
only for malformed, stale, replay, authority, provenance, or other failure
behavior that the public transaction cannot isolate.

Treat a side-effecting CLI command's result bytes as part of transaction
closure. Await stdout and stderr write completion before the executable exits,
and test that boundary with a delayed stream callback. An exit code alone does
not prove the caller received the result needed to authenticate the side
effect.

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

Before an installed or disposable journey starts, arm symmetric outcome capture.
An unexpected outcome writes the exact terminal JSON, accepted transaction trace,
repository and package identities, and artifact digests, then preserves the
repository. Success writes the same identities, full accepted trace, and exact
boundary Assignment to a deterministic path outside the disposable root, and
preserves the repository until the evidence is audited. Cleanup happens only
after the corresponding durable outcome record is verified. Repair missing
capture before starting another fresh journey.

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

Source, Process Package, and artifact work does not itself freeze a useful lane.
Keep each lane on its exact identity through its named learning boundary, then
stop or freeze it at the exact boundary owned by the host policy without
requiring a replacement. Runner-only recovery may continue a valid lane when
authenticated evidence supports it, but a mixed-runner lane does not count
toward a single-identity reliability gate.

## Execution sequence

1. Read the portfolio, exact lane evidence, open issues, and release candidate record.
2. Operate lanes under [Targeted demos](#targeted-demos), [Focused fixes](#focused-fixes), and [Integration qualification](#integration-qualification).
3. Classify each finding and link it to the lane's exact evidence before editing code.
4. Follow [Release assembly](#release-assembly) when fixes qualify for a candidate.
5. Update portfolio and release records from exact Git, runner, snapshot, and package evidence.

At each coordinator checkpoint, use `OPERATING-POLICY.md` for measures and
scheduling and `MONITORING.md` for the report. Confirm that the host-owned
records identify the critical-path coordinator and next command, name each live
or draining demo, bind every proposed demo to a testable artifact and learning
loop, and expose delay from artifact readiness to its first operation.

If the next command is known and idle, run it before adding plans, reviews, or
documentation. A passing qualification proves an exact release can start a
demo. It is not demo evidence. Measure the learning loop through the first
fresh operation on that release and the accepted publication or truthful
boundary it reaches.

## Portfolio discipline

The machine-readable portfolio and concise human summary are the operating index. Before the first run, every lane records its product, purpose, expected endpoint, expected known failure, sole owner, paths, source commit and tree, Process Package identity and digest, artifact digests, runner commit, model, harness, and public targets. During operation it records the current phase, Assignment, last accepted publication, state, issue, and next action.

Use these states plainly: active, attended, blocked, stopped, terminal, complete, or superseded. Use `complete` only for an operational endpoint defined under [Targeted demos](#targeted-demos). A missing process is not a state. Runner output, snapshots, Git state, and package status decide the state.

Keep release candidates separate from demo history. Demo records answer what happened. Release records answer what exact bundle should run next.

## Scale ladder

Stay at the tiny tier until three consecutive fresh tiny demos on the current
supported release lineage reach `Lifecycle Complete` without a kernel/package
contradiction, false trace, false verification claim, or unbounded operator
recovery. Record the exact consecutive count and every failure in the existing
demo and release records. A failure resets the count and supplies the next
learning loop; the gate keeps demos running. Existing healthy tiny demos and
current qualification continue as operational evidence. This gate does not
invalidate them.

After the gate passes, increase one complexity axis at a time. The first scaled
tier remains a tiny runnable product, but has a few stakeholder requirements
and requires real decomposition. If that tier exposes a process defect, fix or
simplify the owning mechanism and run the same tier again before growing.

End-to-end trace integrity is a demo and release acceptance condition. Account
for every changed production line under an implementation or change artifact
that links through design and decomposed requirements to a stakeholder
requirement. Every claimed behavior must have a linked verification activity
and a recorded observation and result. This is graph coverage, not a demand for
one lifecycle artifact or source annotation per line. Unmapped production code,
or verification whose trace cannot reach a stakeholder requirement, is a
finding.

After the targeted canary satisfies the Phase 0 and first Phase 1 RUN/RES
acceptance boundary under [Targeted demos](#targeted-demos), keep Phase 3 and
later Process Package work behind the two-product, same-identity Phase 2
reliability gate owned by [issue
#222](https://github.com/taylorrowser/mdlm/issues/222). Apply that issue's exact
pass criteria. After the gate passes, add one complete operational slice at a
time and run it before expanding the next Phase.

Make simplifying how agents produce correct Lifecycle Data the current
priority. Judge simplification across the full V-model. Prefer CLI-derived
identities and relationships, compact authoring scaffolds, fewer manual copies,
shared level-aware rules, reused unchanged evidence, grouped compatible review
context, and artifacts that bind bounded sets of implementation paths. Agents author
decisions and product meaning while the CLI supplies mechanical lifecycle
structure. A simplification may increase the downstream lifecycle artifact
count only after demo evidence shows that the added artifact is needed.
