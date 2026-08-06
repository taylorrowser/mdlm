# Generic pi operator loop

The reusable example under [`examples/pi-operator`](../examples/pi-operator)
turns pi into a package-neutral MDLM operator. Copy its `AGENTS.md` and `.pi`
directory into an initialized lifecycle repository, provide conventional
`./bin/req` and `./bin/scenario-adapter` executables, trust the project, and run
`/mdlm`.

The template deliberately contains no Phase, lifecycle-type, Scenario, metric,
or recommendation sequence. The selected Process Package remains the source of
work and participation semantics. Normal operation uses only public `req`
projections; it does not read raw package YAML, private MDLM source, authoritative
Markdown directly, or disposable generated views.

## Continuous operation

For each transaction, the operator:

1. requires a clean Git tree, then reads the one deterministic item from
   `req next --json`;
2. treats a selected checkpoint-scheduled item as that checkpoint being reached
   and collects its compatible attention before execution;
3. dry-runs its exact `actionableResolver` under its exact Obligation Instance;
4. follows the resolved prompt, skills, inputs, Policies, participation, output
   contract, prohibited inputs, and completion expression;
5. executes one atomic transaction through the configured adapter;
6. runs `req doctor --json`, stages and checks only changes made since the clean
   boundary, commits non-interactively, and reevaluates `req next --json` without
   returning to the stakeholder.

“One coherent Scenario” therefore describes an atomic publication boundary, not
an assistant-turn boundary. A successful Review, gate, commit, or Phase
progression is not by itself a reason to pause.

If `next.item` is null, the operator uses public Phase-status and Loose-End
projections to distinguish the implemented profile boundary from blocked,
ambiguous, or failed work. It does not invent an explicitly initiated Scenario.

## Authority and attention

Participation remains independent of transaction batching:

- autonomous work continues immediately;
- nondelegable or otherwise unattended authority stops at the exact projected
  Authority Requirement;
- after the stakeholder supplies that authority, the same operating session runs
  the pending public Scenario with `--authorize` and immediately resumes the
  loop;
- when `req next` selects checkpoint-scheduled work, that reached checkpoint's
  attention is collected from `req loose-ends --json` by exact checkpoint and
  Consolidation Group, then presented together without treating
  the items as satisfied, deferred, or one transaction.

A Scenario dry-run now projects its package-declared `standingDelegation`
contract and exact `applicableEvidence` Revision IDs for each invocation. When a
delegated independent Review has applicable evidence, the operator starts a
fresh read-only pi session for the judgment and uses the returned proposal in the
canonical operating session. The operating session passes the exact projected
Revision with `--delegation`; it neither reuses its own judgment nor asks the
stakeholder to repeat standing permission. No evidence means no delegation.

## Stop conditions

The operator stops only for:

- a projected nondelegable Authority Requirement;
- unresolved attention at the currently reached checkpoint;
- genuine ambiguity or command failure;
- a failed doctor check; or
- a publicly proven completed implementation-profile boundary.

The stakeholder never needs to run lifecycle commands or repeat “continue” after
supplying requested authority.
