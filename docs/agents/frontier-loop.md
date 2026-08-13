# Autonomous frontier loop

For the system architecture, delivery rationale, observed failure modes, and operating lessons, see [Frontier implementation loop: architecture and operating lessons](frontier-loop-architecture-and-learnings.md).

The frontier loop snapshots the issue identities of both the tracer-bullet children of specification issue #83 and the older open `ready-for-agent` backlog at first start. It prefers dependency-safe tickets from the fixed priority identity set and chooses the lowest issue number when several are ready. If that map has no runnable ticket, it may select the lowest independently ready identity from the already-snapshotted backlog; it never absorbs later work. Quarantined identities are excluded from reservation but remain open blockers. Blocker state, issue contracts, and comments remain live deliberately. Each implementation receives a fresh Pi process and an isolated Git worktree.

For every available frontier ticket, the loop:

1. claims the issue;
2. creates a branch and worktree from the exact current `origin/main`;
3. invokes `/skill:implement` in a fresh, non-persistent Pi session pinned to `openai-codex/gpt-5.6-sol` with high thinking for focused checks and type checking without nested Pi or code-review sessions;
4. runs dependency installation, `git diff --check`, TypeScript type checking, and the bounded authoritative suite independently once to a completed result at each changed committed tip before review (an interrupted or unconfirmed in-flight run is retried);
5. writes an exact issue/parent/diff evidence packet and runs a fresh `openai-codex/gpt-5.6-sol` Pi process with high thinking and only read/search tools for Standards/Spec review, module-depth assessment, and disproportionate-complexity assessment;
6. remediates review or test findings in a fresh `/skill:implement` session;
7. escalates repeated failures through one diagnosis, one design simplification, one auditable broad contract review, and at most three evidence-scoped targeted repairs;
8. quarantines still-failing work without closing or merging it after the targeted budget is exhausted, then continues with another independent fixed-scope ticket;
9. otherwise pushes the validated exact commit, opens a closing pull request, watches remote checks, merges it, removes the completed worktree, and selects the next unblocked ticket.

The loop never invokes two implementation-ticket sessions concurrently. It does not close specification or epic parents.

## Autonomous correction and simplification

A failed ticket does not immediately stop the delivery run. The cumulative ticket-wide correction ladder is:

1. one broad remediation after the first failed validation;
2. one independent root-cause diagnostic instance;
3. one independent design-simplification instance;
4. one broad autonomous contract-review editing action, including any action caused by a failing remote check;
5. at most three typed `targeted-repair` actions; and
6. quarantine.

Each editing action and its consumed count are persisted together before Pi starts. Each editing or review invocation also receives a durable attempt-start identity before Pi starts. Crash/resume repeats the same typed pending action without replenishing or double-consuming a product budget or recounting an already-recorded timeout occurrence. No-op edits and repeated exact product failures still consume the targeted action that was scheduled; they never reopen broad contract review.

Every session that edits code starts with `/skill:implement`, but the orchestrator overrides that skill's final full-suite and code-review steps: editing sessions run focused checks and typecheck without launching nested Pi reviewers, while the orchestrator runs one authoritative fast suite and independent review at the final committed tip. Diagnostic sessions explicitly apply the diagnosing-bugs method. Simplification sessions explicitly apply codebase-design and grilling before editing, choose their recommended boundary autonomously, and never pause for stakeholder confirmation. A targeted repair receives a durable artifact containing only the latest exact failed command or read-only reviewer output, its stable semantic fingerprint, and whether it repeated. It uses diagnosing-bugs, reproduces only that narrow signal, makes the smallest root-cause repair, runs focused tests/typecheck, commits, and may not change contracts or broadly redesign. The historical issue log is not its primary evidence. The independent reviewer treats the active child as the current delivery boundary: parent invariants remain binding, while explicitly deferred sibling and final-contraction work remains deferred.

If an editing pass changes neither repository bytes nor issue comments, the loop records a no-op and advances the correction ladder without repeating command validation or independent review already cached at that SHA.

The shipping gate is deliberately delivery-biased: independently passing commands, active-ticket acceptance criteria, protected invariants, and concrete correctness/safety in delivered behavior are blocking. Module-depth preferences, cleanup opportunities, localized out-of-scope defects, and future hardening are recorded as non-blocking follow-ups rather than triggering another correction cycle. Complexity review is triggered only by a protected-architecture violation or configurable diff budgets. The default triggers are more than 24 changed files, more than 1,800 changed lines, or more than 12 changed lifecycle modules. The budget is reevaluated for every new commit produced by implementation, remediation, diagnosis, or simplification. A trigger requests design review; it does not itself reject a justified vertical slice.

Contract review first attempts a smaller implementation of the unchanged contract. Only when a criterion itself forces an unbounded analyzer, generic workflow engine, cross-owner atomic transaction, or similar disproportionate mechanism may it record a smaller contract clarification. Any clarification is posted as an auditable issue comment naming retained behavior, deliberately given-up behavior, and its relationship to the parent goal. It may not waive:

- atomic Scenario publication;
- one canonical repository writer;
- package or harness neutrality;
- independent judgment;
- tests or independent review.

The independent Spec reviewer reads issue comments and must still pass the resulting behavior.

## Recovery and supervision

The detached tmux process is a supervisor. If the runner exits before completion, the supervisor preserves state and the current worktree, waits 30 seconds, and starts it again. Validated commit identity is persisted and compared with the local branch, remote PR head, and merge command. The loop confirms the PR reaches `MERGED` before closing its issue or deleting local work, and reconciles interrupted post-merge cleanup on restart.

Every potentially blocking external operation inside the long-lived supervised runner has a finite timeout. Process-group launchers cancel their timeout immediately when the child exits so successful editing and review actions return without waiting for the unused timeout remainder. Clearly transient Pi/provider failures such as `fetch failed`, connection reset, rate limiting, and gateway errors receive bounded in-place retries for both implementation and review agents without consuming product correction budgets or producing product-failure evidence. Editing and read-only Pi invocations run in dedicated Unix process groups. On timeout the process-group runner sends SIGTERM to the whole group, waits briefly, then sends SIGKILL and raises a typed agent-process timeout, preventing Pi-owned test/build descendants from surviving. The execute/review boundary persists the exact action-plus-attempt occurrence and increments a separate ticket-wide timeout count before control returns. One fresh retry of the pending action is allowed. A second timeout quarantines the ticket as `agent-infrastructure-timeout`, preserves its branch/worktree, removes assignment, and continues independent fixed scope without consuming product correction counts or manufacturing a product finding/fingerprint. A reviewer timeout retry resumes at review and reuses command validation already proved at the exact head. A reviewer verdict is accepted only when exactly one complexity line and one validation line are the final two lines; malformed output retries review without changing product code. GitHub transient failures receive shared retries and backoff. Missing remote-check registration or command failure retries publication without editing, while only an observed failing check bucket enters the product correction ladder.

Operational state is written atomically beneath ignored `artifacts/frontier-loop-83/`. It records both scope snapshots, current issue, phase, typed pending action, durable agent attempt identity, ticket-wide agent-timeout count and occurrence identities, branch, worktree, log, pull request, exact-head validation/review/publication identities, every product-correction count, current and previous product-failure fingerprints, repeat count, latest failure-evidence path, quarantines, supervisor restarts, and last error. Stable product fingerprints strip ANSI, timestamps, durations, and temporary-root noise while retaining command identity and semantic failure content such as failed test names, assertions, source locations, and blocking review findings. Each quarantine is appended to a durable record ledger with its class, preserved branch/worktree, and class-appropriate evidence. Per-ticket logs retain full history, but targeted repair uses only the latest product-failure artifact as primary evidence.

A safe reload uses a separate `MAINTENANCE` marker rather than the immediate `STOP` marker. A maintenance controller atomically arbitrates a reload request against reservation of the next ticket. The runner finishes, validates, publishes, and cleans up any already-reserved ticket, then enters `maintenance-ready` only with no current issue, branch, or worktree. The existing durable tmux supervisor fast-forwards the clean control checkout and spawns a fresh runner from the updated code. The fresh runner atomically renames the request to a durable acknowledgement before clearing it, so a crash between fast-forward and startup cannot lose the reload. An explicit stop cancels both request and acknowledgement; reload failures retry under the same supervisor. Editing, validation, review, and publication phases are never interrupted.

The loop reports `complete` only when every fixed priority and backlog identity is actually closed. If neither fixed pool has runnable work while open quarantined, assigned, or blocked identities remain, it enters terminal `process-dead-end`. The supervisor does not restart that outcome, health is nonzero, and status lists every quarantine and preserved worktree. There is no attended/human-stop workflow state. A `STOP` marker remains the explicit emergency operator stop mechanism.

## Safety boundary

Starting the loop authorizes Pi and the orchestration script to:

- edit and commit code in isolated worktrees;
- run local commands and tests;
- assign implementation tickets;
- push ticket branches;
- create and merge passing pull requests;
- close their linked child tickets; and
- post an active-ticket contract clarification only through the guarded complexity process above.

The control checkout must be clean and exactly match `origin/main` before first start. A clean checkout that is merely behind the remote is fast-forwarded. Commit and push the loop itself, `CONTEXT.md`, and other planning changes before starting so ticket branches cannot silently omit them.

Required tools are tmux, Pi with a configured provider/model, Git, npm, `shlock` for crash-recoverable local gate ownership, and authenticated GitHub CLI access sufficient to assign issues and manage branches and pull requests.

## Commands

Start or resume the detached supervised loop:

```sh
npm run frontier:start
```

Reload updated loop code automatically at the next safe between-ticket boundary:

```sh
npm run frontier:reload
```

This command returns immediately. The current ticket continues uninterrupted; status shows the pending maintenance request until the ticket is merged and cleaned up, then the existing supervisor fast-forwards and reloads the runner.

Print current health, phase, ticket, branch/worktree, PR, correction budgets, fingerprints/evidence, quarantines, priority/backlog progress, next item, and recent log:

```sh
npm run frontier:status
```

Continuously print the same status every 30 seconds:

```sh
npm run frontier:watch
```

Use a scriptable health probe (`0` while supervised or complete; nonzero for `process-dead-end` or lost supervision):

```sh
npm run frontier:health
```

Attach to the live tmux output:

```sh
npm run frontier:attach
```

Detach without stopping using the tmux prefix followed by `d`.

Stop the runner and record the durable stop marker:

```sh
npm run frontier:stop
```

For direct log monitoring, use the paths printed by `frontier:status`, for example:

```sh
tail -F artifacts/frontier-loop-83/runner.log
tail -F artifacts/frontier-loop-83/issue-84.log
```

## Overrides

The default parent is issue #83 and the default tmux session is `mdlm-frontier-83`. A different parent can be supplied directly:

```sh
node scripts/frontier-loop.mjs start --parent 123
node scripts/frontier-loop.mjs status --parent 123
```

## Test tiers

`npm test` is the normal authoritative gate. It builds once, verifies every Vitest file is classified exactly once, runs fast package/evaluator coverage plus representative compiled-CLI contracts, and runs controller tests. Its target wall time is under five minutes.

`npm test` is the single bounded authoritative gate. It combines package/evaluator contracts with representative compiled-public transactions instead of retaining exhaustive duplicate lifecycle reconstructions. `npm run test:all` is an alias for the same complete bounded gate. New test files must be classified in `vitest.suites.mjs`; verification fails if a file is missing, duplicated, or stale.

Environment overrides:

- `MDLM_FRONTIER_PARENT` — default priority-map parent issue;
- `MDLM_FRONTIER_SESSION` — tmux session name;
- `MDLM_FRONTIER_DIR` — operational state/log/worktree root;
- `MDLM_FRONTIER_MAX_CHANGED_FILES` — proactive complexity trigger;
- `MDLM_FRONTIER_MAX_CHANGED_LINES` — proactive complexity trigger;
- `MDLM_FRONTIER_MAX_LIFECYCLE_MODULES` — proactive lifecycle-module trigger;
- `MDLM_FRONTIER_COMMAND_TIMEOUT_MS` — ordinary Git/GitHub/tmux command timeout;
- `MDLM_FRONTIER_AGENT_TIMEOUT_MS` — editing and read-only review Pi session timeout;
- `MDLM_FRONTIER_VALIDATION_TIMEOUT_MS` — per-command validation timeout.
