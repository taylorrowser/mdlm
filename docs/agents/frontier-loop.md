# Autonomous frontier loop

The frontier loop snapshots the issue identities of both the tracer-bullet children of specification issue #83 and the older open `ready-for-agent` backlog at first start. It works through the fixed priority identity set first by selecting only dependency-safe frontier tickets (native dependencies first, with explicit `## Blocked by` fallback references) and choosing the lowest issue number when several are ready, then processes the fixed older identity set. Later issues, labels, or unrelated reopenings cannot silently change those sets. Blocker state, issue contracts, and comments remain live deliberately: blockers must close, and autonomous contract clarification must be auditable to later implementation and review sessions. Each implementation receives a fresh Pi process and an isolated Git worktree.

For every available frontier ticket, the loop:

1. claims the issue;
2. creates a branch and worktree from the exact current `origin/main`;
3. invokes `/skill:implement` in a fresh, non-persistent Pi session;
4. runs dependency installation, `git diff --check`, TypeScript type checking, and the full test suite independently;
5. writes an exact issue/parent/diff evidence packet and runs a fresh Pi process with only read/search tools for Standards/Spec review, module-depth assessment, and disproportionate-complexity assessment;
6. remediates review or test findings in a fresh `/skill:implement` session;
7. escalates repeated failures through fresh diagnosis, design simplification, and—when the written contract itself forces disproportionate machinery—an auditable autonomous contract review;
8. pushes the validated exact commit, opens a closing pull request, watches remote checks, and merges it;
9. removes the completed worktree and selects the next unblocked ticket from the updated default branch.

The loop never invokes two implementation-ticket sessions concurrently. It does not close specification or epic parents.

## Autonomous correction and simplification

A failed ticket does not immediately stop the delivery run. The correction ladder is:

1. one broad remediation after the first failed validation;
2. up to two independent root-cause diagnostic instances;
3. up to two independent design-simplification instances; and
4. an autonomous contract review, after which the correction budgets reset and validation continues.

Every session that edits code starts with `/skill:implement`. Diagnostic sessions explicitly apply the diagnosing-bugs method. Simplification sessions explicitly apply codebase-design and grilling before editing.

Complexity review is triggered by independent reviewer judgment or configurable diff budgets. The default triggers are more than 24 changed files, more than 1,800 changed lines, or more than 12 changed lifecycle modules. The budget is reevaluated for every new commit produced by implementation, remediation, diagnosis, or simplification. A trigger requests design review; it does not itself reject a justified vertical slice.

Contract review first attempts a smaller implementation of the unchanged contract. Only when a criterion itself forces an unbounded analyzer, generic workflow engine, cross-owner atomic transaction, or similar disproportionate mechanism may it record a smaller contract clarification. Any clarification is posted as an auditable issue comment naming retained behavior, deliberately given-up behavior, and its relationship to the parent goal. It may not waive:

- atomic Scenario publication;
- one canonical repository writer;
- package or harness neutrality;
- independent judgment;
- tests or independent review.

The independent Spec reviewer reads issue comments and must still pass the resulting behavior.

## Recovery and supervision

The detached tmux process is a supervisor. If the runner exits before completion, the supervisor preserves state and the current worktree, waits 30 seconds, and starts it again. Validated commit identity is persisted and compared with the local branch, remote PR head, and merge command. The loop confirms the PR reaches `MERGED` before closing its issue or deleting local work, and reconciles interrupted post-merge cleanup on restart.

Every potentially blocking external operation inside the long-lived supervised runner has a finite timeout; the runner itself remains alive until completion or an explicit stop. Clearly transient Pi/provider failures such as `fetch failed`, connection reset, rate limiting, and gateway errors receive bounded in-place retries for both implementation and review agents before control returns to the supervisor. Every editing action is persisted as a typed pending action before Pi starts, so a supervisor restart resumes the same implementation, remediation, diagnosis, simplification, or contract-review mode without consuming another budget slot. A reviewer verdict is accepted only when exactly one complexity line and one validation line are the final two lines; malformed output retries review without rerunning commands already validated at the same commit or changing product code. GitHub transient failures receive shared retries and backoff. Repositories with workflows wait for checks to register before watching them; missing registration or command failure returns publication to the supervisor without changing code, while only an observed failing check bucket enters the product correction ladder.

Operational state is written atomically beneath ignored `artifacts/frontier-loop-83/`. It records both scope snapshots, current issue, phase, typed pending action, branch, worktree, log, pull request, command-validated head, publication-validated head, one-remediation use, complexity-reviewed head, diagnostic/design/contract counts, supervisor restarts, and last error. Per-ticket logs retain every implementation, validation, review, remediation, and escalation section.

The loop stops automatically only when all priority-map children and all older eligible `ready-for-agent` backlog tickets are closed. A `STOP` marker is the explicit operator stop mechanism.

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

Required tools are tmux, Pi with a configured provider/model, Git, npm, and authenticated GitHub CLI access sufficient to assign issues and manage branches and pull requests.

## Commands

Start or resume the detached supervised loop:

```sh
npm run frontier:start
```

Print current health, phase, ticket, branch/worktree, PR, escalation counts, priority-map progress, backlog count, next item, and recent log:

```sh
npm run frontier:status
```

Continuously print the same status every 30 seconds:

```sh
npm run frontier:watch
```

Use a scriptable health probe (`0` while supervised or complete, nonzero otherwise):

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

Environment overrides:

- `MDLM_FRONTIER_PARENT` — default priority-map parent issue;
- `MDLM_FRONTIER_SESSION` — tmux session name;
- `MDLM_FRONTIER_DIR` — operational state/log/worktree root;
- `MDLM_FRONTIER_MAX_CHANGED_FILES` — proactive complexity trigger;
- `MDLM_FRONTIER_MAX_CHANGED_LINES` — proactive complexity trigger;
- `MDLM_FRONTIER_MAX_LIFECYCLE_MODULES` — proactive lifecycle-module trigger;
- `MDLM_FRONTIER_COMMAND_TIMEOUT_MS` — ordinary Git/GitHub/tmux command timeout;
- `MDLM_FRONTIER_AGENT_TIMEOUT_MS` — editing Pi session timeout;
- `MDLM_FRONTIER_VALIDATION_TIMEOUT_MS` — per-command validation timeout.
