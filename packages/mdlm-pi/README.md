# mdlm-pi

Foreground, crash-resumable MDLM operator powered by the pi SDK.

```sh
mdlm-pi run /path/to/repository
```

Each invocation calls `mdlm next --json` once. It branches on the six
`mdlm-next@2` outcomes. Assignment and Attention Required include the complete
`mdlm-assignment-packet@3`; the harness passes that packet to one worker without
calling status, Assignment inspection, or `scenario prepare`. The other four
outcomes stop immediately.

The worker returns one `mdlm-assignment-response@2` using the packet's symbolic
output handles. MDLM allocates durable IDs and required links. On attended work,
the harness reads the named authority's conclusion and passes the authority ID
to `scenario submit` as transport metadata. It never adds authority fields to
the response.

Submission returns `accepted`, `rejected`, or `settlement-required`. A rejected
proposal has no lifecycle side effect, so the same worker session may correct it
without consuming a correction allowance. Before submission starts, the harness
writes and syncs a journal beneath the worktree's private Git directory. The
journal binds the Assignment, response digest, packet package and repository,
and MDLM transport. If closure is uncertain, a later invocation calls
`mdlm scenario settlement <assignment-or-execution> --json`; it never repeats
submit. Accepted publication and repository mutation belong to MDLM's atomic
submission transaction, not the harness.

Ownership remains locked at the common Git directory so linked worktrees cannot
run concurrently. A changed transport or a settlement result with the wrong
Assignment, response digest, or execution identity leaves the journal intact and
stops recovery.

## Attended input

At a terminal, enter any number of lines and finish with `.mdlm-submit` on its
own line. MDLM-Pi removes the newline before that delimiter and preserves all
other UTF-8 content and line endings.

Non-terminal input defaults to the current runner's legacy transport: one answer,
one framing LF, and EOF. MDLM-Pi removes only the final LF, so a legitimate CR
immediately before it remains part of the answer. Answer bytes never select the
transport mode; wording that begins with `MDLM-ATTENDED/1` remains legacy wording.

A future writer can explicitly select length-framed input by setting
`MDLM_PI_ATTENDED_INPUT_MODE=framed-v1` before starting MDLM-Pi, then send adjacent
frames:

```text
MDLM-ATTENDED/1 <payload-byte-count>\n<payload bytes>
```

The byte count covers the payload only. MDLM-Pi reads exactly that many bytes,
decodes them as strict UTF-8, and retains later bytes for the next attended
answer. Explicit `legacy-eof` and `terminal-delimiter` values are also accepted.
The writer and MDLM-Pi process must agree on the mode out of band.

An answer may contain at most 65,536 UTF-8 bytes. Empty answers, invalid UTF-8,
oversized input, malformed or incomplete frames, cancellation, terminal EOF
before `.mdlm-submit`, and input stream failures stop the command as operational
failures. MDLM-Pi never returns a partial attended conclusion.

## Model and credentials

By default pi selects the first available authenticated model using its normal
`~/.pi/agent/auth.json` and `models.json` runtime. Selection can be constrained:

```sh
mdlm-pi run . --provider anthropic --model claude-sonnet-4-5 --thinking high
```

The harness does not copy credentials into the target repository or run journal.
It loads no ambient prompts, skills, extensions, AGENTS files, or coding tools;
the worker sees only the included Assignment Packet, optional attended
conclusion, and the packet-schema `complete_assignment` tool. The response stays
free of authority transport metadata for attended and package-delegated work.

For development or a nonstandard installation, select the public MDLM executable:

```sh
mdlm-pi run . --mdlm /path/to/mdlm
```

## Bounds

- `MDLM_PI_COMMAND_TIMEOUT_MS` — MDLM subprocess timeout (default 30000)
- `MDLM_PI_ASSIGNMENT_TIMEOUT_MS` — one pi Assignment timeout (default 900000)
- `MDLM_PI_PROVIDER_RETRIES` — provider retry count (default 2)

`SIGHUP`, `SIGINT`, and `SIGTERM` abort the active MDLM process group and pi
session before releasing ownership. Exit status is `0` for an accepted response,
Lifecycle Complete, or Profile Boundary Reached, `2` for a Process Dead End,
`3` for Invalid, `4` for a rejected or settlement-required stop, `5` for
a lock conflict, and `1` for operational failure. Signal exits use `129`, `130`,
or `143` respectively.

The default package suite uses fake sessions and subprocesses. Set `MDLM_PI_LIVE=1`
after both builds to enable the credentialed scratch-repository smoke test;
`MDLM_PI_LIVE_PROVIDER` and `MDLM_PI_LIVE_MODEL` may constrain model selection.
