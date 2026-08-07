---
description: Run declarative MDLM work continuously to the next real authority boundary
---
Operate the selected lifecycle through the public interface. Continue the loop;
one coherent Scenario means one atomic transaction at a time, not one assistant
turn. Do not return merely because a transaction, Review, gate, or checkpoint was
completed.

## Continuous loop

1. Require `git status --porcelain` to be empty, then run
   `./bin/req next --json`. A dirty starting tree is genuine ambiguity: stop
   rather than absorb unrelated work. Never select lifecycle work from memory.
2. Inspect the selected item's projected participation. If its attention timing
   is `checkpoint`, that declared checkpoint is now reached: collect attention as
   described below before execution. Otherwise continue to exact dry-run.
3. For an ordinary Dispatchable item, use its exact `id` and
   `actionableResolver`:
   ```bash
   ./bin/req scenario dry-run '<scenario@version>' \
     --obligation '<exact-obligation-instance>' --json
   ```
   Treat the returned exact inputs, prompt and full skills, Policies,
   participation, prohibited inputs, outputs, required links, and completion
   expression as the complete instruction bundle. Use `./bin/req show` and
   `./bin/req schema` only when that bundle requires public semantic inspection.
4. Prepare exactly the declared transaction through the configured adapter and
   execute the same projection:
   ```bash
   ./bin/req scenario execute '<scenario@version>' \
     --obligation '<exact-obligation-instance>' \
     --adapter './bin/scenario-adapter' --json
   ```
   Never imitate execution with piecemeal authoring or direct Markdown edits.
5. After successful publication, run `./bin/req doctor --json`. If doctor passes,
   every changed path is transaction-owned because the starting tree was clean.
   Run `git add -A`, inspect `git diff --cached`, stop on any unexpected path or
   content, require `git diff --cached --check` to pass, and commit non-interactively with
   `git commit -m 'Complete atomic lifecycle transaction'`. Then immediately run
   `./bin/req next --json` again.

## Participation and attention

- Autonomous work: execute without asking permission.
- Package-delegated work with attention timing `none`: the Process Package has
  already selected a separate authority; this does not require stakeholder
  authorization merely because `standingDelegation.applicableEvidence` is empty.
  Assemble the delegate packet only from dry-run plus public `req show` and
  `req schema` projections. For contextual judgment, expand every exact
  definition and evidence member named by the frozen context with `req show`.
  Pipe the complete packet to a fresh read-only pi session using
  `pi -p --no-session --no-tools`; require it to return the judgment and proposed
  authority-evidence output. Do not reuse the operating session's judgment.
  After a valid delegate response, execute with `--authorize '<projected-authority>'`.
- Exact standing delegation: when dry-run projects an applicable reviewed
  Revision, the operating session may instead execute through the same prepared
  response using `--delegation '<exact-delegation-revision>'`. Standing delegation
  remains reusable exact evidence, but it is not a prerequisite for
  package-delegated work whose attention timing is `none`.
- Attended or otherwise attention-bearing work: stop for the projected authority
  unless exact applicable standing-delegation evidence is allowed and supplied.
  Never convert nondelegable stakeholder judgment into package-delegated work.
- Reached checkpoint attention: only when `req next` selects an item whose
  attention timing is `checkpoint`, run `./bin/req loose-ends --json` and collect
  all ready items with the same declared checkpoint and `consolidationGroup`. Present them
  together, preserving each exact Obligation and Authority Requirement. This is
  attention consolidation only; execute each authorized Scenario as its own
  declared atomic transaction.

When the user supplies requested attended authority, apply it to the pending
Scenario with `--authorize '<projected-authority>'`, publish the required exact
authority evidence, and Resume the loop immediately. Do not ask the user to run a
command, restate approval, or say continue.

## Stop boundaries

Stop only at an attended Authority Requirement without exact applicable delegation,
unresolved attention at the currently reached checkpoint, genuine ambiguity or
command failure, failed doctor check, or completed profile boundary. A
package-delegated/no-attention requirement is not a stop boundary. If `next.item` is null, run
`./bin/req phase status --json` and `./bin/req loose-ends --json`; stop only when
those public projections prove the completed profile boundary or identify a real
blocker. Report the exact projection and do not invent an explicitly initiated
Scenario or package sequence to escape a null queue.
