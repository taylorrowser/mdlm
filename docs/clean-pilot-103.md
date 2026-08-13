# Issue #103 clean-pilot proof

Issue #103 uses a compositional proof at the compiled `mdlm` interface. The
[recorded contract clarification](https://github.com/taylorrowser/mdlm/issues/103#issuecomment-5274820461)
retains every public operator and package invariant while deliberately avoiding a
second, imperative mega-fixture that duplicates the declarative Process Package.

## Fresh-repository transaction

`test/mdlm-clean-pilot-contract.test.ts` starts with `mdlm init` in an absent
destination and executes this exact public sequence:

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
stale. The test does not inspect the ignored lease or use direct mutation to make
pilot progress.

## Route composition

The structured [`phase-hardening-matrix.yaml`](phase-hardening-matrix.yaml) uses
rows only for presentation. Every route independently carries its exact:

- evidence and links;
- Selectors, Obligations, participation Policies, and Resolver Scenario;
- single next Operator Outcome, budget, and disposition;
- evidence reuse/invalidation; and
- registered executable fixture or compiled-public-seam test.

`test/phase-hardening-matrix.test.ts` validates each route directly rather than
inheriting these fields from its row. It parses registered tests, requires real
behavioral assertions (including assertions reached through local helpers), and
binds the SYS, ASP, ICSP, planning-DWP, completion-DWP, and collateral-Finding
Correction routes to dedicated package-evaluation assertions instead of a broad
happy-path title.

The registered route evidence includes attended Product Wayfinding and one
Consolidation Group, fresh package-delegated independent Review, lifecycle
Correction and escalation, reviewed gate rejection and return, shared accepted
SYS impact across two exact consumers, formal change behavior, pilot-assessment
Correction, and all declared terminal outcomes. The cross-cutting Assignment
transport rows separately prove first-malformed correction and second-malformed
exhaustion. Those rows intentionally name no package Selector, Obligation,
participation Policy, or Resolver because response-contract rejection occurs
before Scenario execution and publishes no Lifecycle Data.

## Declared stops and deferred work

The package evidence proves these exact successful stops:

- reviewed `proceed` → **Profile Boundary Reached**;
- reviewed `change` → bounded Phase 7 work, then **Profile Boundary Reached**;
- reviewed `stop` → **Lifecycle Complete**.

None uses a null item or Process Dead End. Phase 3–6 expansion and public-interface
contraction remain deferred; issue #104 owns the latter. Legacy `req`, custom
package setup, adapter execution, and direct fixture setup that remain in older
focused tests are not represented as fresh-pilot operation.

## Exact-head clean-checkout quality gate

The publication gate uses a detached checkout at the exact proposed PR head. It
must start clean and remain clean after every read-only gate. The immutable head,
command output, durations, and post-gate status are retained in the issue #103
validation evidence outside the checkout, avoiding the impossible circular claim
of embedding a commit's own identity inside that commit.

| Gate | Required publication evidence |
| --- | --- |
| Clean checkout identity | Exact proposed PR head and empty `git status --porcelain` before validation |
| Package validation | `node dist/req-entry.js process validate --ref .lifecycle/process --json` passes |
| Package fixtures | `node dist/req-entry.js process test --ref .lifecycle/process --json` reports zero failures |
| Build and type-check | `npm run build && npm run typecheck` pass |
| Authoritative bounded gate | `npm test` passes package/evaluator contracts and representative compiled-public transactions within five minutes |
| Post-gate cleanliness | Exact head remains unchanged and `git status --porcelain` remains empty |
