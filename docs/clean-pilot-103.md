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

The structured [`phase-hardening-matrix.yaml`](phase-hardening-matrix.yaml) groups
reachable routes only when they share the same package seam, participation shape,
Correction budget, disposition, and evidence-reuse rule. Every row names exact:

- evidence and links;
- Selectors, Obligations, participation Policies, and Resolver Scenarios;
- next Operator Outcomes, budgets, and dispositions;
- evidence reuse/invalidation; and
- each named route's registered executable fixture or compiled-public-seam test.

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
