# Issue #103 clean-pilot proof

Issue #103 uses a compositional proof at the compiled `mdlm` interface. The
[recorded contract clarification](https://github.com/taylorrowser/mdlm/issues/103#issuecomment-5274820461)
retains every public operator and package invariant while deliberately avoiding a
second imperative mega-fixture that duplicates the declarative Process Package.
Issue #104 subsequently contracted all live proof and guidance to the same single
product interface.

## Fresh-repository transaction

`test/mdlm-clean-pilot-contract.test.ts` starts with `mdlm init` in an absent
destination and performs this public sequence:

```text
mdlm next
mdlm scenario prepare <assignment>
mdlm scenario submit
mdlm doctor --json
git diff -- .lifecycle/data
git add .lifecycle/data
git commit
mdlm next
mdlm scenario prepare <subsequent-assignment>
```

The test proves that initialization leaves a clean Git repository, publication is
visible as a Lifecycle Data diff, doctor passes, an ordinary Git commit restores a
clean tree, and the subsequent Assignment prepares successfully. It then changes
one tracked byte and proves through `scenario prepare` that the same Assignment is
stale. The proof does not inspect ignored lease storage or bypass Scenario
submission to make progress.

## Route composition

The structured [`phase-hardening-matrix.yaml`](phase-hardening-matrix.yaml) uses
rows only for presentation. Every route independently carries its exact:

- evidence and links;
- Selectors, Obligations, participation Policies, and Resolver Scenario;
- single next Operator Outcome, budget, and disposition;
- evidence reuse or invalidation; and
- registered executable fixture or compiled-public-seam assertion.

`test/phase-hardening-matrix.test.ts` validates each route directly rather than
inheriting these fields from its row. Its registration check requires a globally
unique literal test identity, a direct assertion or explicitly named assertion
helper, and no matrix-derived evidence. The authoritative suite runs those tests;
static registry inspection alone does not establish route semantics.

Registered evidence includes attended Product Wayfinding and a Consolidation
Group, fresh package-delegated independent Review, lifecycle Correction and
escalation, reviewed gate rejection and return, shared accepted SYS impact across
two exact consumers, accepted-change behavior, Pilot Assessment Correction, and
all declared terminal outcomes. Cross-cutting Assignment transport rows separately
prove first-malformed correction and second-malformed exhaustion. Those rows name
no package Selector, Obligation, participation Policy, or Resolver because
response-contract rejection occurs before Scenario publication and writes no
Lifecycle Data.

## Declared stops and deferred work

The package evidence proves these exact successful stops:

- reviewed `proceed` → **Profile Boundary Reached**;
- reviewed `change` without explicit CHG work → **Profile Boundary Reached**;
  accepted-change routes separately prove bounded Phase 7 Assignments; and
- reviewed `stop` → **Lifecycle Complete**.

None uses an empty queue or Process Dead End as success. Phase 3–6 expansion
remains deferred. Interface contraction is complete: fresh-pilot operation uses
only init, status, next, prepare, submit, doctor, read-only inspection, and
ordinary Git.

## Exact-head clean-checkout quality gate

The publication gate uses a detached checkout at the exact proposed head. It must
start clean and remain clean after every read-only gate. The immutable head,
command output, durations, and post-gate status are retained in issue #103
validation evidence outside the checkout, avoiding the circular claim of embedding
a commit's own identity inside that commit.

| Gate | Required publication evidence |
| --- | --- |
| Clean checkout identity | Exact proposed head and empty `git status --porcelain` before validation |
| Package validation | `node dist/mdlm.js process validate --ref .lifecycle/process --json` passes |
| Package fixtures | `node dist/mdlm.js process test --ref .lifecycle/process --json` reports zero failures |
| Build and type-check | `npm run build && npm run typecheck` pass |
| Authoritative bounded gate | `npm test` passes package/evaluator contracts and representative compiled-public transactions within the exact 2,400,000 ms deadline |
| Contracted executable | Package metadata exposes only `mdlm`, and removed prototype entry files are absent from `dist/` |
| Post-gate cleanliness | Exact head remains unchanged and `git status --porcelain` remains empty |
