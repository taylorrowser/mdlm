# mdlm-pi

Foreground, crash-resumable MDLM operator powered by the pi SDK.

```sh
mdlm-pi run /path/to/repository
```

The command continuously processes one exact MDLM Assignment at a time. It asks
for terminal input only when MDLM returns `attention-required`; otherwise it
continues until MDLM reports a terminal outcome or a typed stop.

The repository must start clean. Each successful Scenario transaction is checked
with `mdlm doctor`, staged only from its exact canonical transaction directory,
and committed as:

```text
mdlm: publish <scenario-reference> (<execution-id>)
```

Run state is stored beneath the repository's private Git directory. Restarting the
same command recovers a journaled `mdlm next` kernel materialization, submission,
publication, doctor result, or Git commit. Every deterministic execution reported
by `mdlm-next@1.materializedExecutions` is doctor-checked and committed at its own
transaction boundary. The final Assignment response bytes are durable; raw
attended conversation is not.

## Model and credentials

By default pi selects the first available authenticated model using its normal
`~/.pi/agent/auth.json` and `models.json` runtime. Selection can be constrained:

```sh
mdlm-pi run . --provider anthropic --model claude-sonnet-4-5 --thinking high
```

The harness does not copy credentials into the target repository or run journal.
It loads no ambient prompts, skills, extensions, AGENTS files, or coding tools;
the worker sees only the prepared Assignment Packet, optional attended answer,
and the packet-schema `complete_assignment` tool.

For development or a nonstandard installation, select the public MDLM executable:

```sh
mdlm-pi run . --mdlm /path/to/mdlm
```

## Bounds

- `MDLM_PI_COMMAND_TIMEOUT_MS` — MDLM subprocess timeout (default 30000)
- `MDLM_PI_ASSIGNMENT_TIMEOUT_MS` — one pi Assignment timeout (default 900000)
- `MDLM_PI_PROVIDER_RETRIES` — provider retry count (default 2)

Exit status is `0` for Lifecycle Complete or Profile Boundary Reached, `2` for a
Process Dead End, `3` for Invalid, `4` for an Assignment disposition stop, `5` for
a lock conflict, and `1` for operational failure.
