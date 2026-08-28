# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, including labels and comments.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments` with appropriate label and state filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`.
- **Apply or remove labels**: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`.
- **Close**: `gh issue close <number> --comment "..."`.

Infer the repository from `git remote -v`; `gh` does this automatically inside the clone.

## Open with the problem

After optional `## Parent` metadata, open every issue with a short `## Plain-language problem` section. In two to four sentences, say what someone observed, what should happen instead, and why the difference matters. A reader should understand the problem without knowing MDLM's internal types or source layout.

Put exact commits, logs, timings, diagnostics, and implementation constraints in later sections. The opening explains the problem. It does not replace evidence.

## Agent claim

`agent:in-progress` is the tracker lock. An agent claims an issue before creating a worktree, reproducing the defect, editing files, or running implementation checks:

1. Read the current issue, assignees, labels, comments, and blocking edges.
2. Confirm the issue is open, unblocked, labeled `ready-for-agent`, and has neither `agent:in-progress` nor another active owner.
3. Add `agent:in-progress`, remove `ready-for-agent`, and assign `@me`.
4. Re-read the issue. Begin work only when the claim is visible.

Read-only triage needed to decide whether an issue is claimable may happen before the claim. All implementation work starts after it. Treat any existing `agent:in-progress` label as another claim even when every agent shares one GitHub login. Only durable local controller state may resume the exact claim it created. Otherwise choose different work.

Release the claim when ownership ends. Remove `agent:in-progress` and unassign the owner in every case. Closed work gets no waiting triage role. For open work, remove any old triage role before adding exactly one next role:

- fully specified handoff: `ready-for-agent`;
- blocked on a decision or missing evidence: `needs-info`;
- human implementation required: `ready-for-human`.

A stopped process does not make a claim stale. Verify the owner, worktree, and recorded evidence before clearing someone else's claim.

## Pull requests as a triage surface

**PRs as a request surface: no.**

An implementation PR body records the fresh-context review result and exact reviewed commit and tree, or the scoped reason no review was required.

## When a skill says “publish to the issue tracker”

Create a GitHub issue.

## When a skill says “fetch the relevant ticket”

Run `gh issue view <number> --comments`.

## Parent and child tickets

A specification issue is the parent request. Tracer-bullet implementation tickets include a `## Parent` reference to that specification. Do not close or modify the parent while publishing child tickets.

## Blocking edges

Use GitHub's native issue dependencies. Add an edge with:

```text
gh api --method POST \
  repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by \
  -F issue_id=<blocker-database-id>
```

The database ID comes from:

```text
gh api repos/<owner>/<repo>/issues/<number> --jq .id
```

If native dependencies are unavailable, include a `## Blocked by` section containing issue references.

## Frontier

The frontier consists of open child tickets whose blockers are all closed and
which are not already assigned. Independent frontier tickets may proceed in
parallel. Give each ticket its own claim, isolated worktree, and sole writer, and
serialize updates to any shared evidence record.
