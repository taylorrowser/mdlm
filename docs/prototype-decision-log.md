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

## D-017 — Compose Computed State and typed Policy results through expressions

- **Status:** provisional and implemented
- **Decision:** Resolve `state(subject, dimension)` against the loaded Computed
  State catalog and resolve `policy(ref, arguments).field` against versioned,
  typed Policy definitions through the same closed evaluator host boundary used
  for Selectors.
- **Alternatives:** Keep State and Policy reads in the legacy YAML tree, return an
  untyped Policy object, or defer dependency checks until runtime recursion.
- **Rationale:** Package-load resolution gives authors source-oriented errors for
  bad dimensions, subjects, Policy references, arguments, result fields, and
  result types. Rejecting direct State/Policy call cycles before evaluation keeps
  valid packages deterministic instead of relying on runtime recursion guards.
- **Expected behavior:** Exactly-one State dimensions produce strings,
  zero-or-more dimensions produce arrays, and selected Policy fields carry their
  declared JSON Schema type into expression checking. Direct dependencies among
  State and Policy rules must be acyclic.
- **Reversibility:** High. Catalog resolution, dependency extraction, and host
  plumbing remain private behind `loadProcessPackage` and `evaluateLifecycle`.
- **Evidence/observations:** Public-seam tests exercise State and Policy values,
  reference and type diagnostics, State-only and State/Policy cycle rejection,
  and review, validity, waiver, process-drift, candidate, and gate regressions.

## D-018 — Complete textual migration with finite universal quantification

- **Status:** provisional and implemented
- **Decision:** Add `every(selectorRef, arguments, binding => predicate)` as the
  sole finite universal form and migrate every expression-bearing field in the
  bootstrap package from authored YAML trees to `mdlm-expression@1` source.
- **Alternatives:** Keep candidate coverage as negated missing-result queries,
  retain structural value trees in queries and resolver bindings, or add a more
  general lambda and collection language.
- **Rationale:** A Selector already provides the finite, typed iteration boundary.
  One scoped binding and a Boolean predicate are sufficient for universal process
  claims without introducing unbounded iteration or general-purpose functions.
- **Expected behavior:** The binding receives the Selector's declared result kind
  and lifecycle types; its predicate must compile to Boolean; evaluation stops on
  the first false result and is true for an empty finite selection. Query source
  values, resolver bindings, Scenario conditions and completion, and phase entry,
  candidate selection, and gate completion compile from textual source as well.
- **Reversibility:** High for implementation and low for package authoring. The
  private AST and evaluator host remain replaceable, while textual v1 source is
  now the package contract ahead of explicit legacy rejection.
- **Evidence/observations:** Public-seam tests cover successful universal
  evaluation, unknown and wrongly typed bindings, non-Boolean predicates, and the
  complete lifecycle regression suite after package-wide textual migration.

## D-019 — Reject authored YAML expression trees at package load

- **Status:** accepted and implemented
- **Decision:** `mdlm-expression@1` source strings are the only valid authoring
  representation for expression-bearing fields. Meta-schemas require strings and
  semantic validation emits one stable migration diagnostic for any remaining
  YAML expression object.
- **Alternatives:** Continue dual authoring indefinitely, silently translate old
  trees, or rely only on verbose generic meta-schema errors.
- **Rationale:** One contract removes ambiguous author intent and prevents the
  private evaluator representation from becoming a second public language. The
  semantic diagnostic gives a direct repair path while the schema independently
  enforces the boundary.
- **Expected behavior:** The manifest pins `mdlm-expression@1`; object-valued
  expressions and structural Selector invocations fail package loading; valid
  textual packages compile as before.
- **Reversibility:** Versioned. A future authored representation requires a new
  expression-language interface version rather than weakening v1.
- **Evidence/observations:** Public package-load tests cover every former value and
  predicate tree family, structural Selector invocation, exact language pinning,
  and simultaneous semantic and meta-schema rejection.

## D-020 — Bind exact-baseline behavior by versioned capability, not type ID

- **Status:** accepted and implemented
- **Decision:** A Process Package opts one compatible type into the kernel-shipped
  `exact-baseline@1` contract through its manifest. The capability requires
  managed definition-member, evidence, and snapshot payload fields plus an exact
  `composes` link to the bound type.
- **Alternatives:** Continue recognizing `BSL` in evaluator branches, infer
  baseline behavior from payload shape, or expose baseline primitives to every
  package.
- **Rationale:** An explicit versioned contract keeps integrity behavior fixed and
  inspectable while allowing packages to choose their own lifecycle vocabulary.
  Shape inference would be ambiguous, and universal exposure would claim services
  that an unbound package did not select.
- **Expected behavior:** The bootstrap explicitly binds `BSL`; a compatible type
  with another ID receives the same baseline collection, membership, evidence,
  and composition relations; unbound use fails package validation.
- **Reversibility:** Versioned. A changed integrity contract requires a new Kernel
  Capability version; package type names and bindings remain replaceable.
- **Evidence/observations:** Public package-load, type-resolution, and lifecycle
  tests cover the bootstrap binding, incompatible contracts, an unavailable
  capability surface, and all four relation families under a renamed `SNP` type.

## D-021 — Validate a deliberately limited Payload Template narrowing subset

- **Status:** accepted and implemented
- **Decision:** Top-level payload fields and required sets remain additive. A
  redeclared inherited property schema is complete and must preserve its type,
  nested required fields, and inherited constraints. Safe narrowing supports enum
  subsets, stronger lower and upper bounds, preserved patterns and formats,
  recursive array-item and object-property schemas, and added constraints.
- **Alternatives:** Attempt general JSON Schema subsumption, prohibit all inherited
  property redeclaration, or let child schemas silently replace parent meaning.
- **Rationale:** The limited comparison is deterministic and explainable while
  covering the schema constraints used by the bootstrap package. General
  subsumption would add disproportionate complexity; silent replacement would
  make inherited contracts unsafe.
- **Expected behavior:** Package loading rejects nested required-field removal,
  type changes, weaker constraints, and duplicate inherited outgoing-link IDs.
  Additive fields and supported narrowing resolve to one flattened payload schema.
- **Reversibility:** Versioned. The supported subset may grow through explicit
  rules and fixtures without weakening existing accepted packages.
- **Evidence/observations:** Focused package fixtures assert stable diagnostics for
  each rejection class, and public type resolution verifies additive fields plus
  bound and enum narrowing.

## D-022 — Reject incomplete and cyclic definition graphs at package load

- **Status:** accepted and implemented
- **Decision:** Reconcile each manifest definition catalog with the loaded files,
  resolve cross-definition references against the expected catalog and version,
  and reject complete Template, Selector, Computed State, and Policy dependency
  cycles before exposing a Process Package.
- **Alternatives:** Defer graph failures until type resolution or lifecycle
  evaluation, trust the manifest without reconciling files, or validate only the
  reference string shape.
- **Rationale:** A selected package must be internally complete and deterministic.
  Load-time graph validation gives process authors one stable diagnostic surface
  and prevents evaluator behavior from depending on traversal order.
- **Expected behavior:** Missing and extra manifest entries, unknown or mismatched
  references, recursive Selectors, and cyclic Template or expression dependencies
  make `loadProcessPackage` fail with definition paths and complete cycle paths.
- **Reversibility:** Versioned. Additional definition-reference families can join
  the same graph validator without changing the public package-load seam.
- **Evidence/observations:** Focused copied-package fixtures cover catalog drift,
  each named reference family, version mismatch, and complete Template, Selector,
  and Computed State cycle paths; the bootstrap package remains a valid acyclic
  fixture.

## D-023 — Prove Resolver Scenario contracts before package selection

- **Status:** accepted and implemented
- **Decision:** Package loading validates Obligation resolver bindings against the
  referenced Scenario's exact input names, identity kinds, lifecycle types, and
  cardinalities. It also validates same-Phase resolver enablement, prohibited-
  input conflicts, declared output types, and required links against source-owned
  link contracts, named targets, target types, and cardinalities.
- **Alternatives:** Defer failures until Scenario dispatch, validate only input
  names, or duplicate link meaning in Scenario definitions.
- **Rationale:** Dispatch cannot be safe when its declared inputs or expected
  outputs are structurally impossible. Reusing source-owned type link contracts
  preserves one authority for relationship meaning.
- **Expected behavior:** `loadProcessPackage` rejects missing or extra resolver
  bindings, incompatible kinds/types/cardinalities, disabled resolvers, prohibited
  declared inputs, undeclared output types, and impossible required links.
- **Reversibility:** Versioned. Additional Scenario execution checks can extend
  this load-time contract without exposing expression ASTs or evaluator helpers.
- **Evidence/observations:** Focused copied-package fixtures exercise each contract
  failure through the public loader; the bundled Obligation and Scenario catalog
  remains the valid fixture.

## D-024 — Separate structural dependency changes from Staleness

- **Status:** accepted and implemented
- **Decision:** The kernel compares exact Revisions and emits ordered,
  discriminated `dependency-change@1` records for content paths, outbound-link
  target sets, and stable-link exact resolutions. The records identify the
  affected subject and exact before/after Revisions but contain no Stale Boolean.
  Package-authored selectors classify records for the `validity` Computed State.
- **Alternatives:** Inject caller-authored change records, have the kernel return a
  Stale Boolean, compare only payload hashes, or silently ignore comparisons the
  prototype cannot prove complete.
- **Rationale:** Structural comparison is fixed integrity behavior, while whether
  a change invalidates evidence is process policy. Typed records keep that seam
  explicit and explainable without hiding process conclusions in the kernel.
- **Expected behavior:** Content, outbound-link, and stable-resolution changes have
  deterministic variant shapes and ordering. Matched state rules expose their
  package-authored explanation. Missing Revisions, incompatible lineages, or
  incomplete stable-link resolution contexts fail evaluation with diagnostics and
  return no lifecycle conclusions.
- **Reversibility:** Versioned. Future evidence, baseline, execution-target, and
  environment variants can use later record versions without changing the three
  public evaluator seams.
- **Evidence/observations:** Public lifecycle tests change one dependency at a
  time, assert exact records and Stale explanations, alter the package filter to
  demonstrate process ownership, and exercise an unsupported comparison.

## D-025 — Classify exact-baseline changes through the capability binding

- **Status:** accepted and implemented
- **Decision:** `dependency-change@1` adds membership, composition, evidence-
  target, and review-context variants only when both compared Revisions use the
  package-selected `exact-baseline@1` type. A comparison explicitly identifies
  review-context use; the kernel does not infer it from package payload values.
  Computed State rules may select `explanation_evidence`, whose exact structural
  records are included in evaluator explanations.
- **Alternatives:** Recognize `BSL`, treat managed fields as ordinary content and
  `composes` as an ordinary link, infer review-context meaning from `kind`, or
  return a kernel-owned Stale result.
- **Rationale:** The capability owns exact membership, evidence, composition, and
  snapshot integrity, but candidate and review meaning remains package behavior.
  Explicit context comparison and package-selected evidence preserve that seam.
- **Expected behavior:** Renaming the bound baseline type does not change emitted
  records. Changed exact member, component, evidence, and review-context
  Revisions produce deterministic variants; the bundled package conservatively
  marks only affected subjects Stale and names the causing records.
- **Reversibility:** Versioned. Additional capability-managed fields can add later
  record versions, while explanation evidence is a generic Computed State feature.
- **Evidence/observations:** A public evaluator fixture binds `SNP`, compares two
  exact review-context baselines, asserts all four typed variants and their
  explanation, and confirms unrelated evidence remains valid.

## D-026 — Return package-authored Phase entry and candidate evidence

- **Status:** accepted and implemented
- **Decision:** Lifecycle evaluation resolves the snapshot's Phase from the
  package catalog, evaluates its compiled textual entry and candidate-selection
  expressions, and returns exact typed candidate identities plus the authored
  source and deterministic evidence for every evaluated Selector. Query
  `order_by` paths are honored with exact entity identity as the final tie-break.
- **Alternatives:** Hard-code the bootstrap Phase flow or candidate baseline type,
  return only entry and candidate Booleans/IDs, omit empty Selector results, or
  trust snapshot record order.
- **Rationale:** A Phase is declarative scope rather than a kernel workflow.
  Retaining expression and Selector evidence explains both negative conclusions,
  while package-authored ordering makes selected exact candidates reproducible.
- **Expected behavior:** Any loaded Phase ID can be evaluated. Failed entry names
  the source expression and empty supporting Selector result; candidate selection
  returns package-typed exact identities in declared order. Reordering equivalent
  snapshot records does not change the Phase evaluation and evaluation performs
  no mutation.
- **Reversibility:** Additive. Gate completion and richer blocker reporting can
  extend the Phase result without changing Phase authoring or exposing ASTs.
- **Evidence/observations:** Public lifecycle fixtures exercise failed Phase 2
  entry, missing candidates, a renamed `SNP` capability type, reversed snapshot
  order, repeated evaluation, and input immutability.

## D-027 — Make Dispatchability depend on exact declared blocker chains

- **Status:** accepted and implemented
- **Decision:** An Obligation status rule may declare versioned blocking
  Obligations and select their exact subjects with textual expressions. Evaluation
  resolves those declarations to exact Obligation Instance IDs, reports unresolved
  Resolver Scenario bindings, and separates `eventualResolver`,
  `actionableResolver`, and `dispatchable`. Actionable resolvers are found only at
  deterministic Dispatchable leaves of the blocker graph.
- **Alternatives:** Treat every named resolver as executable, infer blockers from
  explanation prose or private expression ASTs, hard-code gate/review chains, or
  return only status and one resolver string.
- **Rationale:** Eventual resolution is descriptive, while safe orchestration
  requires package-authored dependency meaning plus complete runtime bindings.
  Exact instance edges preserve subject, definition version, and process context.
- **Expected behavior:** Ready or awaiting-review work with complete bindings is
  Dispatchable. Blocked work never is, even when it names a resolver; it instead
  exposes exact direct blockers, complete ordered chains, unresolved binding
  names, and the first safe downstream Resolver Scenario when one exists.
- **Reversibility:** Additive to Obligation authoring and evaluation results.
  Later explanation records can add binding values, outputs, links, and waiver
  evidence without changing the blocker identity contract.
- **Evidence/observations:** Public lifecycle tests cover a ready context creator,
  a review blocked on its exact context Obligation, and a gate whose eventual
  sign-off resolver differs from the currently Dispatchable review resolver.
  Reversing snapshot record order preserves the same exact blocker result.

## D-028 — Evaluate each Phase gate against one exact selected candidate

- **Status:** accepted and implemented
- **Decision:** A Phase gate names its controlling versioned Obligation and its
  completion expression is evaluated once for every exact entity returned by the
  package-authored candidate selector. The gate result combines that expression's
  authored source and exact Policy and Selector invocations with the matching
  exact Obligation Instance's blockers, Dispatchability, and resolvers.
- **Alternatives:** Return one aggregate Phase Boolean, infer the gate Obligation
  from a lifecycle type or ID, reuse sign-off evidence across revisions of one
  Stable Datum, or dispatch the gate Scenario whenever completion is false.
- **Rationale:** Gate authorization applies to an immutable candidate Revision.
  The package must own both candidate selection and gate meaning, while the
  evaluator can safely join their exact identities to generic Obligation results.
- **Expected behavior:** An existing unreviewed Gate Sign-off blocks duplicate
  sign-off dispatch and makes its review the next action. Once valid passing review
  evidence exists, the same exact candidate gate completes. A new candidate
  Revision receives a distinct incomplete evaluation and leaves prior returned
  evidence unchanged.
- **Reversibility:** Additive to Phase evaluation and one required versioned gate
  Obligation reference in the Phase schema. Later persisted gate reports can store
  the same evidence without changing the read-only evaluator contract.
- **Evidence/observations:** Public lifecycle tests exercise exact candidate and
  member Policy evidence, complete blocker chains, unreviewed and reviewed Gate
  Sign-offs, and a changed candidate Revision under the same Stable Datum ID.

## D-029 — Explain resolver outputs and evaluate exact structured waivers

- **Status:** accepted and implemented
- **Decision:** Every Obligation evaluation copies its eventual Resolver
  Scenario's declared prompt and expected output types, cardinalities, and required
  links into the public explanation. Waiver candidates are discovered generically
  from effective source-owned link contracts targeting exact Obligation Instances;
  the Obligation's versioned Waiver Policy alone decides whether each exact
  candidate applies. Applicable waivers receive computed `waived` status and are
  removed from current Loose Ends without changing satisfaction-expression truth.
- **Alternatives:** Hard-code `DEC` or the `waives` link in the evaluator, treat a
  generic justification as suppression, infer waiver validity in kernel code, or
  expose only a Resolver Scenario name with no output contract.
- **Rationale:** Structural link targeting and Scenario contract projection are
  generic evaluator services, while waiver kind, approval, scope, and expiry are
  selected-package policy. Keeping `satisfied` separate from `waived` preserves
  the authored obligation conclusion and explains why work was suppressed.
- **Expected behavior:** Generic justification has no waiver effect. Invalid or
  unreviewed exact evidence remains visible but leaves the Loose End active. The
  bootstrap Policy accepts only exact reviewed `this-revision` waivers with
  `subject-revised` expiry and no newer subject Revision. Waived instances neither
  dispatch nor block dependents.
- **Reversibility:** Additive public explanation fields plus a package Policy rule.
  Future policy versions can support baseline or execution scope and additional
  expiry evidence without changing generic evidence discovery.
- **Evidence/observations:** Public lifecycle tests assert exact resolver output
  contracts, generic justification rejection, invalid evidence reporting, valid
  suppression, and expiry after a new subject Revision.

## D-030 — Regenerate Obligation history from explicit repository snapshots

- **Status:** accepted and implemented
- **Decision:** A lifecycle snapshot may include named historical repository
  snapshots. The evaluator independently applies the same loaded Process Package
  to each one and returns its exact Obligation explanations under
  `obligationHistory`, separate from current `obligations` and `looseEnds`.
- **Alternatives:** Persist Obligation Instances as a new lifecycle type, retain
  hidden evaluator state between calls, infer an earlier repository from current
  records alone, or overwrite an old explanation with the current graph result.
- **Rationale:** Exact historical status can depend on evidence and selectors that
  changed as well as on the subject Revision. An explicit repository snapshot is
  the smallest truthful input that can reproduce the earlier conclusion. Keeping
  snapshot discovery outside the evaluator preserves its deterministic, read-only
  public seam and keeps generated explanations disposable.
- **Expected behavior:** Current evaluation may report changed work for a revised
  subject while a named historical snapshot still reports the earlier exact
  definition-version, subject-Revision, and process-reference instance with its
  original status, resolver, blockers, and evidence. Historical diagnostics stay
  scoped to their snapshot and do not become lifecycle records.
- **Reversibility:** Additive optional input and output fields. A durable repository
  adapter can later discover Git snapshots or generated-cache entries without
  changing Obligation identity or evaluator semantics.
- **Evidence/observations:** A public lifecycle test evaluates one PSP snapshot,
  then evaluates a later snapshot containing a review context and a second PSP
  Revision. The old exact context obligation remains `ready` in history, is
  `satisfied` in the current graph, and the new Revision receives its own `ready`
  instance without mutating the earlier explanation.

## D-031 — Select immutable package installs explicitly at the CLI seam

- **Status:** accepted and implemented
- **Decision:** `req process install` validates and atomically copies a local
  compatible Process Package into a content-checked `<id>@<version>` install slot
  without activating it. `req process use` separately records the exact package
  reference, expression-language version, install path, and SHA-256 digest.
  Package show, validation, and capability commands project one package-neutral
  semantic result into either JSON or human-readable output.
- **Alternatives:** Implicitly activate the bundled Example Process Package, select
  a mutable source directory, record only a package ID, duplicate inspection logic
  in every renderer, or embed V-model types and phases in the executable.
- **Rationale:** Package and language versions are reproducibility inputs, while a
  content digest prevents mutable reuse of one semantic version. Separating
  installation from selection makes activation deliberate. A shared projection
  keeps agent-facing JSON and human output semantically aligned and lets all
  compatible packages expose the same kernel and language capabilities.
- **Expected behavior:** Commands requiring a selected package fail explicitly
  when none exists. A conflicting install under the same exact version is refused.
  Validation reports compilation, reference, capability-binding, and source
  diagnostics. Capabilities enumerate context roots, paths, operators, host
  functions, primitive and capability-gated collections and relations, bound
  Kernel Capabilities, and exact definition catalogs without package-specific IDs
  in CLI implementation.
- **Reversibility:** The selection file and install directory are initial adapter
  formats. A registry or remote resolver can replace local copying while preserving
  exact package summary, validation, and capability projections.
- **Evidence/observations:** Public executable tests cover absent selection,
  install-versus-use separation, exact selection-file content, selected and
  explicit invalid validation, manifest/catalog inspection, and equivalent human
  and JSON capability output.

## D-032 — Evaluate addressed fields through their compiled definition contracts

- **Status:** accepted and implemented
- **Decision:** Definition-field evaluation addresses
  `<definition>@<version>#<field>` in the selected Process Package and evaluates
  the package-load compiled expression against an explicit snapshot. Each compiled
  field retains its authored expected type, available bindings, source path, and
  expression-local span. Exact Revision IDs supplied as JSON bindings resolve only
  against the named snapshot. The same internal lifecycle host serves generic
  Relation, Selector, Policy, Computed State, and Obligation CLI evaluation.
- **Alternatives:** Evaluate arbitrary raw expressions, reconstruct field bindings
  in the CLI, expose parser/AST/query helpers, maintain a second debugging
  evaluator, or explain only the final Boolean/value.
- **Rationale:** The compiled field is the authoritative package context and cannot
  drift from production typing. Reusing the lifecycle host proves that debugging
  sees the same collections, relations, selectors, policies, states, capability
  bindings, and immutable entities as ordinary evaluation. An ordered evidence
  projection exposes traversal without making internal AST or query interfaces
  public.
- **Expected behavior:** Missing or unknown authored bindings fail explicitly.
  Successful output includes exact package and expression-language versions, the
  field's expected result type and binding contract, projected supplied entities,
  the result, ordered traversed versioned definitions, intermediate evidence, and
  source spans. Direct generic evaluation remains package-neutral and requires an
  explicit snapshot.
- **Reversibility:** Evidence event shapes are an initial CLI projection. They can
  gain stable schemas or finer rule metadata without changing expression syntax,
  package definitions, or the evaluator's closed host boundary.
- **Evidence/observations:** Executable-level tests evaluate an Obligation field
  through a nested Selector and capability-gated Relation, reject a binding that
  does not belong to that field, compare human and JSON semantics, and directly
  evaluate one Relation, Selector, Policy, Computed State, and Obligation.

## D-033 — Project lifecycle status without collapsing independent conclusions

- **Status:** accepted and implemented
- **Decision:** `req phase status`, `req loose-ends`, and `req next` evaluate an
  explicit named snapshot through the selected package and the existing lifecycle
  evaluator. Their package-neutral projections retain satisfaction, authored
  status, exact subject, blockers, blocker chains, unresolved bindings, eventual
  resolver, actionable resolver, Dispatchability, Resolver Scenario output
  contract, and Waiver Policy result as independent values. Applicable waivers are
  shown separately from current Loose Ends. `next` selects only the first
  deterministically ordered item already marked Dispatchable.
- **Alternatives:** Derive CLI status independently, flatten conclusions into one
  display status, treat an eventual resolver as executable, return blocked work
  when no ready item exists, infer batches by lifecycle type, or hide applicable
  waiver evidence because it suppresses current work.
- **Rationale:** Lifecycle evaluation is the authority for process meaning; the
  CLI should project rather than reinterpret it. Exact blocker and resolver output
  evidence makes gate and next-work decisions auditable. Separating
  waiver-suppressed Obligations preserves the invariant that they are not current
  Loose Ends while keeping the exact policy evidence visible.
- **Expected behavior:** Phase status reports entry, candidate selection,
  Obligation counts and exact status groups, gate evaluations enriched with their
  exact Obligation explanations, and aggregate blocker evidence. Loose Ends retain
  every evaluator dimension in JSON and label each dimension in human output.
  `next` returns a Dispatchable Loose End or `null`; it never falls back to a
  blocked item. An eventual coherent batch awaits an explicit package batching
  contract and is not inferred by the kernel or executable.
- **Reversibility:** Filtering options and a future versioned batch projection can
  be added without changing lifecycle truth, ordering, or the single-item result.
- **Evidence/observations:** Executable tests cover ready and blocked Loose Ends, a
  reviewed complete exact gate, an exact reviewed waiver, no-work next selection,
  and equivalent human and structured preservation of independent dimensions.
## D-034 — Scaffold Process Packages without implicit example inheritance

- **Status:** accepted and implemented
- **Decision:** `req process init <path>` creates an independently versioned
  Process Package whose identity is the destination basename. Without `--from`,
  the package contains only the supported meta-schema, kernel Datum Envelope,
  primitive catalog, empty authored catalogs, and explicit creation provenance.
  With `--from <package-ref>`, the CLI validates and copies the source, resets the
  copy to version `0.1.0`, and records the exact source package reference and
  content digest. Creation never installs or selects the result. Definition
  scaffolding supports every accepted authored definition kind and updates its
  manifest catalog. Fixture scaffolding records an explicit snapshot and complete
  expected lifecycle evaluation; package tests compare results structurally
  through the public evaluator behavior.
- **Alternatives:** Make the bundled V-model the implicit starting package, retain
  its identity in derived copies, automatically select new packages, emit only
  directory placeholders, hand authors unversioned snippets, or test fixtures
  through a second evaluator.
- **Rationale:** A package author must be able to start without V-model vocabulary,
  while derivation must remain an explicit, auditable copy rather than hidden
  inheritance. New identity and version prevent a modified example from claiming
  the source package's immutable reference. Generated fixtures remain useful only
  if they name the package and snapshot contract and are executable through the
  same evaluator as production behavior.
- **Expected behavior:** Empty and derived scaffolds validate immediately. A
  destination collision is refused rather than merged. Derived provenance names
  the exact source digest. Definition files use version `1`, live in their
  canonical package directories, and appear in manifest catalogs. Fixture tests
  report deterministic pass/fail results and a stable diagnostic when an expected
  evaluation differs. No scaffold operation activates a Process Package.
- **Reversibility:** The initial file layout, placeholder definition content, and
  JSON expected-result envelope may evolve behind the commands. New package
  identity, explicit source provenance, non-activation, supported contract
  versions, and evaluator-equivalent fixture semantics remain the stable boundary.
- **Evidence/observations:** Executable tests create and validate a process-neutral
  empty package, derive and validate a renamed bootstrap copy, scaffold all ten
  accepted authored definition kinds, generate and pass an evaluation fixture,
  and detect a deliberately changed expected result.
