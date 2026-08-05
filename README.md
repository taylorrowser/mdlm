# MDLM v0.8 evaluator prototype

This repository contains the completed concept-validating v0.8 implementation
profile: a narrow process-neutral TypeScript kernel, generic `req` executable,
durable Markdown repository, and bootstrap subset of MDLM's first bundled
Example Process Package. The example is a software V-model lifecycle; other
packages may define different types, States, Obligations, Scenarios, and phases.

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
  next work from explicit fixtures or durable repository truth selected by
  `--phase`. Process authors can scaffold an empty
  case-specific package, derive an independently versioned package with exact
  provenance, add every accepted definition kind, and create executable package
  fixtures without activating the bundled example. The first durable repository
  slice explicitly initializes against a validated package, atomically creates
  and revises typed Markdown Lifecycle Data, preserves immutable exact history,
  diagnoses competing editable drafts, validates atomic source-owned link
  mutations, computes backlinks and identity-preserving graph traces, reads
  durable content and lineage with computed projections, compares exact baselines
  through their capability binding, rebuilds disposable indexes and reports from
  Markdown truth, dry-runs Dispatchable Resolver Scenarios with exact Obligation
  authorization or explicitly initiated non-Resolver Scenarios, preserves exact
  bindings, prompts, skills, Policies, output contracts, and completion checks,
  and executes those same validated projections through an explicitly configured
  agent adapter. Successful execution atomically publishes only contract-conforming
  Lifecycle Data plus exact execution provenance; failed execution publishes none.
  Selected packages may expose dotted, declarative Package Command Aliases whose
  typed arguments resolve to that identical Scenario execution path without
  adding shell commands, package code, or host functions. The first repository-
  backed Example Process Package tracers move an exact MAP/PSP/STK intent slice
  through a reviewed Gate Sign-off, qualify one environment and run one
  source-independent verification pilot, and move one reviewed Decomposition Work
  Package through exact SYS output, architecture/interface simplification,
  completion Review, composed group/level candidates, and a reviewed SYS gate.
  A localized pilot-discovered change tracer preserves exact authorization while
  proving selective evidence reuse and package-routed Staleness. The final pilot
  assessment freezes durable observations, publishes generated structured
  measurements, requires independent contextual Review, and records an exact
  `change` expansion Decision before any Phase 3–6 definition exists.

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
node ../dist/req.js loose-ends --phase phase-0-wayfinding
node ../dist/req.js next --phase phase-0-wayfinding
node ../dist/req.js phase status phase-0-wayfinding
node ../dist/req.js schema STK
# Explicitly prepare and execute one package-authored non-Resolver Scenario:
node ../dist/req.js scenario dry-run chart-wayfinding-map@1 --initiate
node ../dist/req.js scenario execute chart-wayfinding-map@1 --initiate \
  --adapter ./configured-agent-adapter
# Resolver Scenarios retain exact Dispatchable Obligation authorization:
node ../dist/req.js scenario dry-run create-review-context@1 \
  --obligation '<exact-review-context-obligation-instance>'
# An explicit fixture remains available for package tests and historical evaluation:
node ../dist/req.js scenario dry-run create-review-context@1 \
  --obligation 'review-context-required@2:PSP-7K3M9Q2D8F-r00001:git:prototype' \
  --snapshot ../examples/psp-to-sys-snapshot.yaml
# Selected package convenience over the same generic Scenario execution contract:
node ../dist/req.js question resolve --question QST-0123456789-r00001 \
  --obligation '<exact-open-question-obligation-instance>' \
  --adapter ./configured-agent-adapter
```

`npm run prototype` loads `.lifecycle/process`, resolves the STK schema, evaluates
`examples/psp-to-sys-snapshot.yaml`, and prints ordered loose ends with reasons and
resolver scenarios.

## References

- Canonical domain language: `CONTEXT.md`
- Accepted process overview: `docs/mdlm-process-overview-v0.8.md`
- v0.8 implementation conformance: `docs/mdlm-v0.8-implementation-conformance.md`
- Experimental package reference: `docs/mdlm-process-package-reference-v0.2.md`
- Implementation choices and observations: `docs/prototype-decision-log.md`
- Source inputs for the provisional overview: `docs/v0.8-provisional-overview-inputs.md`
- Remaining process questions: `.lifecycle/process/OPEN-QUESTIONS.md`

The accepted v0.8 concept-validating implementation profile is complete. It is
not a production-readiness or complete-V-model claim: broader concurrency,
production indexing, source-isolation, brownfield support, formal compliance, and
Phase 3–6 lifecycle breadth remain deferred. The reviewed pilot expansion
Decision is `change`; future breadth must address ceremony and demonstrated scope
removal before proceeding.
