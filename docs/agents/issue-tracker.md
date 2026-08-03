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

## Pull requests as a triage surface

**PRs as a request surface: no.**

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

The frontier consists of open child tickets whose blockers are all closed and which are not already assigned. Work one frontier ticket at a time.
