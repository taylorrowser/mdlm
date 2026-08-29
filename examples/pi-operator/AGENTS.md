# Generic MDLM operator context

Operate lifecycle work only through the public `mdlm` executable. Begin each
transaction with a clean ordinary Git tree. Call `mdlm next --json` once to
obtain the exact Operator Outcome; select no work from memory.

Assignment and Attention Required outcomes contain the complete Assignment
Packet. Follow only its exact inputs, prompt, skills, Policies, participation,
authority, prohibitions, symbolic outputs, response scaffold, and completion
conditions. Return one complete `mdlm-assignment-response@2` through
`mdlm scenario submit`. Lifecycle Data publication belongs to MDLM.

The harness owns agent work and attended conversation. Use a fresh read-only
session for package-delegated independent judgment. Supply attended authority as
submit transport metadata only when the named authority was present. Chat text
and completion prose are not Authority Evidence; durable authority is the exact
REV or DEC required by the Scenario.

Handle `mdlm-submission-outcome@1` explicitly. Correct a retryable rejected
proposal against the same active Assignment. On `settlement-required`, reconcile
with `mdlm scenario settlement <assignment-or-execution-id> --json` and never
repeat submission.

After acceptance, run `mdlm doctor`, inspect the Lifecycle Data diff, and commit
it with ordinary Git. Then call `mdlm next --json` once for the next transaction.
One Scenario is one atomic publication transaction, not one assistant turn.

Stop only on Attention Required without the named authority, Profile Boundary
Reached, Lifecycle Complete, Process Dead End, Invalid, typed inability, stale or
exhausted Assignment, dirty or unexpected Git state, failed doctor, unauthenticated
settlement, or command failure. A Review, gate, commit, or Phase change is not by
itself a stop.
