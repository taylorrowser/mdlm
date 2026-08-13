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
Correction, and all declared terminal outcomes.

## Declared stops and deferred work

The package evidence proves these exact successful stops:

- reviewed `proceed` → **Profile Boundary Reached**;
- reviewed `change` → bounded Phase 7 work, then **Profile Boundary Reached**;
- reviewed `stop` → **Lifecycle Complete**.

None uses a null item or Process Dead End. Phase 3–6 expansion and public-interface
contraction remain deferred; issue #104 owns the latter. Legacy `req`, custom
package setup, adapter execution, and direct fixture setup that remain in older
focused tests are not represented as fresh-pilot operation.

## Repair validation

The narrow repair was checked with these repository commands:

| Gate | Command | Result |
| --- | --- | --- |
| Matrix and Phase 2 route evidence | `npx vitest run --config vitest.fast.config.ts test/phase-hardening-matrix.test.ts test/evaluate-system-decomposition.test.ts` | 2 files, 15 tests passed |
| Package loading | `npx vitest run --config vitest.fast.config.ts test/load-process-package.test.ts` | 1 file, 40 tests passed |
| Package validation | `node dist/req-entry.js process validate --ref .lifecycle/process --json` | compilation, references, and capability bindings passed |
| Package fixtures | `node dist/req-entry.js process test --ref .lifecycle/process --json` | 0 failed |
| Build | `npm run build` | passed |
| Type-check | `npm run typecheck` | passed |

The authoritative fast-suite and complete-suite results are intentionally not
claimed here: the frontier orchestrator owns those clean-tip gates and must reject
the committed tip unless they pass. This packet records only checks actually run
for the repair.
