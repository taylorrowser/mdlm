# MDLM evaluator prototype decision log

This log records implementation choices, alternatives, expected behavior, and
observations so the prototype can produce explicit learnings rather than silently
turning provisional choices into architecture.

## D-001 — Prototype language and runtime

- **Status:** adopted for prototype
- **Decision:** Use TypeScript on Node.js.
- **Alternatives:** Rust, Python, Go, or an untyped JavaScript spike.
- **Rationale:** The process package is JSON-Schema- and YAML-heavy; Node has mature
  parsers and validators, TypeScript makes evaluator bindings explicit, and the
  intended product is a portable CLI used by agent tooling.
- **Expected behavior:** Fast iteration with enough static checking to expose
  ambiguous evaluator values and result shapes.
- **Reversibility:** High. Process data and public interfaces remain portable.
- **Evidence/observations:** Strict typing caught an invalid optional-property
  projection and a build configuration that accidentally emitted tests.

## D-002 — Confirmed public seams

- **Status:** confirmed by user
- **Decision:** Test only `loadProcessPackage`, `resolveType`, and
  `evaluateLifecycle` as public interfaces.
- **Alternatives:** Expose and test parser, expression evaluator, graph index, and
  policy evaluator separately.
- **Rationale:** Three deep interfaces exercise package validation, schema
  resolution, and lifecycle behavior while keeping implementation choices private.
- **Expected behavior:** Internal evaluator decomposition can change without
  rewriting behavior tests.
- **Reversibility:** Medium. Add a public seam only when a real adapter needs it.
- **Evidence/observations:** A candidate-gate defect was reproduced and corrected
  entirely through `evaluateLifecycle`; tests never accessed evaluator internals.

## D-003 — Prototype dependencies

- **Status:** adopted for prototype
- **Decision:** Use `yaml`, Ajv JSON Schema 2020-12 validation, and Vitest.
- **Alternatives:** Custom parsing/validation or Node-only test infrastructure.
- **Rationale:** Schema validation is product behavior, not an area where a
  throwaway custom validator provides useful learning.
- **Expected behavior:** Deterministic path-oriented diagnostics while process
  definitions remain ordinary portable data.
- **Reversibility:** High behind `loadProcessPackage`.
- **Evidence/observations:** Ajv compiled the cross-referenced v0.2 meta-schemas and
  validated all current YAML definitions. YAML aliases in snapshots also work.

## D-004 — Engineering defaults delegated by the user

- **Status:** provisional
- **Decision:** Begin with restricted additive templates, strict known-path checks
  where practical, conservative dependency staleness, source-local links, per-item
  collection conditions, generated obligation explanations, reviewed gate-signoff
  decisions, shared review contexts, and conservative baseline rules.
- **Alternatives:** Those in `.lifecycle/process/OPEN-QUESTIONS.md`.
- **Rationale:** These choices are easier to judge through observable behavior than
  abstract technical discussion.
- **Expected behavior:** The user can judge loose ends, review volume, staleness,
  and gates from a working PSP → STK → SYS example.
- **Reversibility:** Intentionally high during the prototype.
- **Evidence/observations:** Relational selectors computed review contexts,
  backlinks, candidate member coverage, staleness, and process drift without a
  process-specific kernel fact. Gate review timing exposed D-007.

## D-005 — Separate durable data from kernel runtime projection

- **Status:** adopted for prototype
- **Decision:** `evaluateLifecycle` receives durable datum envelopes alongside
  kernel-computed `storage` and `integrity` projections. Dependency changes are
  supplied as typed relation records.
- **Alternatives:** Store runtime fields in Markdown or make the process evaluator
  parse and hash repositories itself.
- **Rationale:** The evaluator should exercise process behavior while the kernel
  remains responsible for storage and integrity primitives.
- **Expected behavior:** Fixtures vary integrity and staleness without inventing
  durable lifecycle fields.
- **Reversibility:** Medium; the projection can grow while the envelope stays stable.
- **Evidence/observations:** The same rules distinguished valid, stale, frozen, and
  process-drift conditions from primitive snapshot data.

## D-006 — Ready work sorts ahead of blocked work

- **Status:** adopted for prototype
- **Decision:** Order loose ends as `ready`, `awaiting-review`, `failed`, `stale`,
  then `blocked`, with stable subject and obligation tie-breakers.
- **Alternatives:** Definition-file order, phase order, or severity-only order.
- **Rationale:** Initial output displayed blocked reviews before the ready context
  creation that would unblock them.
- **Expected behavior:** The first items shown are actionable without hiding failed
  or stale evidence.
- **Reversibility:** High; ordering is presentation over unchanged obligations.
- **Evidence/observations:** The example now presents three ready context scenarios
  before their three blocked review scenarios.

## D-007 — Existing gate decisions block duplicate gate dispatch

- **Status:** adopted for prototype
- **Decision:** Distinguish a valid recorded gate-signoff DEC from an applicable
  reviewed gate-signoff DEC. While review is outstanding, the candidate gate is
  blocked rather than ready.
- **Alternatives:** Apply sign-off immediately, or leave the candidate ready and
  risk repeatedly dispatching the gate scenario.
- **Rationale:** The first implementation classified a candidate as ready for
  another interview after its unreviewed sign-off already existed.
- **Expected behavior:** The DEC's individual review obligations drive subsequent
  work and no duplicate sign-off is created.
- **Reversibility:** High; behavior lives in selectors and one status rule.
- **Evidence/observations:** A public-seam test reproduced the duplicate-dispatch
  risk and passed after adding `gate-signoff-decisions-for`.

## D-008 — Prototype graph traversal favors clarity over indexing

- **Status:** provisional
- **Decision:** Evaluate primitive relations by scanning the in-memory snapshot.
- **Alternatives:** Build persistent or per-evaluation indexes immediately.
- **Rationale:** Pilot datasets are small and relation semantics are still changing.
- **Expected behavior:** Deterministic understandable results, with optimization
  deferred until measurement justifies it.
- **Reversibility:** High behind `evaluateLifecycle`.
- **Evidence/observations:** Twenty-four selectors and eleven behavior tests run in
  well under a second. This is not a production-scale performance conclusion.

## D-009 — Author process logic as textual expressions

- **Status:** accepted for the next provisional process version
- **Decision:** Replace author-authored YAML expression trees with a safe versioned
  MDLM Expression Language. YAML remains the structural declaration format.
- **Alternatives:** Keep the current YAML AST, embed JavaScript, or turn complete
  selectors and policies into an unrestricted scripting language.
- **Rationale:** The YAML AST is deterministic but exposes implementation structure,
  is verbose, and obscures simple logic. Text expressions are easier for humans
  and agents to read while still compiling to the same typed AST.
- **Expected behavior:** Conditions resemble
  `state(review, "validity") == "valid"`; selector quantifiers use safe built-ins
  such as `exists`, `none`, and `count`; package loading parses and type-checks all
  expressions once.
- **Reversibility:** Medium. The source syntax becomes part of process-package
  compatibility, so the manifest must pin its language version.
- **Evidence/observations:** Current process definitions provide concrete migration
  examples, but the textual parser and migrated package have not yet been
  implemented or behavior-tested.

## D-010 — Distinguish overview confidence levels

- **Status:** accepted for the v0.8 provisional writing pass
- **Decision:** Label behavior as validated by the vertical slice, provisional and
  implemented, specified but not implemented, or deferred.
- **Alternatives:** Present one undifferentiated target model or let readers infer
  implementation status from context.
- **Rationale:** The process vision remains much broader than the current evaluator,
  and ambiguous status would turn prototype choices into accidental claims.
- **Expected behavior:** The next overview can integrate discoveries without
  suggesting the durable kernel, full CLI, or full lifecycle process already exists.
- **Reversibility:** High; these labels are documentation structure.
- **Evidence/observations:** Preparation inputs are captured in
  `docs/v0.8-provisional-overview-inputs.md`.

## D-011 — Treat the V-model structure as the first example package

- **Status:** accepted for v0.8
- **Decision:** MDLM core is process-structure-neutral. The PSP → verification
  V-model, its lifecycle types, phases, reviews, gates, and change flow form the
  first complete Example Process Package shipped with MDLM rather than universal
  kernel semantics.
- **Alternatives:** Treat the V-model as the one built-in MDLM lifecycle or fork
  the product for each lifecycle structure.
- **Rationale:** Types, selectors, policies, obligations, and scenarios are already
  data-defined and can be assembled case by case. Hard-coding the first package's
  vocabulary would contradict the evaluator boundary validated by the slice.
- **Expected behavior:** Repositories explicitly install or select a process
  package. The generic evaluator and CLI work for packages with different types,
  phases, and domain language.
- **Reversibility:** Medium. Documentation and command boundaries become package-
  neutral, while the bundled example remains available unchanged in intent.
- **Evidence/observations:** The evaluator already loads definitions by manifest
  rather than branching on PSP, STK, or SYS for its public interface.

## D-012 — Separate generic CLI operations from package commands

- **Status:** accepted for v0.8
- **Decision:** The core CLI exposes repository, package-authoring, expression,
  definition-inspection, generic datum, graph, evaluator, scenario, and opted-in
  Kernel Capability operations. Lifecycle-specific conveniences are declarative
  Package Command Aliases or future ergonomic wrappers over scenarios.
- **Alternatives:** Hard-code commands such as `req dwp`, `req vsp`, and
  `req change`, or allow process packages to install arbitrary executable plugins.
- **Rationale:** Expressions execute inside the deterministic evaluator, not by
  invoking shell commands. Process authors still need CLI tools to compile,
  inspect, test, and explain every expression-bearing definition.
- **Expected behavior:** The CLI can validate and evaluate expressions, relations,
  selectors, policies, states, obligations, and phases for any package. Package
  aliases cannot bypass scenario contracts or execute package-supplied code.
- **Reversibility:** Medium. Command names may evolve, but the generic/package
  boundary and prohibition on arbitrary plugins are architectural constraints.
- **Evidence/observations:** The v0.8 command review found that package-specific
  nouns dominated the earlier CLI catalog while expression diagnostics and direct
  definition evaluation were missing.

## D-013 — Accept Process Overview v0.8

- **Status:** accepted
- **Decision:** Adopt `docs/mdlm-process-overview-v0.8.md` as the current design
  baseline for MDLM core, the generic CLI, and the first bundled Example Process
  Package.
- **Rationale:** The overview now incorporates the typed evaluator findings,
  textual expression authoring, dispatchability, reviewed gate sign-off,
  process-neutral core boundary, Kernel Capabilities, and generic/package CLI
  separation.
- **Expected behavior:** Implementation work follows v0.8 while retaining explicit
  labels for validated, specified, and deferred behavior. A future change to these
  accepted boundaries requires a new documented version or superseding decision.
- **Reversibility:** Versioned. Historical v0.8 remains unchanged when superseded.
- **Evidence/observations:** Acceptance establishes a design baseline, not a claim
  that the v0.2 bootstrap package or complete CLI already implements it.

## D-014 — Start expression compilation with a purpose-built comparison slice

- **Status:** provisional and implemented
- **Decision:** Compile the first `mdlm-expression@1` comparison with a small
  purpose-built parser while continuing to accept legacy expression trees during
  the controlled expansion migration.
- **Alternatives:** Adopt a CEL-compatible parser before validating the language
  seam, or migrate the complete package in one change.
- **Rationale:** The first slice needs only typed variables, paths, scalar literals,
  comparisons, source spans, and deterministic diagnostics. Keeping the parser
  behind the versioned language contract makes this implementation choice easy to
  replace while allowing one end-to-end behavior to validate the seam.
- **Expected behavior:** Package loading compiles the textual process-drift rule,
  rejects syntax, binding, path, and operand-type errors before evaluation, and
  preserves legacy rule behavior elsewhere in the package.
- **Reversibility:** High. The parser and internal AST are private; only the source
  language and package-load diagnostics are observable contracts.
- **Evidence/observations:** Public-seam tests load and evaluate the textual rule,
  exercise variables, typed paths, and literals, and verify source-oriented
  diagnostics for invalid syntax, unknown bindings, and incompatible operands.

## D-015 — Expand textual expressions through precedence-based composition

- **Status:** provisional and implemented
- **Decision:** Extend the purpose-built parser with conventional precedence for
  negation, comparison and membership, conjunction, and disjunction, plus
  parentheses, presence checks, and recursively evaluated JSON-like values.
- **Alternatives:** Require explicit grouping around every operation, retain
  Boolean YAML trees until host functions are available, or adopt a larger parser
  before validating composed conditions.
- **Rationale:** Conventional precedence keeps package rules concise while a typed
  recursive AST preserves deterministic evaluation and source-oriented errors.
  The slice is sufficient to migrate all current state and Policy rules that do
  not call Selectors, Policies, or Computed States.
- **Expected behavior:** Boolean operands and rule results are checked at package
  load; membership requires a compatible array; `present` distinguishes missing
  values from present false or null values; logical evaluation short-circuits
  deterministically.
- **Reversibility:** High. Parser and AST structure remain private behind
  `loadProcessPackage` and `evaluateLifecycle`; the versioned source behavior is
  the compatibility contract.
- **Evidence/observations:** Public-seam tests cover every JSON-like literal,
  Boolean operation, grouping, presence, operator/result diagnostics, and the
  migrated structural-invalidity and review-applicability behavior.

## D-016 — Resolve typed Selector operations through one evaluator host boundary

- **Status:** provisional and implemented
- **Decision:** Compile `select`, `exists`, `none`, `count`, and `one` against the
  loaded versioned Selector catalog, then execute them through a fixed evaluator-
  supplied selection host rather than exposing query internals to expressions.
- **Alternatives:** Let textual expressions construct query ASTs, defer all
  Selector calls until complete expression migration, or resolve names only at
  runtime.
- **Rationale:** A single host boundary keeps the expression language safe while
  package-load validation can reject unknown versions, missing or extra named
  arguments, incompatible domain kinds and lifecycle types, and selection-versus-
  scalar cardinality mistakes.
- **Expected behavior:** `select` returns a finite selection; `exists`, `none`, and
  `count` derive deterministic cardinality values; `one` yields its sole result
  only for exactly one match. Selector query internals remain private.
- **Reversibility:** High. Selector execution remains behind
  `evaluateLifecycle`; parser nodes and host plumbing are private implementation.
- **Evidence/observations:** Public-seam tests cover all five operations and
  source-oriented diagnostics for unknown Selectors and invalid argument names,
  kinds, lifecycle types, and cardinalities. Migrated candidate Selector and
  review/candidate Obligation rules preserve the behavior suite.
