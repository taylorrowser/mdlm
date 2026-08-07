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
- package-delegated work with no scheduled attention runs in a fresh read-only
  delegate session without asking the stakeholder for per-execution permission;
- attended authority without exact applicable delegation stops at the projected
  Authority Requirement;
- after the stakeholder supplies attended authority, the same operating session
  runs the pending public Scenario with `--authorize` and immediately resumes the
  loop;
- when `req next` selects checkpoint-scheduled work, that reached checkpoint's
  attention is collected from `req loose-ends --json` by exact checkpoint and
  Consolidation Group, then presented together without treating
  the items as satisfied, deferred, or one transaction.

For package-delegated work with attention timing `none`, the operator starts a
fresh read-only pi session and uses the returned proposal in the canonical
operating session. Reviewer packets use only dry-run and public `req show`/`req
schema` projections and expand every exact definition and evidence member in the
frozen context. The operating session then passes the projected delegate role
with `--authorize`; this is the separate delegate supplying its declared
execution authority, not stakeholder authorization or operating-session
self-judgment.

Scenario dry-run also projects its package-declared `standingDelegation` contract
and exact `applicableEvidence` Revision IDs. When evidence exists, the operating
session may instead pass that exact Revision with `--delegation`. Standing
Delegation remains necessary when attended authority is being delegated, but it
is not a prerequisite for package-delegated/no-attention work.

## Stop conditions

The operator stops only for:

- an attended Authority Requirement without exact applicable delegation;
- unresolved attention at the currently reached checkpoint;
- genuine ambiguity or command failure;
- a failed doctor check; or
- a publicly proven completed implementation-profile boundary.

The stakeholder never needs to run lifecycle commands or repeat “continue” after
supplying requested authority.
