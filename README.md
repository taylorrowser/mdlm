# MDLM v0.8 evaluator prototype

This repository contains the completed concept-validating v0.8 implementation
profile: a narrow process-neutral TypeScript kernel, one `mdlm` operator
surface with a temporary prototype-only `req` bridge, a durable Markdown
repository, and a bootstrap subset of MDLM's first bundled
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
  inspection and validation, classifies the current Operator Outcome, leases its
  next exact Assignment when work can advance, prepares a harness-neutral packet,
  and accepts a complete Scenario Proposal or typed inability response. Submission
  validates every Scenario Proposal output and publishes the whole canonical
  transaction atomically with exact response provenance; rejection and inability
  publish nothing. One malformed Assignment Response may be corrected through the
  same Assignment; a second malformed response exhausts it. MDLM does not invoke
  an adapter or execute Package Command Aliases.
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

# Initialize a clean Git repository with the bundled Example Process Package
node dist/mdlm.js init ./example-repository
cd example-repository

# Orient without allocating work, then obtain the exact current Operator Outcome.
node ../dist/mdlm.js status
node ../dist/mdlm.js next
node ../dist/mdlm.js scenario prepare <assignment-id>
# After a harness returns mdlm-assignment-response@1, publish from a file or stdin.
# Follow the packet's exact responseSchema: report loadedSkillRefs and give every
# output a localId for $proposal.<localId>.id/revision_id references.
node ../dist/mdlm.js scenario submit ./assignment-response.json
cat ./assignment-response.json | node ../dist/mdlm.js scenario submit
# A typed unable response abandons this Assignment without Lifecycle Data. Its
# reason is stale-scope, insufficient-declared-inputs, prohibited-input-conflict,
# ambiguity, or execution-failure, with structured diagnostics. A later explicit
# `mdlm next` may allocate a fresh Assignment.
node ../dist/mdlm.js doctor
# Inspect untracked transaction files and commit them with ordinary Git.
git status --short
git add -N .lifecycle/data
git diff -- .lifecycle/data
git add .lifecycle/data && git commit -m "Publish Scenario transaction"
node ../dist/mdlm.js phase status phase-0-wayfinding
node ../dist/mdlm.js schema STK
node ../dist/mdlm.js history <stable-id>
node ../dist/mdlm.js backlinks <identity>
node ../dist/mdlm.js trace <identity>
node ../dist/mdlm.js baseline verify <baseline-revision>
node ../dist/mdlm.js baseline diff <old-baseline> <new-baseline>
```

`mdlm next` emits `mdlm-next@1` JSON. Runnable autonomous or delegated work is
an `assignment`. Immediate attended work and attended work at an active
package-declared checkpoint are `attention-required`. Every attended outcome
includes lifecycle-neutral `attentionContext.invocations`, projecting only the
names and exact values of package-bound Scenario inputs needed for the
conversation; packages retain all semantic ownership of those inputs. Checkpoint attention
contains the complete compatible Consolidation Group, every exact subject and
its package payload (including the bundled QST `blocking_impact`), and the first
exact Assignment. The matching Assignment packet declares a freeform,
harness-mapped conversation with no transcript storage by default. The harness
normalizes conclusions explicitly; MDLM does no natural-language matching.
Publication remains one exact Scenario Proposal at a time, and the next
`mdlm next` reevaluates which group items still apply. Checkpoint scheduling is
not formal deferral; deferral requires a deferred QST Revision with a concrete
`reactivation_condition`, an exact scoped DEC, and its policy-required passing
Review. Unfinished supported work with no reachable Assignment or
attention is `process-dead-end`; repository or package integrity failure is
`invalid` and exits nonzero. `mdlm status` reports the same classification
without allocating an Assignment.

`npm run prototype -- <arguments>` and the `req` executable remain temporary
branch-green bridges for prototype tests pending the clean-interface contract.
The `mdlm` product surface does not execute adapters or executable Package Command
Aliases; harnesses return structured proposals or typed inability through
`scenario submit`. Contract-form failure reports either `correction-required` or
`exhausted`; MDLM never starts a replacement child.

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
