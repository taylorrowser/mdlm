# Develop MDLM

MDLM keeps behavior connected to stakeholder needs through requirements,
implementation, independent verification and change history. Use working products
to find gaps. Improve the smallest mechanism responsible for an observed problem.

## Start a task

1. Read [README](../../README.md), [CONTEXT](../../CONTEXT.md), the relevant
   [ADRs](../adr/) and the issue with its latest comments. Check open PRs for overlap.
2. Claim the issue through [the tracker](issue-tracker.md). Use one branch in an
   isolated checkout per task, based on current `origin/main`. Preserve other
   agents' branches and uncommitted work.
3. Follow [cloud setup](../CLOUD-DEVELOPMENT.md). Record the checkout commit and
   dependency lockfile identity. A saved environment may contain older dependencies.
4. Name the result someone can exercise and the question that exercise answers.
   Deliver that slice, run focused checks, and request independent review.

The kernel owns integrity, storage, evaluation and publication. Process Packages
own lifecycle definitions, prompts and process decisions. Codex and Pi are
adapters. Keep adapter scheduling out of the kernel.

## Changes and reviews

Reproduce an observed defect, add the smallest useful regression, make the bounded
fix and run the affected checks. Preserve the original failure evidence. Rank
unsafe publication and integrity defects ahead of convenience improvements.
Broader work needs its own issue.

Give a fresh reviewer the ticket, exact candidate commit and tree, changed files,
relevant context and check results. The reviewer owns the verdict and directly
reviews the whole assigned scope. Record findings or PASS in the PR with that
identity. If the candidate changes, identify what needs fresh review. A draft PR
may say review pending; it is not ready to merge until required review is complete.

Publish a handoff in the issue or PR before ending a task. Include exact commits,
commands and results, unresolved findings, durable evidence locations, ownership
and the next action. Commit or upload needed artifacts to private storage before
the workspace disappears. A local path or conversation summary alone is not a
handoff to another cloud task.

## Checks and release evidence

Build the exact checkout before tests that invoke `dist/mdlm.js`. Check the
Vitest configuration's include list when selecting individual files; a run that
selects no tests proves nothing. Use focused tests while implementing and
`npm run test:pr` for the integrated PR checks. `npm run test:release` adds the
adapter and installed-artifact journey. Scripts and exact commands live in
`package.json`. Inspect each command's actual exit status and output.

Probe Docker before selecting runtime-dependent checks. If the environment cannot
execute the required container, report those checks as not run and preserve the
capability failure. Run them on an authorized capable environment against the same
committed product, verifier, package and kernel identities. A mocked runtime or a
successful build does not establish actual-product verification.

Keep one stable regression per changed behavior or trust boundary. Measure slow
checks before broadening coverage. Preserve meaningful malformed, stale, replay,
authority and provenance rejection checks. Assert a package version only when
selection or provenance is the behavior under test. Use current unversioned action
names for guidance, then retain the exact returned action reference in proposals.

For a release, record the exact integrated commit and tree, kernel version,
Process Package commit/version/digest, artifact digests, check results and review.
Confirm `mdlm --version` has matching shipped `mdlm release-notes`. Qualify that
exact artifact before using it for a release demonstration. Changed source or
dependency identities require fresh applicable checks. Source tests, installed
qualification and an accepted demonstration are distinct evidence.

## Process Package work

Edit and version process definitions in the separate private
[mdlm-process-package repository](https://github.com/taylorrowser/mdlm-process-package).
Its distribution and process versions advance independently of the kernel.
Classify observed package defects using [process learnings](../process-package-learnings.md).
Prefer a package correction when the kernel already supports the needed behavior.

The kernel's `package.json` and lockfile pin an exact distribution commit.
Updating that dependency is an explicit kernel-repository change with its own
checks. A nearby package checkout never overrides the pin automatically. Existing
products retain their selected local package until the
[compatible upgrade procedure](../upgrades.md) succeeds. Test upgrades on a copy
of preserved history and report changed expectations, retained history and limits.

## Product demonstrations

Start a demo only with a concrete learning question, a runnable artifact and one
owner. Prefer one manageable run, then increase complexity when results justify it.
Record the product purpose, stakeholder authority, kernel and package identities,
runner/model if relevant, expected endpoint and evidence destination before use.
An agent may act as stakeholder only where the user explicitly delegated that
authority. Real product decisions remain with the actual stakeholder.

Operate through the product's generated `MDLM.md`, [operator guide](../../operator/MDLM.md)
and [direct-work contract](../contracts/direct-work.md). The agent chooses available
work; the kernel validates publication. Package priorities are suggestions.
Keep the author, independent reviewer and verifier roles separate. Verification
authors first derive actions and expected outcomes from the exact requirements,
decompositions and interface obligations, without reading product source/tests or
prior results. Freeze those expectations before adapting previously used test
mechanics. Independent adequacy review judges coverage and method fit.

Requirements should express necessary behavior at the level justified by the
selected package and architecture. Review each child under its immediate parent
and judge whether all children together satisfy that parent. Reachability through
the whole graph is not proof of immediate decomposition sufficiency. Review changes
against prior revisions and justify removals. Source attribution is a coverage
mechanism; independent review must still judge whether the code meets its claims.

Preserve exact proposal bytes, operation IDs, execution receipts and accepted
transactions. When a command's outcome is uncertain, use its documented settlement
or receipt retrieval before taking another side effect. Never infer success from
an exit code or blindly replay an operation. Preserve failures and correct through
the lifecycle; do not rewrite frozen history.

Capture successful and failed journeys with the same identifying evidence. Include
requirement/implementation/verification revisions, exact source commits, package
identity, commands, receipts, timings and interventions. Preserve repositories until
their durable handoff is verified. Report the actual package endpoint, blocked work
or stopped operation. An absent process does not mean lifecycle completion.

After each useful run, compare expected and observed behavior, review requirement
and decomposition quality, and record which instruction or implementation changed
because of the evidence. Fix small avoidable friction in its owning document or
command in the same session. Otherwise create one bounded follow-up issue.

## Existing EC2 evidence

The old host campaign's fleet, timers, paths and release reservations describe that
campaign only. Historical records stay unchanged. New cloud development follows
this guide and [the migration handoff](../CLOUD-NEXT-STEPS.md). To resume an old
product, first transfer and authenticate its full required state and explicitly
establish the new owner; a source checkout alone cannot resume its lifecycle.
