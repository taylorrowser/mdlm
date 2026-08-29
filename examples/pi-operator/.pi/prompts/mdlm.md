---
description: Run declarative MDLM work continuously to the next explicit Operator Outcome boundary
---
Operate the selected lifecycle through the public `mdlm` interface. One coherent
Scenario is one atomic publication transaction, not one assistant turn. Continue
after a transaction, Review, gate, checkpoint, commit, or Phase change.

## Continuous loop

1. Require `git status --porcelain` to be empty. Stop on a dirty starting tree.
2. Call `mdlm next --json` once and interpret its exact `mdlm-next@2` outcome.
3. For Assignment or Attention Required, use only the included
   `mdlm-assignment-packet@3`. It contains the exact prompt, skills, inputs,
   schemas, Policies, participation, authority, prohibitions, symbolic outputs,
   completion conditions, response schema, and response scaffold.
4. Perform the declared work. Autonomous work stays in this session.
   Package-delegated judgment uses a fresh read-only session over only the packet.
   Attended work uses the projected Authority Requirement and attention context.
5. Fill one `mdlm-assignment-response@2` from the scaffold. Submit it from an
   ignored work file or standard input:
   ```bash
   mdlm scenario submit .lifecycle/work/assignment-response.json --json
   # or: produce_response | mdlm scenario submit - --json
   ```
6. Handle the `mdlm-submission-outcome@1`. Correct a retryable rejection against
   the same active Assignment. On `settlement-required`, call
   `mdlm scenario settlement <assignment-or-execution-id> --json`; never replay
   submission after accepted publication or uncertain closure.
7. After acceptance, run `mdlm doctor --json`. Then:
   ```bash
   git status --short
   git add -N .lifecycle/data
   git diff -- .lifecycle/data
   git add .lifecycle/data
   git diff --cached --check
   git commit -m 'Publish Scenario transaction'
   ```
   Stop on any unexpected path or byte.
8. Start the next transaction with one fresh `mdlm next --json` call.

## Participation

Package-delegated judgment is separate from operating-session judgment. Give the
fresh read-only delegate only the complete packet. The operating harness remains
responsible for submission.

For Attention Required, preserve each projected invocation and package-owned
input. Pass the exact attended authority ID as submit transport metadata only
when that authority was present. Normalize only explicit conclusions. Raw chat
does not become Lifecycle Data unless the Scenario declares it, and proposal
prose cannot supply authority.

## Explicit outcomes and stop boundaries

- **Assignment:** perform the included packet, submit, run doctor, commit, and
  reevaluate.
- **Attention Required:** conduct the projected conversation when the named
  authority is present. Otherwise report the exact requirement and stop.
- **Profile Boundary Reached:** stop successfully and report omitted coverage.
- **Lifecycle Complete:** stop successfully and report the exact terminal
  condition.
- **Process Dead End:** report the exact blockers as a Package Liveness Defect
  and stop unsuccessfully.
- **Invalid:** report the integrity diagnostics and stop unsuccessfully.

Also stop on typed inability, stale or exhausted Assignment, failed doctor,
unexpected Git state, genuine ambiguity, unauthenticated settlement, or command
failure. Report the exact projection and whether Lifecycle Data was published.
