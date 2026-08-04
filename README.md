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
  Policy applicability, generated historical Obligation explanations from explicit
  repository snapshots, and explanations from primitive graph and integrity data.
- The `req` executable explicitly installs and selects exact Process Packages,
  provides package-neutral inspection and validation, and evaluates addressed
  expression fields, Relations, Selectors, Policies, Computed States, and
  Obligations with matching human/JSON evidence and source spans. It also reports
  package-defined Phase status, exact Loose Ends, and only currently Dispatchable
  next work from explicit snapshots. Process authors can scaffold an empty
  case-specific package, derive an independently versioned package with exact
  provenance, add every accepted definition kind, and create executable package
  fixtures without activating the bundled example. The first durable repository
  slice explicitly initializes against a validated package, atomically creates
  and revises typed Markdown Lifecycle Data, preserves immutable exact history,
  diagnoses competing editable drafts, validates atomic source-owned link
  mutations, computes backlinks and identity-preserving graph traces, reads
  durable content and lineage with computed projections, compares exact baselines
  through their capability binding, and rebuilds disposable indexes and reports
  from Markdown truth.

## Try it

```bash
npm install
npm test
npm run typecheck
npm run prototype

# Scaffold and validate a process-neutral package
node dist/req.js process init ./case-process
node dist/req.js process validate --ref ./case-process

# Initialize a repository against an explicit package
mkdir example-repository
cd example-repository
node ../dist/req.js init --process ../.lifecycle/process
node ../dist/req.js revise PSP-0123456789
node ../dist/req.js history PSP-0123456789
node ../dist/req.js link QST-0123456789-r00001 PSP-0123456789 --type blocks
node ../dist/req.js backlinks PSP-0123456789
node ../dist/req.js trace PSP-0123456789 --relation blocks --depth 2
node ../dist/req.js baseline add BSL-0123456789 STK-0123456789-r00001
node ../dist/req.js baseline evidence add BSL-0123456789 REV-0123456789-r00001
node ../dist/req.js baseline freeze BSL-0123456789
node ../dist/req.js baseline verify BSL-0123456789
node ../dist/req.js baseline diff BSL-0123456789-r00001 BSL-ABCDEFGHIJ-r00001
node ../dist/req.js doctor
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

This is not yet the complete durable repository kernel or `req` CLI. Markdown
creation, revision lineage, local single-draft protection, source-owned link
mutation, graph inspection, capability-bound exact-baseline freezing and
verification and diffing, source-backed reads, integrity-aware repository
inspection, and disposable index/report rebuilding are implemented; additional
concurrency profiles and full lifecycle breadth remain deferred.
