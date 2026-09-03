# Run MDLM

Start at a clean Git boundary:

```bash
mdlm start --json
mdlm next --json > .lifecycle/work/outcome.json
```

Follow `operatorInstructions` in every `mdlm next` result. Own the loop: complete
the exact returned Assignment, emit its response file, fill only the proposal
values, submit it, and run `mdlm next --json` again. A Review, commit, or Phase
change does not end the loop.

On Attention Required, ask the authority named in `authorityRequirement` using
only the returned attention context. Resume the exact Assignment after the
answer. Never invent or self-supply authority.

Submit responses from ignored work storage:

```bash
mdlm assignment response --json > .lifecycle/work/assignment-response.json
# Edit only proposal values. Keep the emitted contract and Assignment ID.
mdlm scenario submit .lifecycle/work/assignment-response.json --json
```

- on `accepted`, run `mdlm doctor --json`, inspect and commit only the Lifecycle
  Data transaction, then run `mdlm next --json`;
- on retryable `rejected`, correct the response against the same active
  Assignment; and
- on `settlement-required`, call
  `mdlm scenario settlement <assignment-or-execution-id> --json` and never replay
  submission after uncertain closure.

Stop successfully only on Profile Boundary Reached or Lifecycle Complete. Stop
unsuccessfully on Process Dead End or Invalid and preserve the exact blockers or
diagnostics. Also stop on typed inability, stale or exhausted Assignment, failed
doctor, unexpected Git state, unauthenticated settlement, or command failure.
