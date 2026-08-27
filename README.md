# Markdown Lifecycle Manager

MDLM's product boundary is the `mdlm` CLI operating on Markdown Lifecycle Data
and a declarative YAML Process Package. Any agent or harness can drive that
contract. Pi, Codex, and other runners are adapters and sources of operational
evidence, not part of the product boundary.

The kernel remains process-neutral. The bundled Example Process Package provides
a bounded software V-model profile without making its types, phases, or Policies
core semantics.

## Current expansion goal

The current goal is to establish reliable public operation through Phase 2, then
expand the Example Process Package through Phases 3–6 using that operational
evidence and the accepted v0.8 design baseline. See
[`docs/phase-2-reliability-and-expansion-roadmap.md`](docs/phase-2-reliability-and-expansion-roadmap.md).

## Operator contract

The `mdlm` executable exposes the supported contract. A normal repository uses
one loop:

1. initialize once with `mdlm init <destination>`;
2. require a clean ordinary Git boundary;
3. orient with `mdlm status --json` and allocate work with `mdlm next --json`;
4. prepare the returned exact Assignment with
   `mdlm scenario prepare <assignment-id> --json`;
5. let the harness perform the declared agent work or attended conversation;
6. return one complete `mdlm-assignment-response@1` with
   `mdlm scenario submit [response-file|-] --json`;
7. validate the repository with `mdlm doctor --json`;
8. inspect the Lifecycle Data diff and commit it with ordinary Git; and
9. reevaluate explicitly with `mdlm status` and `mdlm next`.

`mdlm status` classifies current repository truth without allocating an
Assignment. `mdlm next` returns one versioned Operator Outcome and leases an exact
Assignment only when work can advance. Preparation is side-effect-free and binds
the Assignment to the exact selected Process Package, repository state, prompt,
skills, inputs, participation, output contracts, and completion conditions.

The harness, not MDLM, performs agent work. It returns either a complete Scenario
Proposal or a typed inability. Submission validates all outputs and links before
publishing one atomic Scenario transaction. A rejected response or typed inability
publishes no Lifecycle Data. One malformed response may be corrected against the
same Assignment; exhaustion requires an explicit stop and report.

## Clean transaction example

```bash
mdlm init ./example-repository
cd ./example-repository

mdlm status --json
mdlm next --json
mdlm scenario prepare <assignment-id> --json > assignment.json

# The harness reads assignment.json and writes a complete Assignment Response.
mdlm scenario submit ./assignment-response.json --json
mdlm doctor --json

git status --short
git add -N .lifecycle/data
git diff -- .lifecycle/data
git add .lifecycle/data
git diff --cached --check
git commit -m "Publish Scenario transaction"

mdlm status --json
mdlm next --json
```

Start each transaction from a clean tree. Stop rather than absorb unrelated
changes. MDLM owns Lifecycle Data publication; the operator owns review of the
resulting diff and the ordinary Git commit.

## Read-only inspection

The contracted interface retains package-neutral inspection of repository and
Process Package truth:

```bash
mdlm show <identity> --json
mdlm list --json
mdlm history <stable-id> --json
mdlm backlinks <identity> --json
mdlm trace <identity> --json
mdlm schema <type> --json
mdlm phase status [phase] --json
mdlm loose-ends --json
mdlm scenario execution show <execution-id> --json
mdlm assignment show <assignment-id> --json
mdlm baseline verify <baseline-revision> --json
mdlm baseline diff <old-baseline> <new-baseline> --json
mdlm process show --json
mdlm process validate --ref .lifecycle/process --json
mdlm process test --ref .lifecycle/process --json
mdlm process capabilities --json
```

Relation, Selector, Policy, Computed State, Obligation, definition, and expression
evaluation remain inspection surfaces.

## Authority in demonstrations and attended work

An explicitly recorded demonstration may delegate stakeholder authority to its
operating agent so the lane can exercise consequential decisions without a
person waiting. Record that delegation in the demo evidence and limit it to that
lane.

In real attended work, the actual stakeholder supplies every required
stakeholder decision. Stop on `Attention Required` when that authority is not
available. A runner must not turn its own judgment into stakeholder authority.

## Explicit stop behavior

Handle every Operator Outcome explicitly:

- **Assignment** — prepare it, obtain a harness response, submit, validate, commit,
  and reevaluate.
- **Attention Required** — use only the projected Authority Requirement and
  `attentionContext` to conduct the attended conversation. Stop and report the
  exact requirement if its authority is unavailable; never infer authority.
- **Profile Boundary Reached** — successful stop for the selected implementation
  profile. It does not claim Lifecycle Complete.
- **Lifecycle Complete** — successful lifecycle stop derived from the Process
  Package's exact terminal condition.
- **Process Dead End** — unsuccessful stop. Report the exact blockers as a Package
  Liveness Defect; do not invent a Scenario.
- **Invalid** — unsuccessful stop on repository or package integrity failure.

Also stop on a dirty starting tree, failed doctor check, stale or exhausted
Assignment, unexpected diff, or command failure. A Review, gate, commit, or phase
change is not itself a stop: reevaluation determines the next Operator Outcome.

## References

- Canonical domain language: [`CONTEXT.md`](CONTEXT.md)
- Pi SDK adapter: [`packages/mdlm-pi/README.md`](packages/mdlm-pi/README.md)
- Pi prompt adapter: [`docs/mdlm-pi-operator.md`](docs/mdlm-pi-operator.md)
- Current conformance report: [`docs/mdlm-v0.8-implementation-conformance.md`](docs/mdlm-v0.8-implementation-conformance.md)
- Phase-hardening proof: [`docs/clean-pilot-103.md`](docs/clean-pilot-103.md)
- Zero-to-assessment evidence: [`docs/zero-to-assessment-pilot.md`](docs/zero-to-assessment-pilot.md)
- Historical v0.8 design baseline: [`docs/mdlm-process-overview-v0.8.md`](docs/mdlm-process-overview-v0.8.md)

The concept-validating profile is not a production-readiness or complete-V-model
claim. Phase 3–6 breadth, production indexing, source isolation, brownfield
support, formal compliance, and broader concurrency remain deferred. The reviewed
Pilot Assessment recommendation is `change`: future breadth must reduce ceremony
and demonstrate actual scope reduction.
