# MDLM v0.8 evaluator prototype

This repository contains the completed concept-validating v0.8 implementation
profile: a narrow process-neutral TypeScript kernel, shared generic command
application exposed by the `mdlm` executable and temporary `req` bridge,
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
- The `mdlm` executable initializes the bundled repository, exposes package-neutral
  inspection and validation, leases the next exact Assignment, prepares its
  harness-neutral packet, and accepts a complete Assignment Response. Submission
  validates every Scenario Proposal output and publishes the whole canonical
  transaction atomically with exact response provenance; rejection publishes
  nothing. MDLM does not invoke an adapter or execute Package Command Aliases.
  The temporary `req` bridge retains prototype-era package-authoring and mutation
  behavior until the final clean-interface contract removes that bridge. The first repository-
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
npm run prototype -- process validate --ref .lifecycle/process

# Run the primary MDLM executable
node dist/mdlm.js process validate --ref .lifecycle/process

# Scaffold and validate a process-neutral package
node dist/mdlm.js process init ./case-process
node dist/mdlm.js process validate --ref ./case-process

# Initialize a clean Git repository with the bundled Example Process Package
node dist/mdlm.js init ./example-repository
cd example-repository
# Installation adds an immutable package without activating it; `use` changes
# only package selection. Migrate an initialized repository contract atomically:
node ../dist/mdlm.js process install ../next-process
node ../dist/mdlm.js process migrate next-process@1.2.3
node ../dist/mdlm.js revise PSP-0123456789
node ../dist/mdlm.js history PSP-0123456789
node ../dist/mdlm.js link QST-0123456789-r00001 PSP-0123456789 --type blocks
node ../dist/mdlm.js backlinks PSP-0123456789
node ../dist/mdlm.js trace PSP-0123456789 --relation blocks --depth 2
node ../dist/mdlm.js baseline add BSL-0123456789 STK-0123456789-r00001
node ../dist/mdlm.js baseline evidence add BSL-0123456789 REV-0123456789-r00001
node ../dist/mdlm.js baseline freeze BSL-0123456789
node ../dist/mdlm.js baseline verify BSL-0123456789
node ../dist/mdlm.js baseline diff BSL-0123456789-r00001 BSL-ABCDEFGHIJ-r00001
node ../dist/mdlm.js doctor
node ../dist/mdlm.js loose-ends --phase phase-0-wayfinding
# Lease one exact Assignment, then expand it for a harness or agent:
node ../dist/mdlm.js next
node ../dist/mdlm.js scenario prepare <assignment-id>
# After a harness returns mdlm-assignment-response@1, publish from a file or stdin.
node ../dist/mdlm.js scenario submit ./assignment-response.json
cat ./assignment-response.json | node ../dist/mdlm.js scenario submit
node ../dist/mdlm.js doctor
# Inspect untracked transaction files and commit them with ordinary Git.
git status --short
git add -N .lifecycle/data
git diff -- .lifecycle/data
git add .lifecycle/data && git commit -m "Publish Scenario transaction"
node ../dist/mdlm.js phase status phase-0-wayfinding
node ../dist/mdlm.js schema STK
# Inspect a package-authored non-Resolver Scenario without publication:
node ../dist/mdlm.js scenario dry-run chart-wayfinding-map@1 --initiate
# Resolver Scenario inspection retains exact Dispatchable Obligation authorization:
node ../dist/mdlm.js scenario dry-run create-review-context@1 \
  --obligation '<exact-review-context-obligation-instance>'
# Prototype-bound QSTs route through their package-owned exact-evidence Resolver:
node ../dist/mdlm.js scenario dry-run resolve-question-with-prototype@1 \
  --obligation '<exact-prototype-question-obligation-instance>' \
  --input question=QST-0123456789-r00001
# An explicit fixture remains available for package tests and historical evaluation:
node ../dist/mdlm.js scenario dry-run create-review-context@1 \
  --obligation 'review-context-required@2:PSP-7K3M9Q2D8F-r00001:git:prototype' \
  --snapshot ../examples/psp-to-sys-snapshot.yaml
```

`npm run prototype -- <arguments>` and the `req` executable remain temporary
branch-green bridges for prototype tests pending the clean-interface contract.
The `mdlm` product surface does not execute adapters or executable Package Command
Aliases; harnesses return structured proposals through `scenario submit`.

## References

- Canonical domain language: `CONTEXT.md`
- Accepted process overview: `docs/mdlm-process-overview-v0.8.md`
- v0.8 implementation conformance: `docs/mdlm-v0.8-implementation-conformance.md`
- Experimental package reference: `docs/mdlm-process-package-reference-v0.2.md`
- Generic pi operator loop: `docs/mdlm-pi-operator.md`
- Implementation choices and observations: `docs/prototype-decision-log.md`
- Source inputs for the provisional overview: `docs/v0.8-provisional-overview-inputs.md`
- Remaining process questions: `.lifecycle/process/OPEN-QUESTIONS.md`

The accepted v0.8 concept-validating implementation profile is complete. It is
not a production-readiness or complete-V-model claim: broader concurrency,
production indexing, source-isolation, brownfield support, formal compliance, and
Phase 3–6 lifecycle breadth remain deferred. The reviewed pilot expansion
Decision is `change`; future breadth must address ceremony and demonstrated scope
removal before proceeding.
