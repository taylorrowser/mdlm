# MDLM evaluator prototype

This repository contains a narrow TypeScript evaluator and the bootstrap subset
of MDLM's first bundled Example Process Package: a software V-model lifecycle.
MDLM core remains process-structure-neutral; other packages may define different
types, states, obligations, scenarios, and phases.

## Public interfaces

- `loadProcessPackage(path)` validates and loads process data.
- `resolveType(package, typeId)` flattens the kernel envelope and template chain.
- `evaluateLifecycle(package, snapshot)` computes package-defined phase entry,
  exact candidate selection and gate evaluation, typed dependency-change records,
  states, obligations, and Loose Ends with exact blocker chains, unresolved
  bindings, Dispatchability, Resolver Scenario output contracts, exact Waiver
  Policy applicability, and explanations from primitive graph and integrity data.

## Try it

```bash
npm install
npm test
npm run typecheck
npm run prototype
```

`npm run prototype` loads `.lifecycle/process`, resolves the STK schema, evaluates
`examples/psp-to-sys-snapshot.yaml`, and prints ordered loose ends with reasons and
resolver scenarios.

## References

- Canonical domain language: `CONTEXT.md`
- Accepted process overview: `docs/mdlm-process-overview-v0.8.md`
- Experimental package reference: `docs/mdlm-process-package-reference-v0.2.md`
- Implementation choices and observations: `docs/prototype-decision-log.md`
- Source inputs for the provisional overview: `docs/v0.8-provisional-overview-inputs.md`
- Remaining process questions: `.lifecycle/process/OPEN-QUESTIONS.md`

This is not yet the durable repository kernel or complete `req` CLI. Storage,
atomic writes, hashing, concurrency, and full lifecycle breadth remain deferred.
