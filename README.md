# Markdown Lifecycle Manager

MDLM helps agents deliver a small software product with durable requirements,
independent review, and verification evidence. Each publication records exact
revisions so another agent can continue the work and understand what was checked.
The product is the `mdlm` CLI over Markdown Lifecycle Data and a declarative
Process Package. Pi, Codex, and other harnesses operate that contract.

The default tiny Process Package reviews one requirement graph as a batch. Its normal route is
requirements, independent requirement review, implementation, executable
verification run by the CLI in Docker, independent implementation review, and
stakeholder acceptance.
Each stakeholder need and software commitment has its own normal identity.
Software requirements decompose their parents through exact links, with as many
levels as the behavior needs. Software leaves are the code contracts. The CLI
generates the requirement-set and source-scope records without extra agent turns.

The CLI validates structure, references, fixed values, and declared mechanical
constraints before atomic publication. Reviewers judge whether requirements express the intended product and whether implementation and evidence
justify acceptance. The CLI captures script output and classifies its exit status.
Reviewers check whether the script proves the intended behavior.

## Operator contract

The `mdlm` executable exposes the supported contract. A normal repository uses
one loop:

1. initialize once with `mdlm init <destination>`;
2. enter the repository and run `mdlm start --json` to read its portable
   `MDLM.md` guide, exact repository identity, and Git cleanliness;
3. require a clean ordinary Git boundary, then run `mdlm next --json` once;
4. when `mdlm-next@2` includes an `mdlm-assignment-packet@3`, let the harness
   perform that exact packet and write only its authored values. For an execution
   Assignment, run `mdlm assignment run --json` and inspect its receipt first;
5. run `mdlm assignment submit-proposal <author-values-file|-> --json`; MDLM
   derives, saves, and strictly submits one complete `mdlm-assignment-response@2`;
6. handle the `mdlm-submission-outcome@1` result;
7. after acceptance, validate with `mdlm doctor --json`, inspect and commit the
   Lifecycle Data diff with ordinary Git; and
8. reevaluate explicitly with `mdlm next --json`.

`mdlm status` remains read-only inspection. `mdlm next` authenticates one exact
repository and Process Package, derives one of the six Operator Outcome
families, and leases work only when it can advance. Assignment and Attention
Required outcomes include the complete packet: prompt, skills, exact inputs,
schemas, Policies, participation, authority requirements, outputs, completion
conditions, authorValuesSchema, and authorValuesScaffold. Full response schema and
scaffold remain available for diagnostics. The included packet replaces
the ordinary prepare step.

Initialization installs one package-neutral `MDLM.md` operator guide. `mdlm start`
is a read-only session briefing. Every `mdlm next` result repeats the
agent-owned next, work, submit, next loop and its immediate safe action in
`operatorInstructions`. Attention Required names the authority the agent must
ask before it continues.

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

# The harness performs the included packet and writes only authored values.
mdlm assignment submit-proposal .lifecycle/work/author-values.json --json
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

## Code traceability and requirement changes

For the tiny package, author requirements in one batch using the packet's local
handles and normal `decomposes` links. The CLI supplies stable requirement IDs in
`requirementGraphs`. Source comments name those IDs, resolved only against the
exact reviewed graph selected for the implementation. Use a file default and
optional closed regions:

```python
# mdlm:file runtime implements REQ-0000000001
# mdlm:begin loading implements REQ-0000000002
def load_store(path):
    ...
# mdlm:end loading
```

Replace the example IDs with the packet's published requirements. Verifier code
uses `verifies` instead. Declare each committed file's role in `file_roles`.
Submission derives the complete inventory, every code line's scope, normal
requirement links and exact added lines inheriting defaults. Documentation stays
in the inventory without line directives. Initially executable source uses
Python comments; unsupported formats are rejected explicitly. Review judges
whether the linked requirements actually explain the code.

```bash
mdlm trace why tasks.py:42 --implementation <exact-IMP-revision> --json
mdlm trace impact <REQ-id-or-revision> --implementation <exact-IMP-revision> --json
mdlm change request --requirements <exact-current-RQS-revision> --json
```

Request a change only after the current product is accepted and complete. This
opens the package's explicit revision assignment, then the normal next/submit
loop resumes. Use `revision_of` to revise or reaffirm exact selected requirements
in one batch and link descendants to the new parent revisions. Old requirements,
source scopes and acceptance evidence remain immutable. Impact output identifies
locations to inspect, including verification and shared scopes; it does not claim
that every reported line must change. The implementation review packet includes
`sourceScopes`, exact `source_changes`, and comparison against the prior source.

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
- Historical v0.8 conformance report: [`docs/mdlm-v0.8-implementation-conformance.md`](docs/mdlm-v0.8-implementation-conformance.md)
- Phase-hardening proof: [`docs/clean-pilot-103.md`](docs/clean-pilot-103.md)
- Zero-to-assessment evidence: [`docs/zero-to-assessment-pilot.md`](docs/zero-to-assessment-pilot.md)
- Historical v0.8 design baseline: [`docs/mdlm-process-overview-v0.8.md`](docs/mdlm-process-overview-v0.8.md)

The kernel stays process-neutral. Broader Process Packages may define additional
requirement levels and assurance work. The tiny route is the default while we
measure correct accepted delivery, recovery from mistakes, publications, elapsed
time, and human interventions. Add process when repeated runs reveal a need.
See [the tiny-process decision](docs/adr/0005-start-tiny-products-with-one-requirement-level.md)
and [development guidance](docs/agents/mdlm-development.md). Historical pilot and
V-model reports above describe their recorded package versions.
