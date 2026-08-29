# Generic pi operator loop

The reusable example under [`examples/pi-operator`](../examples/pi-operator)
turns pi into a package-neutral MDLM harness. Copy its `AGENTS.md` and `.pi`
directory into a repository created by `mdlm init`, trust the project, and run
`/mdlm` with the `mdlm` executable available to the harness.

The template contains no package-specific phase, lifecycle type, Scenario,
metric, or recommendation sequence. The selected Process Package owns work,
participation, authority, output, and completion semantics.

## One transaction

For each transaction, the harness:

1. requires `git status --porcelain` to be empty;
2. calls `mdlm next --json` once and branches on its `mdlm-next@2` outcome;
3. gives the included `mdlm-assignment-packet@3` to one worker for Assignment or
   Attention Required;
4. submits one complete `mdlm-assignment-response@2` with
   `mdlm scenario submit [response-file|-] --json`;
5. handles the returned `mdlm-submission-outcome@1`;
6. after acceptance, runs `mdlm doctor --json`, inspects and commits only the
   transaction diff; and
7. starts the next transaction with a fresh `mdlm next --json` call.

Ordinary operation goes directly from `next` to `submit`. Read-only status and
Assignment commands may inspect named evidence during diagnosis; work selection
and packet assembly stay inside `next`.

## Packet-only work

The Assignment Packet is the complete harness-neutral instruction boundary. It
contains the exact Process Package and repository identities, prompt, skills,
inputs, schemas, Policies, participation, authority requirements, prohibited
inputs, symbolic outputs, completion conditions, response schema, and response
scaffold. The worker uses that packet alone and returns one complete response.

Proposal outputs use the packet's symbolic handles. The worker does not predict
Stable Datum or Revision IDs, build required links, copy authority strings into
proposal content, or inspect raw package definitions for missing inputs. MDLM
resolves kernel-managed identity and links after repeatable proposal validation.

Autonomous work may proceed in the operating session. Package-delegated judgment
uses the separate authority declared by the packet. Attention Required uses the
projected Authority Requirement and attention context. The harness passes an
attended authority ID to `scenario submit` as transport metadata only when that
authority was actually present. Durable authority remains the exact REV or DEC
required by the Scenario.

## Submission and recovery

Submission has three outcomes:

- `accepted` returns a stable settlement identity and a receipt mapping symbolic
  handles to allocated Stable Datum and Revision IDs;
- `rejected` publishes no Lifecycle Data, consumes no lifecycle correction
  allowance, and may be corrected against the same active Assignment when the
  result says it is retryable; and
- `settlement-required` means publication closure is uncertain.

Before submission, a durable harness records the exact response bytes and digest
with the Assignment, packet, repository, Process Package, and MDLM transport
identities. On uncertain closure, call
`mdlm scenario settlement <assignment-or-execution-id> --json`. Reconcile only
against exact immutable execution evidence. Never repeat submission after
accepted publication or uncertain closure.

After acceptance and doctor:

```bash
git status --short
git add -N .lifecycle/data
git diff -- .lifecycle/data
git add .lifecycle/data
git diff --cached --check
git commit -m "Publish Scenario transaction"
```

Stop on an unexpected path or byte. Git history belongs to the operator; MDLM
owns canonical validation and atomic Lifecycle Data publication.

## Outcomes and stops

Interpret the returned outcome rather than a remembered package sequence:

- **Assignment:** perform the included packet and submit its response.
- **Attention Required:** conduct the projected conversation when the named
  authority is present; otherwise report the exact requirement and stop.
- **Profile Boundary Reached:** stop successfully at the declared profile limit.
- **Lifecycle Complete:** stop successfully at the declared lifecycle end.
- **Process Dead End:** report the exact blockers as a Package Liveness Defect and
  stop unsuccessfully.
- **Invalid:** preserve the diagnostics and stop on repository or package
  integrity failure.

Also stop on dirty initial state, stale or exhausted Assignment, typed inability,
failed doctor, unexpected diff, settlement that cannot be authenticated, or a
command failure. A Review, gate, commit, or Phase change is not a stop by itself.

## Integrity boundary

Exact Process Package, repository, Assignment, execution, Stable Datum, and
Revision identities are authoritative. Frozen Revisions and accepted
publications are immutable. Package and schema validation precede atomic
publication. Process structure remains package data, and expressions remain safe
text. The harness transports the contract; it does not add process policy.

## Performance diagnostics

Set `MDLM_PERFORMANCE=json` on one command to emit one `mdlm-performance@1`
object on standard error. It reports repository load and Markdown-file counts,
stage timings, and processed-record counts without entering Lifecycle Data.

```sh
MDLM_PERFORMANCE=json mdlm doctor --json \
  > /tmp/mdlm-doctor.json \
  2> /tmp/mdlm-performance.json
```
