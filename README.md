# Markdown Lifecycle Manager

MDLM's product boundary is the `mdlm` CLI operating on Markdown Lifecycle Data
and a declarative YAML Process Package. Any agent or harness can drive that
contract. Pi, Codex, and other runners are adapters and sources of operational
evidence, not part of the product boundary.

The kernel remains process-neutral. The bundled Example Process Package provides
a bounded software V-model profile without making its types, phases, or Policies
core semantics.

## Current restoration gate

The outcome-contract cutover deliberately stopped the demo fleet. Restore it
through one fresh disposable canary built from exact source, runner, artifact,
and Process Package identities. The canary must complete Phase 0, including one
rejected then corrected Review proposal, and enter the first Phase 1 RUN/RES
loop without a contract, authority-envelope, missing-input, generated-ID, or
ambiguous-publication failure. Restore the one-Codex/two-Pi fleet only after that
journey passes.

## Operator contract

The `mdlm` executable exposes the supported contract. A normal repository uses
one loop:

1. initialize once with `mdlm init <destination>`;
2. enter the repository and run `mdlm start --json` to read its portable
   `MDLM.md` guide, exact repository identity, and Git cleanliness;
3. require a clean ordinary Git boundary, then run `mdlm next --json` once;
4. when `mdlm-next@2` includes an `mdlm-assignment-packet@3`, let the harness
   perform that exact packet and fill its response scaffold;
5. return one complete `mdlm-assignment-response@2` with
   `mdlm scenario submit [response-file|-] --json`;
6. handle the `mdlm-submission-outcome@1` result;
7. after acceptance, validate with `mdlm doctor --json`, inspect and commit the
   Lifecycle Data diff with ordinary Git; and
8. reevaluate explicitly with `mdlm next --json`.

`mdlm status` remains read-only inspection. `mdlm next` authenticates one exact
repository and Process Package, derives one of the six Operator Outcome
families, and leases work only when it can advance. Assignment and Attention
Required outcomes include the complete packet: prompt, skills, exact inputs,
schemas, Policies, participation, authority requirements, outputs, completion
conditions, response schema, and response scaffold. The included packet replaces
the ordinary prepare step.

Initialization installs `MDLM.md`, short `AGENTS.md` and `CLAUDE.md` discovery
pointers, and equivalent local MDLM skills for Codex and Claude. `mdlm start` is
a read-only session briefing. Every `mdlm next` result repeats the immediate safe
action in `operatorInstructions` so an agent can keep operating without a
resident controller.

The harness, not MDLM, performs agent work. It returns either a complete Scenario
Proposal or a typed inability. Proposal outputs use packet-local symbolic handles;
MDLM allocates durable IDs and required links after validation. Submission returns
`accepted`, `rejected`, or `settlement-required`. Rejected proposal bytes publish
nothing and may be corrected without consuming a lifecycle correction allowance.
Accepted publication is atomic. When closure is uncertain, inspect settlement by
the stable Assignment or execution identity and never replay submission.

## Clean transaction example

```bash
mdlm init ./example-repository
cd ./example-repository

mdlm start --json
mdlm next --json > .lifecycle/work/outcome.json

# The harness performs the included packet and writes its complete response.
mdlm scenario submit .lifecycle/work/assignment-response.json --json
mdlm doctor --json

git status --short
git add -N .lifecycle/data
git diff -- .lifecycle/data
git add .lifecycle/data
git diff --cached --check
git commit -m "Publish Scenario transaction"

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

- **Assignment** — perform its included packet, submit the complete response,
  validate, commit, and reevaluate.
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

Run `mdlm --help` to discover the agent-guided `init`, `start`, `next`, Scenario
submit and settlement, and doctor commands.

## Integrity boundary

Exact Process Package, repository, Assignment, execution, Stable Datum, and
Revision identities remain authoritative. Frozen Revisions and accepted
publications are immutable. Package and schema validation precede atomic
publication. Authority comes from the exact Scenario contract and Assignment
boundary, not proposal prose. Process structure stays in the Process Package,
and expression logic remains safe textual data. Accepted work and work with
uncertain closure are never replayed.

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
