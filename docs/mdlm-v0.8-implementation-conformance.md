# MDLM v0.8 implementation conformance

- **Status:** Completed concept-validating implementation profile
- **Design baseline:** [`mdlm-process-overview-v0.8.md`](mdlm-process-overview-v0.8.md)
- **Implementation package:** `mdlm-bootstrap@0.30.0`
- **Expansion decision:** `change`

## Purpose

This report closes the implementation program tracked by GitHub issue #14 and
tracer issues #15–#48. It records what the repository demonstrates now without
rewriting the accepted v0.8 overview's historical evidence labels or claiming a
production-complete product.

The completed profile validates a process-neutral declarative kernel, generic
`req` surface, durable Markdown repository, atomic Scenario publication, and a
bounded Example Process Package through Phases 0–2, localized change control,
and reviewed pilot assessment. The assessment Decision deliberately defers
Phases 3–6.

## Conformance boundary

Conformance here means that the accepted implementation profile is executable
through its established public seams:

- `loadProcessPackage(path)`
- `resolveType(package, typeId)`
- `evaluateLifecycle(package, snapshot)`
- the `req` executable

It does not mean regulatory qualification, production hardening, a complete
software V-model package, or implementation of the items explicitly deferred by
the accepted overview and the reviewed pilot Decision.

## Implementation trace

| v0.8 concern | User stories | Tracer issues | Executable evidence |
| --- | ---: | ---: | --- |
| Textual, typed, terminating expressions | 7–12 | #15–#20 | `test/textual-expression.test.ts`, `test/req-process-expression.test.ts` |
| Package types, templates, links, capabilities, and graph validation | 1–6, 18–19, 23–27 | #21–#24 | `test/load-process-package.test.ts`, `test/resolve-type.test.ts`, `test/kernel-capability.test.ts` |
| Dependency changes, States, Obligations, phases, blockers, Dispatchability, and explanations | 13–17, 35–42 | #25–#31 | `test/dependency-changes.test.ts`, `test/evaluate-*.test.ts`, `test/req-lifecycle.test.ts` |
| Explicit package selection, inspection, expression evaluation, and process-neutral scaffolding | 20–22, 48–51 | #32–#35 | `test/req-process.test.ts`, `test/req-process-scaffold.test.ts` |
| Markdown-authoritative repository, revision lineage, links, exact baselines, diff, and rebuild | 28–34 | #36–#40 | `test/req-datum-repository.test.ts`, `test/req-revision-history.test.ts`, `test/req-link-graph.test.ts`, `test/req-exact-baseline.test.ts`, `test/req-baseline-diff-rebuild.test.ts` |
| Authorized dry-run, atomic adapter execution, provenance, and safe aliases | 43–47 | #41–#43 | `test/req-scenario-dry-run.test.ts`, `test/req-scenario-execution.test.ts`, `test/req-command-alias.test.ts` |
| Phase 0 wayfinding and reviewed intent gate | 52–53, 57–58 | #44 | `test/req-phase-0-wayfinding.test.ts` |
| Qualification and source-independent pilot verification | 55, 57–58 | #45 | `test/req-product-assurance-pilot.test.ts` |
| Phase 2 decomposition, simplification, candidates, and reviewed gate | 52–53, 57–58 | #46 | `test/req-system-decomposition.test.ts` |
| Exact problem/change control with selective historical reuse | 54, 57–58 | #47 | `test/req-change-control.test.ts` |
| Durable pilot measurements, independent Review, and expansion Decision | 56–60 | #48 | `test/req-pilot-assessment.test.ts` |

The full suite supplies overlapping regression coverage rather than treating this
table as one test per requirement.

## Pilot-readiness repairs after closeout

Issues #49–#51 preserve the accepted v0.8 boundary while repairing public operator
seams found in the external bootstrap pilot: repository-backed Resolver dry-run,
effective lifecycle-type inspection, and explicit atomic initiation of package-
authored non-Resolver Scenarios. Their executable evidence is
`test/req-scenario-dry-run.test.ts`, `test/req-schema.test.ts`, and
`test/req-scenario-initiation.test.ts`. They do not add Phase 3–6 scope or change
the reviewed `change` expansion Decision.

## Demonstrated invariants

- The kernel owns the Datum Envelope, identity, revision lineage, integrity,
  immutability, hashing, graph storage, transactions, and deterministic
  evaluation.
- Packages own payload vocabulary, links, Selectors, Policies, States,
  Obligations, Scenarios, phases, prompts, skills, and aliases.
- Generic source recognizes no bootstrap lifecycle type, phase, Scenario, command
  alias, pilot metric, or expansion recommendation.
- Textual `mdlm-expression@1` is the only package authoring representation;
  compiled nodes remain private.
- Markdown Lifecycle Data is authoritative. Indexes and reports are disposable
  projections and are not correctness inputs.
- Exact baseline comparison produces structural changes; package Policy decides
  Staleness.
- Resolver availability is distinct from Dispatchability, Resolver execution
  requires one exact Dispatchable Obligation Instance, and explicit initiation is
  confined to package-declared non-Resolver Scenarios without fabricating one.
- Invalid Scenario inputs fail before the adapter boundary.
- Generated lifecycle types publish only through validated Scenario execution;
  all outputs and required links validate before one atomic transaction publishes.
- Qualification, pilot, and formal evidence remain distinct. Pilot evidence
  cannot promote itself into formal requirement evidence.
- The reviewed pilot recommendation is `change`; no Phase 3–6 definitions are
  present.

## Pilot outcome and remaining limits

The final pilot assessment records useful exact Loose Ends, correct selective
reuse and Staleness explanations, sufficient environment profiles, and successful
discrimination between supported and unsupported behavior. It also records high
Review/gate ceremony and no demonstrated scope removal. The exact expansion
Decision therefore adopts `change`, not `proceed`.

The following remain intentionally outside this completed profile:

- Phase 3–6 package definitions and outputs;
- production graph indexing before realistic repository measurements justify it;
- claim/lease orchestration and broader concurrency profiles;
- source-isolation containers;
- brownfield retrofit workflow;
- formal regulatory-compliance claims;
- broader package policy and telemetry questions retained in
  `.lifecycle/process/OPEN-QUESTIONS.md`.

Future work must begin from the reviewed `change` Decision rather than silently
expanding the package or moving package vocabulary into MDLM core.
