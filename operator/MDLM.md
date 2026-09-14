# Run MDLM

Start at a clean Git boundary:

```bash
mdlm start --json
mdlm next --json > .lifecycle/work/outcome.json
```

Follow `operatorInstructions` in every `mdlm next` result. Own the loop: complete
the exact returned Assignment, write only the authored proposal values, submit
them, and run `mdlm next --json` again. A Review, commit, or Phase change does
not end the loop.

On `direct-work-available`, choose a subject using `mdlm expectations --json`
and read `mdlm expectations show <exact-subject> --json`. Follow the package prompt.
Use `mdlm execution run <exact-subject> <operation-id> --json` if evidence is
missing. Inspect the captured receipt and submit the completed candidate using
`mdlm proposal submit <proposal-file> --json`. These commands allocate no
Assignment. Recover a discarded response with `mdlm execution settlement
<operation-id> --json` or `mdlm proposal settlement <operation-id> --json`.
A completed operation is reused; an uncertain started execution must not be
rerun. Commit accepted Lifecycle Data and reevaluate normally.

On Attention Required, ask the authority named in `authorityRequirement` using
only the returned attention context. Resume the exact Assignment after the
answer. Never invent or self-supply authority.

When the packet advertises execution, run `mdlm assignment run --json` before
submitting. Inspect the returned receipt and captured output, then write the
brief assessment requested by the packet. The CLI supplies execution outcome and
receipt fields. Repeated ordinary execution reuses a completed receipt; use `mdlm assignment run --retry --json` only after repairing a failed environment attempt.

Submit authored values from ignored work storage:

```bash
mdlm assignment submit-proposal .lifecycle/work/author-values.json --json
```

Copy the packet's `authorValuesScaffold` into this file and fill it using
`authorValuesSchema`. It contains `outputs` and `completionEvidence`. Each output
names its emitted `slot` and supplies only its authored `payload` and `body`.
The full `responseSchema` and `responseScaffold` are for response diagnostics.
Do not copy Assignment identity, type, route, fixed payload values, or
kernel-materialized outputs into this file. Repeated output slots also require a
unique response-local `handle`.

MDLM derives and saves the exact full response at
`.lifecycle/work/assignment-response.json` before strict submission. Use
`mdlm assignment response --json` and
`mdlm scenario submit <response-file> --json` only for typed inability or
response diagnostics.

- on `accepted`, run `mdlm doctor --json`, inspect and commit only the Lifecycle
  Data transaction, then run `mdlm next --json`;
- on retryable `rejected`, use the diagnostics to correct the same author-values
  file and invoke the command once more against the same active Assignment; and
- on `settlement-required`, call
  `mdlm scenario settlement <assignment-or-execution-id> --json` and never replay
  submission after uncertain closure.

Stop successfully only on Profile Boundary Reached or Lifecycle Complete. Stop
unsuccessfully on Process Dead End or Invalid and preserve the exact blockers or
diagnostics. Also stop on typed inability, stale or exhausted Assignment, failed
doctor, unexpected Git state, unauthenticated settlement, or command failure.

Verification receipts retain raw stdout and stderr as base64. The command also renders derived UTF-8 text for inspection. Completed execution errors remain evidence and can be submitted with a diagnosis for implementation correction. If execution never started, repair the environment and explicitly use `assignment run --retry --json` to create another preserved attempt. An ordinary repeated run returns the existing receipt.
