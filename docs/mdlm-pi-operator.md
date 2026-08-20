# Generic pi operator loop

The reusable example under [`examples/pi-operator`](../examples/pi-operator)
turns pi into a package-neutral MDLM harness. Copy its `AGENTS.md` and `.pi`
directory into a repository created by `mdlm init`, trust the project, and run
`/mdlm` with the `mdlm` executable available to the harness.

The template contains no package-specific phase, lifecycle-type, Scenario, metric,
or recommendation sequence. The selected Process Package remains the source of
work, participation, authority, output, and completion semantics.

## Continuous operation

For each transaction, the harness:

1. requires `git status --porcelain` to be empty;
2. runs `mdlm status --json` for orientation and `mdlm next --json` for one exact
   Operator Outcome;
3. prepares an Assignment with
   `mdlm scenario prepare <assignment-id> --json`;
4. follows only the prepared packet's prompt, skills, exact inputs, resolved
   Policy evaluations and assets, participation, prohibited inputs, output
   contracts, required links, and completion conditions;
5. performs autonomous work, obtains fresh package-delegated judgment, or conducts
   the projected attended conversation as declared by that packet;
6. submits one complete Assignment Response with
   `mdlm scenario submit [response-file|-] --json`;
7. runs `mdlm doctor --json`, inspects only the transaction diff, and commits it
   with ordinary Git; and
8. explicitly reevaluates with `mdlm status --json` and `mdlm next --json`.

One coherent Scenario is one atomic publication boundary, not one assistant-turn
boundary. A successful Review, gate, commit, or phase progression is not itself a
reason to pause.

## Harness-owned work and authority

Preparation is side-effect-free. It is the complete harness-neutral instruction
packet for the exact leased Assignment. `mdlm-assignment-packet@2` includes each
package-authored review Policy evaluation with its exact invocation arguments and
result. When that result references a versioned asset declared by the selected
package, the packet includes the asset's exact reference, path, digest, and
content in both the evaluation and the packet asset list. Its allowed projections
also include resolved envelope, payload, and outgoing-link schemas for every exact
input and expected output Lifecycle type, so packet-only work can interpret the
supplied data without raw Process Package inspection. For a current planning-DWP
Review, the packet supplies the exact allocated ASP, governing ICSP Revisions, and
applicable current SYS support frozen with the DWP; historical authenticated thin
contexts remain usable without concealing those current exact packet inputs. If that
exact support becomes stale, the package suppresses the impossible Review-context
route and prepares an explicit same-lineage DWP replacement with the prior plan and
current exact support; the operator must not invent an unrelated DWP identity. This
evidence tells a delegate which criteria apply without choosing the delegate's
judgment.

- Autonomous work may proceed in the operating session.
- Package-delegated judgment uses a fresh read-only session. The delegate receives
  only prepared and read-only inspection evidence and returns proposed exact
  authority evidence; the operating harness remains responsible for submission.
- Attention Required uses the exact projected Authority Requirement and
  `attentionContext.invocations`. The harness conducts the conversation, preserves
  each package-owned input, and normalizes explicit conclusions into the prepared
  response shape. It does not infer approval from prose.
- Exact reviewed Standing Delegation may be used only when the prepared packet
  projects it as applicable. It is not a substitute for nondelegable attended
  authority.

Raw conversation need not become Lifecycle Data. Durable authority is the exact
REV or DEC output required by the Scenario, not chat text or a completion summary.

Read-only `mdlm show`, `schema`, `phase status`, `loose-ends`, trace, history,
baseline, and Process Package inspection may expand evidence named by the packet.
Do not inspect or edit authoritative Lifecycle Data or raw package definitions to
invent missing inputs.

## Git boundary

The clean starting tree separates the pending transaction from unrelated work.
After successful submission and doctor:

```bash
git status --short
git add -N .lifecycle/data
git diff -- .lifecycle/data
git add .lifecycle/data
git diff --cached --check
git commit -m "Publish Scenario transaction"
```

Stop on an unexpected path or byte. Ordinary Git history belongs to the operator;
MDLM does not commit normal Scenario transactions.

## Stop conditions

Interpret the returned Operator Outcome, never a remembered package sequence:

- **Assignment:** continue through prepare, response, submit, doctor, and Git.
- **Attention Required:** conduct the projected conversation if the named authority
  is present; otherwise stop and report the exact Authority Requirement.
- **Profile Boundary Reached:** stop successfully at the package-declared profile
  boundary without claiming Lifecycle Complete.
- **Lifecycle Complete:** stop successfully at the package-declared lifecycle end.
- **Process Dead End:** stop unsuccessfully and report the exact blockers as a
  Package Liveness Defect.
- **Invalid:** stop unsuccessfully on integrity failure.

A `correction-required` disposition with `correctionsRemaining: 1` keeps the same
Assignment active for exactly one corrected submission. Correct the complete
response and submit it once; a malformed correction exhausts the lease and reports
`correctionsRemaining: 0`.

Also stop on dirty initial state, stale or exhausted Assignment, typed inability,
failed doctor, unexpected diff, genuine ambiguity, or command failure. Never
invent Lifecycle Data or an undeclared Scenario to escape a stop.

## Proportional package behavior

Fresh repositories select `mdlm-bootstrap@0.71.0`; do not migrate or resume
0.70.0 or earlier Lifecycle Data or Assignments. Treat `system_context` as a
solution-independent responsibility/trust grouping key, not a component name.
One Assignment may therefore bind several STKs to one shared ASP by default, or
to the smallest justified architecture partition. Each architecture may similarly
produce one cohesive many-parent DWP by default or a small justified slice set.
Do not split either kind of work merely because several requirements are present.

Author prompts require an ephemeral rubric preflight. Perform it privately,
correct blocking defects before submission, and publish no preflight REV,
transcript, score, or telemetry. Never send preflight observations to the later
independent reviewer. The package selects generic `exact-baseline@1`
materialization for `create-review-context@1`; the runtime fulfills a real internal
Assignment from every-and-only the package-selected exact bindings before
returning reviewer work, without a second repository inspection. Context
membership, evidence partitioning, hashing, response provenance, and freeze are
package/kernel-owned rather than operator judgment.

## Performance diagnostics

Set `MDLM_PERFORMANCE=json` on a single command to emit one
`mdlm-performance@1` JSON object on standard error. It reports repository load and
Markdown-file counts, per-stage elapsed measurements, and processed-record work
counts for discovery, parsing, provenance, whole-graph validation, exact-baseline
verification, lifecycle evaluation, index rebuild, and report rebuild. The
diagnostics are ephemeral operator
telemetry: they do not enter Lifecycle Data or generated repository truth.

```sh
MDLM_PERFORMANCE=json mdlm doctor --json \
  > /tmp/mdlm-doctor.json \
  2> /tmp/mdlm-performance.json
```
