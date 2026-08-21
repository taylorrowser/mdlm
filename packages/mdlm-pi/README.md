# mdlm-pi

Foreground, crash-resumable MDLM operator powered by the pi SDK.

```sh
mdlm-pi run /path/to/repository
```

The command continuously processes one exact MDLM Assignment at a time. It asks
for terminal input only when MDLM returns `attention-required`; otherwise it
continues until MDLM reports a terminal outcome or a typed stop.

The repository must start clean. Each successful Scenario transaction is checked
with `mdlm doctor`, compared with the execution's exact declared output paths,
staged only from those paths, checked again, and committed as:

```text
mdlm: publish <scenario-reference> (<execution-id>)
```

Run state is stored beneath the worktree's private Git directory, while ownership
is locked at the common Git directory so linked worktrees cannot run concurrently.
Restarting the same command recovers a captured response, journaled `mdlm next`
kernel materialization, submission, publication, doctor result, or Git commit.
Every deterministic execution reported by `mdlm-next@1.materializedExecutions` is
doctor-checked and committed at its own transaction boundary. MDLM does not rebase
an Assignment returned before that commit. The controller finishes the journaled
transactions, reevaluates the repository, and allocates fresh work against the new
commit when needed. Recovery is limited to the same selected Process Package and
repository state. A package or repository fingerprint mismatch stops the run;
`mdlm-pi` does not migrate package versions or recover an Assignment across
versions. Before worker execution, an attended Assignment's normalized conclusion,
authority, package identity, and repository identity are durable. The final Assignment
response bytes are also durable. For an active Consolidation Group, only the final
normalized conclusions are retained and reused across serial reevaluation; raw attended
conversation is not.

## Model and credentials

By default pi selects the first available authenticated model using its normal
`~/.pi/agent/auth.json` and `models.json` runtime. Selection can be constrained:

```sh
mdlm-pi run . --provider anthropic --model claude-sonnet-4-5 --thinking high
```

The harness does not copy credentials into the target repository or run journal.
It loads no ambient prompts, skills, extensions, AGENTS files, or coding tools;
the worker sees only the prepared Assignment Packet, optional attended answer,
and the packet-schema `complete_assignment` tool. For an attended Assignment,
`mdlm-pi` carries the packet's exact attended authority into the proposal when the
worker omits it, including after one malformed-response correction. A conflicting
worker authority stops the run before submission. Autonomous proposal generation
remains unchanged. During malformed-response correction for delegated participation
with no attention, `mdlm-pi` restores the original proposal and supplies only the exact
roles required by the Assignment.

For development or a nonstandard installation, select the public MDLM executable:

```sh
mdlm-pi run . --mdlm /path/to/mdlm
```

## Bounds

- `MDLM_PI_COMMAND_TIMEOUT_MS` — MDLM subprocess timeout (default 30000)
- `MDLM_PI_ASSIGNMENT_TIMEOUT_MS` — one pi Assignment timeout (default 900000)
- `MDLM_PI_PROVIDER_RETRIES` — provider retry count (default 2)

`SIGHUP`, `SIGINT`, and `SIGTERM` abort the active MDLM process group and pi
session before releasing ownership. Exit status is `0` for Lifecycle Complete or
Profile Boundary Reached, `2` for a
Process Dead End, `3` for Invalid, `4` for an Assignment disposition stop, `5` for
a lock conflict, and `1` for operational failure. Signal exits use `129`, `130`,
or `143` respectively.

The default package suite uses fake sessions and subprocesses. Set `MDLM_PI_LIVE=1`
after both builds to enable the credentialed scratch-repository smoke test;
`MDLM_PI_LIVE_PROVIDER` and `MDLM_PI_LIVE_MODEL` may constrain model selection.
