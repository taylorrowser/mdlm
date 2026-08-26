# MDLM development operations

Operational data is the main development signal. A lifecycle run to a controller or package endpoint tells us more than another round of isolated hardening. Keep demos moving, preserve failures, fix what operation exposes, and release the smallest set of changes that unlocks more operation.

## Read this first

Read `CONTEXT.md`, relevant ADRs, and `docs/mdlm-process-overview-v0.8.md`.

The orchestration policy at `/home/ubuntu/git/mdlm-orchestration/AGENTS.md` owns host-specific paths, evidence rules, recovery rules, and safety limits. Follow both documents. If they conflict, preserve evidence and stop for a policy decision.

## Keep four kinds of work moving

Run these lanes independently. A blocked lane must not idle the others.

### Full demos

An eligible demo lane is initialized under the exact identity required by [Portfolio discipline](#portfolio-discipline), has clean Git state and valid integrity, has no uncertain-publication or provenance stop, and has one sole owner.

Keep at least two eligible full-profile lanes. On the current four-core host, target three concurrent lifecycle operators and keep the cap of three. If fewer than two lanes are eligible, record the exact capacity blocker for each missing slot and initialize replacements until two lanes are eligible.

A known downstream blocker does not consume an empty slot when a fresh lane can collect upstream evidence. Record the expected blocker and prefer different products, authority paths, external evidence, and lifecycle phases.

Continue each lane through accepted Reviews, publications, qualification, and phase entry. Its operational endpoint is the controller result `Lifecycle Complete` or `Profile Boundary Reached`, or a package-declared terminal outcome. The exact stop conditions in the orchestration policy mark the lane stopped or blocked, not complete.

### Focused fixes

Assign every known demo-blocking issue a sole owner when an isolated worktree and host capacity are available. Fix lanes may run in parallel with all demo lanes.

Rank fixes by operational effect:

1. unsafe publication, provenance, or integrity behavior;
2. defects blocking several demos or the next release gate;
3. defects blocking one demo;
4. findings with no current operational effect.

Reproduce the observed failure once, add the smallest regression that fails for that reason, make the narrow fix, run focused checks to green, and obtain one fresh-context review PASS. Return to a demo after review. Broader hardening belongs in a separate nonblocking issue.

### Integration qualification

Keep one rolling integration lane separate from feature and fix writers. It tests only the exact candidate commit and tree recorded in `/home/ubuntu/git/mdlm-successor-demos/operations/releases.json`. Every command and result names that identity. If assembly changes either identity, preserve the old result and start qualification again on the replacement candidate.

The integration lane owns expensive checks:

- run the complete test suite serially under the host safety limits;
- record total time, failures, and the slowest tests or files;
- distinguish product failures from flaky, redundant, or obsolete tests;
- optimize or remove slow tests that do not uniquely protect a current requirement, demonstrated defect, or trust boundary;
- rerun affected groups on that same candidate tree after test-only diagnosis.

Feature and fix writers rely on focused checks instead of repeating the full suite. Integration failures create focused follow-up work. They do not erase valid operational evidence.

### Release assembly

Build releases around changes that unblock demonstrations. Do not wait for unrelated cleanup.

Every included change must have focused green evidence and a fresh-context review PASS. Merge eligible changes, fetch `origin/main`, and record its exact commit and tree in `/home/ubuntu/git/mdlm-successor-demos/operations/releases.json`. The candidate record also names included commits, pull requests, and issues, Process Package identity and digest, artifacts and digests, runner commit, model, harness, public targets, expected demo unblocks, integration status, and carried blockers.

Qualification occurs after merge on that recorded `origin/main` commit and tree. Any later merge or branch update supersedes the candidate and requires qualification of the replacement exact commit and tree. Build artifacts and start fresh demos only from the qualified tree.

A Process Package or artifact change freezes old lanes. Runner-only recovery may continue a valid lane when authenticated evidence supports it, but a mixed-runner lane does not count toward a single-identity reliability gate.

## Execution sequence

1. Read the portfolio, exact lane evidence, open issues, and release candidate record.
2. Operate lanes under [Full demos](#full-demos), [Focused fixes](#focused-fixes), and [Integration qualification](#integration-qualification).
3. Classify each finding and link it to the lane's exact evidence before editing code.
4. Follow [Release assembly](#release-assembly) when fixes qualify for a candidate.
5. Update portfolio and release records from exact Git, runner, snapshot, and package evidence.

## Portfolio discipline

The machine-readable portfolio and concise human summary are the operating index. Before the first run, every lane records its product, purpose, expected endpoint, expected known failure, sole owner, paths, source commit and tree, Process Package identity and digest, artifact digests, runner commit, model, harness, and public targets. During operation it records the current phase, Assignment, last accepted publication, state, issue, and next action.

Use these states plainly: active, attended, blocked, stopped, terminal, complete, or superseded. Use `complete` only for an operational endpoint defined under [Full demos](#full-demos). A missing process is not a state. Runner output, snapshots, Git state, and package status decide the state.

Keep release candidates separate from demo history. Demo records answer what happened. Release records answer what exact bundle should run next.
