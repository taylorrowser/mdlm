---
description: Run declarative MDLM work continuously to the next explicit Operator Outcome boundary
---
Operate the selected lifecycle through the public `mdlm` interface. One coherent
Scenario is one atomic publication transaction, not one assistant turn. Do not
return merely because a transaction, Review, gate, checkpoint, commit, or phase
change completed.

## Continuous loop

1. Require `git status --porcelain` to be empty. A dirty starting tree is genuine
   ambiguity: stop rather than absorb unrelated work.
2. Run `mdlm status --json`, then `mdlm next --json`. Never choose work from
   memory or a package-specific sequence.
3. Interpret the exact Operator Outcome as described below.
4. For an Assignment, run:
   ```bash
   mdlm scenario prepare '<assignment-id>' --json
   ```
   Treat the prepared packet's exact inputs, prompt, complete skills, Policies,
   participation, prohibited inputs, outputs, required links, response schema,
   and completion conditions as the complete instruction bundle. Use only
   read-only `mdlm` inspection when the packet names evidence that must be
   expanded.
5. Perform the declared work:
   - autonomous work stays in this operating session;
   - package-delegated independent judgment uses a fresh read-only session over
     only the prepared packet and named inspection evidence;
   - attended work uses the projected Authority Requirement and
     `attentionContext.invocations` in one explicit conversation.
6. Build one complete `mdlm-assignment-response@1`. Preserve every declared
   output, local proposal reference, loaded skill reference, and exact authority
   evidence required by the packet. Submit from a file or stdin:
   ```bash
   mdlm scenario submit './assignment-response.json' --json
   # or: produce_response | mdlm scenario submit - --json
   ```
   Never publish partial content or edit Lifecycle Data directly.
7. After successful publication, run `mdlm doctor --json`. Then:
   ```bash
   git status --short
   git add -N .lifecycle/data
   git diff -- .lifecycle/data
   git add .lifecycle/data
   git diff --cached --check
   git commit -m 'Publish Scenario transaction'
   ```
   Stop on any unexpected path or byte.
8. Immediately run `mdlm status --json` and `mdlm next --json` again.

## Participation

Package-delegated judgment is separate from operating-session judgment. Give the
fresh read-only delegate every exact definition and evidence item named by the
prepared packet, then carry its proposed exact REV or DEC into the response.
The operating harness remains responsible for canonical submission.

For Attention Required, preserve each projected invocation and package-owned
input. Normalize only explicit conclusions; do not infer approval from prose and
do not store a raw transcript as Lifecycle Data unless the Scenario declares it.
Exact applicable Standing Delegation may be used only when preparation projects
it. Never turn nondelegable attended authority into autonomous or delegated work.

## Explicit outcomes and stop boundaries

- **Assignment:** continue through prepare, response, submit, doctor, Git commit,
  and reevaluation.
- **Attention Required:** conduct the projected conversation only when the named
  authority is present. Otherwise stop and report the exact Authority Requirement.
- **Profile Boundary Reached:** stop successfully and report omitted profile
  coverage; do not claim Lifecycle Complete.
- **Lifecycle Complete:** stop successfully and report the exact terminal
  condition.
- **Process Dead End:** stop unsuccessfully and report the exact blockers as a
  Package Liveness Defect. Do not invent a Scenario.
- **Invalid:** stop unsuccessfully and report the integrity diagnostics.

Also stop on typed inability, stale or exhausted Assignment, failed doctor,
unexpected Git state, genuine ambiguity, or command failure. Report the exact
projection and the fact that no Lifecycle Data was published when applicable.
