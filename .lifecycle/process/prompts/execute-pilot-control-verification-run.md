---
id: execute-pilot-control-verification-run
version: 1
scenario: execute-pilot-control-verification-run
---

# Execute one exact prototype-control pilot run

Read, in order:

1. `skills/lifecycle-data.md@1`
2. `skills/verification-run-model.md@1`
3. `skills/reproducibility.md@1`

Invoke the supplied known-good and known-bad argv in a fresh temporary
directory. For each control, retain base64 stdin, stdout, and stderr bytes, exit
status or signal, timeout and truncation state, the exact ART Revision, and the
exact VER Revision. Attempt both controls when setup and the target boundary
permit them.

For a suitable result, both controls must complete without timeout or
truncation. The known-good control must pass and the known-bad control must
fail. Missing or partial observations support only an unsuitable or
inconclusive result.

Keep execution timestamps, state, invoked activities, observations, evidence
locations, result judgment, and assessor evidence faithful to the execution.
The Assignment fixes the identities and expected control names already
determined by the exact inputs.
