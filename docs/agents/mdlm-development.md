# MDLM development operations

Operational data is the main development signal. Measure correct accepted products and recovery from mistakes. Publications matter when they advance the product or close a learning loop. Preserve failures, fix what operation exposes, and release the smallest set of changes that unlocks useful operation.

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

Use the direct CLI described in `operator/MDLM.md` and `docs/contracts/direct-work.md`. Discovery and guidance are read-only. The agent chooses useful work; the kernel validates exact package/snapshot/subject, candidate graphs, receipts, authority and atomic publication. Package priorities are display suggestions.

Preserve exact submitted proposal bytes and caller operation IDs. Recover uncertain commands through proposal or execution settlement before doing more work. Independent review must remain separate from the author, and real stakeholder decisions come from the stakeholder. Historical products remain pinned to their installed release and are not rewritten by the fresh-only cutover.

Keep adapters as transports. They may expose package guidance, collect attended input and preserve operation journals. They do not recreate eligibility rules or deterministic work selection.

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

A process replacement uses a fresh tiny-product journey to test its own declared
route. Apply the host's exact qualification and launch rules. Earlier Phase 0,
Phase 1 RUN/RES, and full-V canary requirements describe historical packages and
are not prerequisites for the tiny package.

Continue each lane through accepted Reviews, publications, qualification, and Phase entry. Its operational endpoint is the controller result `Lifecycle Complete` or `Profile Boundary Reached`, or a package-declared terminal outcome. The exact stop conditions in the host policy's linked recovery runbook mark the lane stopped or blocked, not complete.

### Focused fixes

Assign every known demo-blocking issue a sole owner when an isolated worktree and host capacity are available. Fix lanes may run in parallel with all demo lanes.

Rank fixes by operational effect:

1. unsafe publication, provenance, or integrity behavior;
2. defects blocking several demos or the next release gate;
3. defects blocking one demo;
4. findings with no current operational effect.

Reproduce the observed failure once, add the smallest regression that fails for that reason, make the narrow fix, run focused tests and checks to green outside an active exact quiet-window reservation, and obtain one fresh-context review PASS. The one fresh reviewer performs the whole review directly and returns the sole verdict, without spawning standards or ticket subreviewers. Return to a demo after review. Broader hardening belongs in a separate nonblocking issue.

Before editing the Process Package for a defect, classify it against the
defect classes in `docs/process-package-learnings.md` and name the class in the
issue. Apply that class's rule and check instead of a one-off patch. When no
class fits, add one with its rule and check in the same change.

### Integration qualification

Keep one rolling integration lane separate from feature and fix writers. It tests only the exact candidate commit and tree recorded in `/home/ubuntu/git/mdlm-successor-demos/operations/releases.json`. Every command and result names that identity. If assembly changes either identity, preserve the old result and start qualification again on the replacement candidate.

The integration lane owns expensive checks:

- run the complete test suite under the host policy's serialized resource reservation;
- record total time, failures, and the slowest tests or files;
- distinguish product failures from flaky, redundant, or obsolete tests;
- optimize or remove slow tests that do not uniquely protect a current requirement, demonstrated defect, or trust boundary;
- rerun affected groups on that same candidate tree after test-only diagnosis.

Feature and fix writers rely on focused checks instead of repeating the full suite. Integration failures create focused follow-up work. They do not erase valid operational evidence.

Before reporting a redirected check as passing, inspect that check's exit status and log. A later successful command in the same shell does not establish that the check passed.

For a focused current tiny or exploratory test, use an explicit file filter with
`vitest.cutover.config.ts`, or the default Vitest config. Check the suite include
list before invoking a grouped filter; `vitest.fast.config.ts` contains historical
full-process files and can select zero tests. On this host, check Docker access
before bootstrap and use `sg docker` when the caller lacks the socket group.

Build the exact worktree before a public CLI regression whose helper invokes
`dist/mdlm.js`. A missing executable is preflight setup failure and supplies no
behavioral evidence.

In repository tests, protect meaningful graph and evidence checks through their stable interfaces and freeze the direct public contract with compiled CLI transactions. Keep one compiled public transaction per fixed trust boundary. Use lower-level helpers
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
boundary and operation to a deterministic path outside the disposable root, and
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

The machine-readable portfolio and concise human summary are the operating index. Before the first run, every lane records its product, purpose, expected endpoint, expected known failure, sole owner, paths, source commit and tree, Process Package identity and digest, artifact digests, runner commit, model, harness, and public targets. During operation it records the current lifecycle boundary, selected work, operation and last accepted publication, state, issue, and next action.

Use these states plainly: active, attended, blocked, stopped, terminal, complete, or superseded. Use `complete` only for an operational endpoint defined under [Targeted demos](#targeted-demos). A missing process is not a state. Runner output, snapshots, Git state, and package status decide the state.

Keep release candidates separate from demo history. Demo records answer what happened. Release records answer what exact bundle should run next.

## Tiny products first

Use the default tiny Process Package for new tiny products. Record each
stakeholder or software requirement as an individual REQ. Decompose behavior
through DCP groups with normal links to exact parent and child revisions wherever
useful; do not impose fixed tiers. The CLI batches requirements, materializes exact
groups, the requirement set and source scopes, and keeps one set-level review
without per-node author or review turns. Review each required child in its parent
context and the collective adequacy of every required group. Attribute every
nonblank supported source line to an explicit named region;
regions and software leaves use many-to-many normal links. The CLI derives
coverage and exempt blank gaps, while review judges responsibility boundaries. Keep executable expectations in the committed verification script and
use the direct implementation and verification route. Historical reports
describe the packages that produced them.

The tiny package uses stakeholder acceptance as its baseline boundary. Afterwards, choose the optional change action, obtain the stakeholder decision, and follow the approved targets and correction frontier. Preserve unaffected requirement and decomposition history. Retire requirements explicitly and resolve their selected group references. Historical runs retain their own selected package and accepted records.

The CLI owns mechanical checks before publication: schema and field validity,
exact references, complete requirement graphs, source attribution, fixed values,
execution receipt bindings, and script exit classification. The CLI captures
Docker execution; the committed script owns assertions and agents briefly assess
the captured run.
Independent reviewers judge content, decomposition adequacy, assumptions,
acceptance adequacy, and whether the product, verification script and captured
evidence support the claim. Generated source coverage does not prove that code
satisfies its linked requirements. When a reviewer catches a mechanically
decidable error, fix the owning CLI or package contract and retain one useful
regression instead of adding another review instruction.

The next learning loop is a correctly accepted tiny product and a preserved
mistake followed by correction. Record exact source/package identities,
requirements and implementation revisions, verification evidence, accepted
product outcome, publications, elapsed time, and human interventions. Distinguish
wrong code from a wrong expectation and state any unsupported correction path.
Use the smallest public-CLI exercise that demonstrates the changed behavior.
Source checks do not establish release qualification or authorize demo operation.

Repeat until short runs recover reliably before adding one complexity dimension.
Add planning artifacts or reviews when observed work needs a distinct decision
or claim. Useful requirement decomposition stays within the batch. Trace
implementation and verification evidence to exact requirement revisions in the
selected set. The tiny route does not require STK/SYS/CMP/DES tiers or the
historical Phase 2 expansion gate.

## Make operational learning durable

When a run exposes an inefficient instruction, review step, test, transport, or
orchestration rule, change the smallest owning mechanism promptly. Update its
owning instruction, runbook, skill, or command in the same work session. Keep this
improve-and-record rule present so future agents continue the loop. If a safe fix
cannot be made now, record one bounded follow-up issue and continue the simplest
valid path.

Keep evidence collection proportionate to the product. During the scheduled
two-hour retrospective, check delivery, fresh operational data, and test/review
cost. Apply at most three immediately useful improvements and update their owning
instructions. The retrospective is not an approval gate and does not pause a
healthy authorized lane.
