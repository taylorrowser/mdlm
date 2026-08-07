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

## D-035 — Keep Markdown authoritative across the first durable repository slice

- **Status:** accepted and implemented
- **Decision:** `req init --process` validates an explicit Process Package and
  atomically installs, selects, and records its exact digest together with the
  supported repository, Datum Envelope, Markdown artifact, expression-language,
  and primitive-catalog contracts. `req new` requires an exact declared Scenario
  for creation provenance, generates a random Crockford Base32 Stable ID and exact
  `r00001` Revision ID, validates the flattened package payload and source-owned
  outgoing-link contracts, then atomically renames one staged Stable Datum
  directory into `.lifecycle/data`. `req show` and `req list` scan Markdown source
  and add computed states, Obligation Instances, backlinks, and Kernel Capability
  bindings. `req doctor` rebuilds a deterministic generated index from the same
  source; reads never depend on that index.
- **Alternatives:** Store JSON as lifecycle truth, make an index or database
  authoritative, infer the bundled example package at initialization, let callers
  supply identities, accept untyped payload blobs, record a fake kernel Scenario,
  write the Datum and index as co-equal transaction participants, or compute
  projections independently in the CLI.
- **Rationale:** Markdown durability and package-defined structure are accepted
  kernel invariants. A declared Scenario supplies real prompt and Policy
  provenance without adding a package-specific creation concept to core. Staging
  the complete Stable Datum directory keeps failed validation and interrupted
  writes from exposing partial truth. Scanning is deliberately sufficient for the
  current repository scale and proves that indexes are disposable before any
  production indexing design is selected.
- **Expected behavior:** Initialization refuses invalid packages and existing
  repositories without leaving a staging directory. Creation rejects unknown
  types or Scenarios, invalid payload paths and values, kernel-managed paths,
  unknown links and targets, incompatible stable-versus-Revision targets, and
  cardinality violations before writing. Stable and Revision identities both
  resolve through `show`. Human and JSON views retain durable envelope content and
  independent computed dimensions. Removing `.lifecycle/generated/indexes`
  changes no `show` or `list` result, and `doctor` recreates the index atomically.
- **Reversibility:** Markdown frontmatter ordering, generated-index shape, scan
  strategy, and compact human rendering may evolve. The repository contract can
  gain versions before revision mutation and freezing. Explicit package selection,
  kernel-generated identity, atomic source writes, package validation, and
  generated-index disposability remain stable boundaries.
- **Evidence/observations:** Executable tests initialize a repository, inspect its
  exact contracts, reject invalid initialization and invalid payload/link creation
  without durable records, round-trip one authored Markdown Lifecycle Datum by
  Stable and Revision ID, compare structured and human projections, delete the
  generated indexes without affecting reads, and rebuild them through `req doctor`.

## D-036 — Publish one editable Revision without rewriting frozen lineage

- **Status:** accepted and implemented
- **Decision:** `req revise <stable-id> [--from <revision-id>]` scans authoritative
  Markdown lineage, refuses while any local Revision of that Stable Datum remains
  editable, copies an explicitly selected or most recent frozen source into the
  next exact sequential Revision, and preserves the Stable Datum ID. A staged
  Markdown file is published with an exclusive same-filesystem hard link so a
  competing process cannot replace an exact Revision that won the collision.
  Frozen storage facts and `req history` classification are derived from snapshot-
  bearing baselines through the selected `exact-baseline@1` Kernel Capability
  binding; no baseline lifecycle type ID is built into the repository kernel.
- **Alternatives:** Treat `revise` as an edit of the prior file, silently freeze an
  unbaselined draft, renumber a colliding draft, trust generated indexes for the
  concurrency check, store editable/frozen flags in the Datum Envelope, hard-code
  the bundled `BSL` type, or add a durable claim datum before the initial local
  concurrency profile requires one.
- **Rationale:** Exact frozen Revisions are immutable historical truth. The v1
  single-draft rule provides a useful local concurrency guard without adding a
  process-specific claim concept, while exclusive publication closes the race
  between scanning and writing. Capability-derived membership keeps baseline
  structure versioned and package-neutral. Generated indexes cannot participate
  in correctness because they remain disposable and may be stale after a source
  mutation.
- **Expected behavior:** A newly created first Revision is the one allowed editable
  draft and blocks `revise` until frozen or abandoned. Once frozen by an exact
  baseline snapshot, it can seed `r00002`; the new Revision retains its Stable ID,
  content, links, and Scenario provenance while recording the currently selected
  exact package reference. A second `revise` names the competing editable Revision
  and leaves every prior Markdown byte and generated index byte unchanged. History
  orders Revision identities and labels frozen history separately from editable
  work with exact freezing-baseline evidence.
- **Reversibility:** A later concurrency profile may replace sequential draft
  allocation with random temporary identities, and history rendering can grow
  more projections. It must still preserve frozen exact identities, refuse rather
  than overwrite collisions, identify editable competition, and derive
  immutability through kernel capabilities rather than package vocabulary.
- **Evidence/observations:** Executable tests start with the allowed editable first
  Revision, observe its actionable competing-draft diagnostic, add an exact
  capability-bound frozen baseline, create the next Revision from the frozen
  source, distinguish both entries in human and JSON history, then prove a second
  failed attempt leaves prior Revision and generated-index bytes unchanged.

## D-037 — Store each graph edge only on its exact source Revision

- **Status:** accepted and implemented
- **Decision:** `req link <source-revision> <target> --type <relationship>` and
  `req unlink` rewrite one editable exact source Revision through an atomic staged
  replacement. Before publication, the kernel resolves the source lifecycle type
  from the selected Process Package and validates the complete resulting outbound
  link set for declared relationship, target kind, target lifecycle type,
  Stable-versus-exact identity, and cardinality. Frozen sources are immutable.
  Backlinks and bounded graph traces are regenerated from outbound Markdown;
  neither inverse links nor graph indexes are durable truth. Trace nodes retain
  separate `stable-datum`, `revision`, and `obligation-instance` identity kinds,
  while a Stable Datum root can discover edges stored on its exact Revisions.
- **Alternatives:** Persist inverse links, mutate links through a package-specific
  relationship registry, accept a Stable source alias and silently choose a
  Revision, validate only the new edge rather than the resulting cardinality,
  update generated indexes transactionally, collapse Stable and Revision nodes in
  trace output, or allow frozen evidence to receive new links.
- **Rationale:** Source ownership makes the resolved lifecycle type the complete
  local authority for outbound edges. One durable direction prevents divergent
  inverse facts. Requiring an exact source makes mutation intent reproducible;
  preserving the authored target identity prevents a working Stable relation from
  being misreported as exact historical evidence. Disposable projections cannot
  participate in mutation correctness.
- **Expected behavior:** Valid link and unlink operations publish one complete
  validated Markdown replacement and leave indexes untouched. Unknown source
  contracts, malformed or absent targets, wrong target kinds/types/identity
  classes, duplicate or out-of-range cardinality, and minimum-cardinality removal
  fail without changing any source byte. A frozen source fails before staging.
  `req backlinks` reports source-owned inverse labels from one outbound edge, and
  `req trace --relation --depth` deterministically walks inbound and outbound
  adjacency while showing exact source Revisions and authored Stable or exact
  targets separately.
- **Reversibility:** A later repository transaction/locking profile can strengthen
  parallel mutation coordination, and graph traces can add capability-resolved
  freeze edges or richer traversal policies. They must retain source-owned
  validation, exact-source mutation, frozen immutability, one durable outbound
  edge, explicit identity kinds, and rebuildable projections.
- **Evidence/observations:** Executable tests create an optional source-owned edge,
  prove the target stores no inverse edge, inspect matching human and JSON
  backlinks, trace from both target and source Stable identities, remove the edge,
  and verify empty computed backlinks. A rejection matrix covers unknown source
  relationships, malformed and missing identities, wrong Stable-versus-exact
  identity, wrong datum type, wrong target kind, maximum and minimum cardinality,
  and a frozen source; every failure preserves all Markdown and index bytes.

## D-038 — Freeze exact snapshots through the selected capability binding

- **Status:** accepted and implemented
- **Decision:** Baseline repository commands exist only when the selected Process
  Package binds `exact-baseline@1`. They discover the bound lifecycle type from
  that binding. Creation initializes only the capability's kernel-managed
  membership/evidence fields; authored fields and Scenario provenance still come
  from the package. Definition membership, supporting evidence, and exact
  `composes` links are mutated independently on one editable exact baseline
  Revision. Freeze validates all exact references and frozen composition, rejects
  cycles and self-reference, resolves authored links, hashes referenced files by
  exact bytes, captures exact process/manifest/schema/asset provenance, and
  publishes only a complete kernel-managed snapshot. Verification treats stored
  Stable-link resolutions as historical exact claims: it checks that each remains
  a Revision of the authored Stable Datum rather than incorrectly resolving the
  Stable Datum again against current work.
- **Alternatives:** Recognize the bundled baseline type ID, persist hashes beside
  member files, merge evidence into definition membership, represent composition
  as membership, resolve Stable targets again during verification, hash parsed
  semantic content rather than exact bytes, trust generated indexes, populate
  package-authored role/currentness fields during freeze, or expose commands when
  no package selects the capability.
- **Rationale:** The capability is a fixed integrity service, not lifecycle
  vocabulary. Exact-file hashes make byte changes observable; exact resolved
  targets preserve what a historical claim meant even after a later Revision is
  authored. A single durable snapshot keeps integrity claims on the exact
  baseline making them. Keeping authored payload and process conclusions outside
  freeze preserves the kernel/package boundary. Source-backed validation and a
  staged replacement keep disposable indexes out of transaction correctness.
- **Expected behavior:** A differently named bound type can be created, populated
  with exact definition and evidence references, composed from frozen exact bound
  baselines, frozen, and verified. Freeze records deterministic sorted hashes,
  resolutions, and provenance while leaving authored fields untouched. The
  snapshot-bearing baseline and included member/evidence Revisions reject
  mutation. Verification reports changed bytes, missing exact references,
  malformed resolutions, invalid or cyclic composition, and process-provenance
  mismatch. Newer Revisions of a freeze-time Stable target do not invalidate the
  historical snapshot. Without the binding every baseline command fails with one
  capability-unavailable diagnostic.
- **Reversibility:** The snapshot schema can gain typed per-link resolution entries,
  signatures, content-addressed objects, stronger repository locking, and richer
  provenance records in a later capability version. Such changes must preserve
  exact-byte verifiability, historical resolution semantics, atomic publication,
  section separation, capability-selected type identity, and package-owned
  lifecycle conclusions.
- **Evidence/observations:** Executable tests initialize a repository from a
  package whose bound type is renamed to `SNP`; create ordinary definition and
  evidence Revisions; freeze a component; populate and compose a parent; inspect
  exact hashes, resolution targets, and process provenance; verify through JSON
  and human output; create a newer Revision of a Stable link target and verify the
  historical snapshot again; and prove frozen mutation refusal. Rejection tests
  preserve source bytes after invalid composition/freeze, then independently
  detect changed member bytes, a deleted exact member, and externally corrupted
  composition. An independently scaffolded package with no binding proves the
  commands are unavailable.

## D-039 — Compare frozen baselines through typed evaluator inputs and rebuild disposable projections

- **Status:** accepted and implemented
- **Decision:** `req baseline diff <old> <new>` resolves both operands through the
  selected `exact-baseline@1` binding, compares the baseline Revisions, and pairs
  included definition/evidence Revisions by Stable Datum identity. Freeze-time
  link resolutions from each baseline snapshot become explicit comparison inputs
  to the existing dependency-change service. The resulting package-neutral view
  contains deterministic `dependency-change@1` records grouped under each exact
  changed subject with that subject's package-derived Computed States and
  explanations. Baseline snapshot mechanics are excluded from authored content
  changes. Exact process-reference, manifest-hash, and asset-set differences emit
  a `process-provenance-change` record and are also projected as informational
  Process Drift; the bootstrap reassessment selector intentionally excludes that
  kind, while `dependency-reassessment@1` leaves the final reassessment decision
  to Package Policy and another package may select it. `req doctor` validates selected
  repository contracts and every frozen capability-bound baseline before it
  atomically rebuilds both an index and lifecycle report under
  `.lifecycle/generated`.
- **Alternatives:** Implement a second baseline-specific diff algorithm, compare
  only member lists, flatten composition silently, treat snapshot timestamps and
  hash maps as authored content, return a kernel-owned Stale Boolean, make every
  process difference stale, recognize `BSL`, trust generated indexes for pairing,
  preserve generated reports as durable truth, or rebuild projections before
  checking frozen integrity.
- **Rationale:** Dependency comparison already supplies the conservative typed
  structural seam and Package expressions already own reassessment. Reusing both
  keeps baseline diffing from becoming a competing evaluator. Stable-identity
  pairing preserves exact before/after Revision evidence while still exposing
  membership replacement separately. Process Drift must remain visible without
  silently changing validity. Validating all durable Markdown and frozen claims
  before generated writes lets `doctor` diagnose integrity without allowing stale
  indexes or reports to participate in correctness.
- **Expected behavior:** Differently named bound baseline types produce content,
  outbound-link, Stable-link-resolution, membership, composition, and evidence
  records in deterministic order. Every record names exact before/after and subject
  Revisions. Subject projections explain package-derived reassessment with those
  records. Process Drift remains informational under the bootstrap package and can
  become Stale only when a modified package rule selects its typed record. Changed
  frozen bytes or repository contract mismatches make `doctor` fail before
  changing generated bytes. Deleting all generated indexes and reports changes no
  `show`, diff, or evaluator result; `doctor` recreates both from Markdown truth.
- **Reversibility:** A later capability contract may add flattened composition,
  richer role-aware matching, signatures, or explicitly selected comparison
  scopes. Generated report shapes and cache partitioning may change freely. The
  stable boundaries are exact typed change evidence, package-owned lifecycle
  conclusions, informational-by-default Process Drift, source-first validation,
  and fully disposable projections.
- **Evidence/observations:** Executable tests use a package whose bound type is
  renamed to `SNP`; freeze old and new member/evidence/component sets; author one
  content change and one outbound edge; advance a Stable link resolution; and
  assert all six structural classifications, Process Drift, deterministic JSON,
  human output, and exact package explanations. A focused package variant opts
  process provenance into reassessment. Repository health reports Process Drift
  without treating it as failed integrity. Repository tests delete generated
  output, reproduce identical durable `show` results, rebuild index and report, detect a
  changed frozen byte without modifying either projection, and reject a repository
  descriptor compatibility mismatch.

## D-040 — Dry-run from an exact Dispatchable Obligation Instance

- **Status:** accepted and implemented
- **Decision:** `req scenario dry-run <scenario@version> --obligation
<exact-instance> --snapshot <fixture>` treats the evaluated Obligation Instance
  as the authority for dispatch. The command reuses compiled package expressions
  to resolve each direct or selector-dispatched Resolver binding against the named
  snapshot, applies runtime input contract and package-authored condition checks,
  resolves exact prompt and ordered skill bytes from the selected package, and
  projects the Scenario's review Policy, the Obligation's waiver Policy, prohibited
  inputs, expected outputs, generic output checks, and completion expression. It
  never invokes an adapter and performs no write.
- **Alternatives:** Dry-run an arbitrary Scenario from its resolver name alone,
  trust caller-supplied inputs over Obligation bindings, duplicate expression
  interpretation in the CLI, defer missing or prohibited input checks until an
  adapter runs, read mutable prompts outside the selected package, infer execution
  from an eventual resolver, or persist dry-run records as Lifecycle Data.
- **Rationale:** Dispatchability is an exact package-derived authorization attached
  to one Obligation Instance, while a Scenario definition is only an eventual
  contract. Re-evaluating the compiled binding fields preserves the same closed
  expression host and explicit snapshot semantics used by lifecycle evaluation.
  Resolving content-addressed package assets before the future adapter boundary
  makes an orchestrator's proposed invocation inspectable without granting the
  declarative package executable privileges.
- **Expected behavior:** A ready, unblocked instance with resolved bindings and a
  matching actionable Scenario produces deterministic human and JSON dry-run
  output containing exact package digest, Obligation and Scenario versions, exact
  bound identities, all input checks, prompt and skill versions and hashes, review
  and waiver Policy versions, prohibited inputs, expected output contracts, and
  pending completion checks. Unknown, blocked, unresolved, mismatched,
  prohibited, ill-typed, wrong-cardinality, wrong-identity, or condition-failing
  inputs produce typed diagnostics before any adapter boundary. Repeating a
  dry-run leaves every repository byte unchanged.
- **Reversibility:** A later execution adapter can consume this projection, add
  environment and adapter provenance, validate concrete outputs, evaluate
  completion, and atomically publish an execution record. Those additions must not
  weaken exact Obligation authorization, package-resolved bindings, pre-adapter
  validation, or side-effect-free dry-run behavior.
- **Evidence/observations:** Executable tests invoke only the public `req` seam.
  They dry-run a bootstrap review-context resolver, inspect exact bindings,
  contracts, content hashes, versions, and human output, compare repository tree
  hashes before and after, reject a blocked instance with a missing binding,
  reject a mismatched resolver and prohibited caller input, and use a modified
  declarative input condition to prove invalid data fails without mutation.

## D-041 — Execute the validated dry-run as one optimistic repository transaction

- **Status:** accepted and implemented
- **Decision:** `req scenario execute <scenario@version> --obligation
  <exact-instance> --adapter <executable>` derives its snapshot from current
  Markdown truth and must first reproduce the successful D-040 dry-run. Only then
  does it directly invoke an operator-configured `mdlm-agent-adapter@1` executable,
  without a shell, using the exact validated input data, prompt and ordered skills,
  Policies, prohibited-input boundary, output contracts, and completion expression.
  The kernel assigns new identities and next Revision numbers, validates every
  returned output together, evaluates package completion with
  `execution.integrity.contract_valid`, reevaluates Lifecycle Data, and publishes
  all outputs plus one `mdlm-scenario-execution@1` record with one atomic rename
  of a complete transaction directory beneath `.lifecycle/data`.
- **Alternatives:** Let a Process Package name or ship adapter code; invoke an
  arbitrary shell command; trust adapter-authored envelope identity, provenance,
  kernel-managed payload, or completion claims; create outputs one at a time;
  retain a partial execution record after failure; infer the next workflow step
  from the Scenario; or hide execution provenance only in generated reports.
- **Rationale:** An adapter is an imperative infrastructure boundary, not a new
  package host function. Reusing the dry-run projection keeps exact Obligation
  authorization and pre-boundary checks singular. Validating the complete proposed
  graph before staging prevents one valid output from escaping beside an invalid
  sibling. Rechecking all source Markdown immediately before publication provides
  an optimistic concurrency boundary, while package reevaluation—not wrapper
  branching—remains the authority for resulting work.
- **Expected behavior:** The adapter receives exact Lifecycle Datum input bytes and
  the declared prohibited-input boundary only after Dispatchability, resolver,
  resolution, cardinality, identity, type, condition, and caller assertions pass.
  Undeclared, missing, wrong-cardinality, wrong-type, schema-invalid, lineage-
  invalid, kernel-managed, source-link-invalid, or required-link-missing outputs,
  and false completion expressions, leave all Lifecycle Data and execution records
  unchanged. Success records exact package, Scenario, Obligation, input, prompt,
  skill, Policy, adapter, request, response, output, completion, and reevaluation
  evidence. Output `created_by` provenance uses those exact package assets.
- **Reversibility:** A later adapter registry may replace the explicit executable
  option, and stronger isolation may use a container or remote protocol. The first
  profile intentionally does not claim source-isolation enforcement. A later
  filesystem transaction primitive may project committed files back into direct
  type roots without changing their envelope identities or execution record. Those
  changes must preserve the versioned request contract, package-code prohibition, exact
  dry-run equivalence, complete post-adapter validation, optimistic source check,
  atomic publication, and evaluator-derived follow-on work.
- **Evidence/observations:** Public executable tests initialize a real repository,
  create and freeze an exact empirical QST, execute the bootstrap
  `resolve-question@1` Scenario through a capturing Node adapter, and assert the
  request, new DEC, next QST Revision, required exact `resolves` edge, durable
  `created_by` fields, execution record, completion evidence, and resulting
  Obligation reevaluation. A rejection matrix supplies undeclared, missing,
  schema-invalid, and incorrectly linked outputs and compares repository hashes;
  a prohibited caller input proves the adapter is never invoked.

## D-042 — Resolve declarative aliases into the canonical Scenario operation

- **Status:** accepted and implemented
- **Decision:** A selected Process Package may declare a dotted Package Command
  Alias whose arguments are cardinality-typed strings and whose input mappings are
  compiled `mdlm-expression@1` expressions over one closed `args` object. This
  first executable slice targets one exact declared Scenario version. Alias
  expressions may bind declared arguments and literals but may not invoke
  evaluator host functions. Runtime resolution turns those values into the same
  requested-input assertions supplied to `req scenario execute`; the canonical
  Scenario operation remains solely responsible for exact Obligation
  Dispatchability, adapter selection, prohibited inputs, output contracts,
  completion, reevaluation, provenance, and atomic publication.
- **Alternatives:** Implement package aliases as shell snippets, executable files,
  JavaScript callbacks, package-defined expression host functions, bespoke CLI
  handlers, or second-class Scenario wrappers; let aliases own adapters or
  obligation selection; accept untyped arbitrary options; permit aliases to
  shadow generic commands; duplicate dry-run, output validation, or mutation; or
  persist a different execution contract for convenience commands.
- **Rationale:** A convenience command is safe only if it disappears before the
  authorization and mutation boundary. Compiling mappings during package loading
  catches unknown Scenario/input references, argument paths, command conflicts,
  and result-shape errors before package selection. Keeping operator controls out
  of alias arguments prevents declarative content from selecting executable code
  or weakening exact dispatch authorization. Reusing the canonical operation
  means future validation hardening automatically applies to direct and aliased
  invocation.
- **Expected behavior:** `question.resolve@1` is discoverable in the bootstrap
  catalog and maps `--question <revision>` to the `question` assertion of
  `resolve-question@1`. Direct and aliased commands send byte-equivalent semantic
  adapter requests for the same repository state. A blocked exact Obligation,
  unknown or prohibited argument, missing/duplicate typed argument, invalid
  output, or failed completion reaches no unauthorized adapter or publication.
  Meta-schema fields for executables, unknown host calls, command collisions,
  reserved kernel arguments, unknown Scenario/input references, and invalid
  expression paths fail package validation.
- **Reversibility:** A later schema version may add an explicit allowlisted generic
  operation target, richer scalar argument types, or a dry-run alias mode. Those
  additions must still compile to one kernel-owned canonical operation and may
  not add package code, package-defined host functions, adapters, implicit
  Obligation selection, or alternate contract/mutation paths. The durable
  Scenario record intentionally needs no alias-specific execution semantics.
- **Evidence/observations:** Public executable tests clone one initialized
  repository, run direct and `question resolve` invocation independently, and
  compare the complete captured adapter requests. Additional tests reject an
  aliased invalid output without changing Lifecycle Data, reject undeclared input
  and blocked-Obligation attempts before adapter invocation, and validate focused
  invalid packages for unresolved Scenarios and inputs, unknown argument paths,
  shell/host syntax, executable fields, reserved options, and core-command
  collisions.

## D-043 — Exercise Phase 0 from authoritative repository truth

- **Status:** accepted and implemented
- **Decision:** The Example Process Package adds MAP and ART as ordinary
  package-owned lifecycle types plus declarative wayfinding-map and exploratory-
  prototype Scenario assets. MAP, PSP, and STK are the substantive subjects in
  the narrow intent slice. One coherent frozen Review Context may contain those
  exact Revisions, but each subject receives one independent REV. Generic Phase,
  Loose End, and next-work commands may evaluate authoritative repository
  Markdown when the caller names an explicit package Phase; explicit fixture
  snapshots remain supported. Candidate creation and freezing use the selected
  `exact-baseline@1` capability, while REV and Gate Sign-off creation use the
  canonical Resolver Scenario boundary. The repository derives terminal-outcome
  immutability from each resolved type's package lifecycle declaration rather
  than from a Review type ID.
- **Alternatives:** Add Wayfinding Map, prototype, intent, or gate commands and
  nouns to the kernel CLI; encode Phase 0 as an imperative runner; persist task
  state instead of reevaluating Obligations; use one aggregate review for several
  subjects; let an existing Gate Sign-off count before review; derive lifecycle
  truth from generated reports; or require a hand-authored fixture even when a
  valid durable repository already exists.
- **Rationale:** A real repository tracer is the smallest evidence that the
  package/core boundary survives mutation, capability, evaluation, and execution
  together. Explicit `--phase` selects package data rather than inferring a hidden
  workflow. Reading the same Markdown records used by Scenario execution keeps
  generated projections disposable. Separate REV outputs preserve exact judgment
  even when coherent subjects share context. Routing the gate DEC back through
  ordinary context and review Obligations prevents duplicate authorization while
  preserving the package-authored applicability rule.
- **Expected behavior:** Repository-backed Loose Ends put Dispatchable Review
  Context work for MAP, PSP, and STK before their blocked Review work. After one
  exact shared context freezes, `review-datum-in-context@1` produces one REV per
  subject. An exact intent candidate containing reviewed substantive members may
  be frozen and reviewed. `record-gate-signoff@1` may then produce one DEC; the
  candidate gate becomes blocked and the same Obligation Instance cannot dispatch
  another sign-off while that DEC awaits contextual review. After the DEC review
  passes, the exact candidate gate is satisfied. Omitted `zero-or-more` Scenario
  outputs bind as an empty collection during completion evaluation rather than as
  a missing expression binding. Each terminal REV is immediately non-editable,
  and prototype ART accepts only an exact Git commit reference.
- **Reversibility:** A future repository projection module may replace the private
  CLI assembly and add explicit dependency-comparison inputs or multi-Phase
  inspection. A larger Example Process Package may revise MAP/ART schemas,
  distinguish group contexts, or add VSP and promotion. Those changes must retain
  exact package and Phase selection, Markdown authority, independent REV identity,
  candidate-specific authorization, and process-neutral generic source.
- **Evidence/observations:** Public executable coverage initializes a real
  repository, authors linked QST, DEC, ART, PSP, STK, and MAP data, inspects the
  initial ready-before-blocked order, freezes three exact Review Contexts and one
  intent candidate through the capability surface, executes five independent
  reviews and one Gate Sign-off through capturing adapters, rejects a duplicate
  sign-off before adapter invocation, verifies the final gate evidence, confirms
  exact review targets, terminal Review immutability, frozen contexts, exact ART
  provenance, and finishes with `req doctor`.

## D-044 — Scope qualification and pilot evidence through package contracts

- **Status:** accepted and implemented
- **Decision:** The Example Process Package adds VSP, ENV, VER, VAI, RUN, and RES
  as ordinary package-owned lifecycle types and adds one declarative Phase 1
  product-assurance slice. VSP embeds named environment-capability profiles. ENV
  realizes one exact VSP Revision and explicitly links one passing qualification
  RES before contextual review. Qualification and pilot implementations derive
  `verification-run-required@1` Obligation Instances from source-owned exact
  links. The canonical Scenario execution boundary atomically generates one RUN
  and one RES. Nested package schemas distinguish qualification
  `environment-capability`, pilot `verification-design`, and formal `requirement`
  claims. Types whose package lifecycle declares `authorship: generated` cannot
  be created or revised through generic direct authoring; only validated Scenario
  publication may introduce them.
- **Alternatives:** Add verification nouns or specialized qualification commands
  to the kernel; store ENV qualification as a mutable Boolean; treat a successful
  pilot as requirement acceptance; permit direct RUN/RES creation with a Scenario
  provenance label; rely only on prompt prose for claim scope; use product source
  or unit tests to author the pilot; require enforced isolation containers in the
  first slice; or publish RUN and RES in separate mutations.
- **Rationale:** Exact links and scoped immutable evidence are the narrowest proof
  that the verification model can remain package data while reusing generic
  repository, review, Obligation, and Scenario services. A qualification result
  establishes only that the ENV supplies declared capabilities. Requiring passing
  contextual Reviews for ENV, pilot VER, and pilot VAI before execution preserves
  the package's assurance boundary. Schema-valid formal RES data is still
  rejected by the pilot Scenario completion expression, so output schema and
  process claim authorization remain distinct. Generic generated-authorship
  enforcement prevents bypassing the atomic adapter and provenance boundary
  without recognizing RUN or RES type IDs.
- **Expected behavior:** One qualification VAI is immediately Dispatchable and
  produces terminal immutable RUN/RES evidence scoped to environment capability.
  Linking its passing RES to the ENV enables ENV review but supplies no product
  requirement verification. A pilot VAI remains blocked until qualification and
  the required ENV, VER, and VAI Reviews pass. Product source, unit tests, private
  implementation details, and uncontrolled shortcuts are rejected before adapter
  invocation. The exact pilot target declares supported and intentionally
  unsupported behavior. Its successful RES records both expected success and
  expected discrimination, remains scoped to verification-design suitability,
  is immediately immutable, and cannot be replaced by a formal claim through the
  same pilot execution.
- **Reversibility:** Later package versions may add a Scenario-produced ENV
  revision that attaches qualification evidence, richer result assessment,
  formal execution, isolated authoring worktrees, or distinct verification
  campaigns. They may revise package schemas and Obligations without changing the
  generated-authorship rule or adding V-model type IDs to generic source. Formal
  evidence still requires a new authorized formal run against a permitted exact
  target.
- **Evidence/observations:** Public executable coverage initializes a real
  repository; authors one PSP/STK, VSP profile, ENV, qualification VER/VAI, exact
  pilot target, pilot VER, and source-blind VAI through generic creation and
  links; executes qualification and pilot RUN/RES pairs through capturing
  adapters; freezes and independently reviews ENV, VER, and VAI contexts; proves
  blocked-to-ready Obligation routing; rejects direct generated creation and
  revision, rejects prohibited source input before adapter invocation; rejects a schema-valid formal claim without partial
  publication; confirms positive and negative-control observations, exact RUN
  bindings, terminal immutability, no qualification requirement link, and
  successful repository health validation.


## D-045 — Derive one bounded system decomposition entirely from package data

- **Status:** accepted and implemented
- **Decision:** The Example Process Package adds ASP, ICSP, and DWP as ordinary
  package-owned lifecycle types and expands Phase 2 with one bounded system
  decomposition tracer. A DWP planning Revision records exact parent,
  architecture-element, interface, verification, exclusion, dependency, and
  review-policy context. Package Selectors and Obligations derive reviewed-plan
  execution, exact open-question blockers, output Reviews, separate requirement
  and architecture/interface simplification Reviews, completion, and parent
  coverage. The completion Scenario publishes the next Revision in the same DWP
  lineage. A reviewed group candidate contains the exact DWP completion, SYS,
  ASP, and ICSP Revisions; the reviewed level candidate composes that group and
  retains VSP, ASP, and ICSP as shared definition context before exact reviewed
  gate authorization. Generic type-prefix syntax accepts three through eight
  uppercase characters, and Scenario required-link checks normalize an input
  Revision to Stable identity only when the resolved source-owned link contract
  requires Stable identity.
- **Alternatives:** Add DWP commands, architecture-element lookup, parent coverage,
  simplification, or SYS gate behavior to the kernel; abbreviate ICSP to fit the
  earlier three-character prototype syntax; store mutable progress flags instead
  of deriving Obligation Instances; collapse both simplification passes into an
  ordinary candidate Review; complete the DWP before exact output Reviews; infer
  candidate composition from a phase name; or require a hidden workflow to move
  from plan through gate.
- **Rationale:** Exact package data and existing generic repository, graph,
  baseline, Review, Obligation, and Scenario services are sufficient to express
  the bounded slice. Widening the generic type-prefix grammar preserves the
  accepted ICSP vocabulary without teaching the kernel that vocabulary. Required
  links must follow the source type's declared identity contract: a Scenario may
  consume an exact parent Revision while authoring a Stable `derived-from` edge.
  Resolving that identity generically avoids both an impossible output contract
  and package-specific special cases.
- **Expected behavior:** An open QST produces an exact blocker chain and prevents
  DWP execution. After exact resolution and planning Review, execution produces
  one linked SYS Revision. Output Review and two dedicated simplification
  Obligation Instances block completion until their exact evidence exists. The
  completion Revision accounts for every parent and is independently reviewed.
  Frozen group and level candidates verify recursively, preserve distinct
  definition members and evidence, and the exact level candidate reaches gate
  completion only after its own Review and a reviewed Gate Sign-off.
- **Reversibility:** Later package versions may add multiple groups, richer
  coverage records, overlap detection, collateral-finding triage, candidate
  reservation, cross-group review, formal SYS verification, or component/design
  DWP types without changing the generic evaluator. The type-prefix upper bound
  may be revised through a future kernel contract version if real packages need a
  broader identifier grammar.
- **Evidence/observations:** Public executable coverage initializes a real
  repository; authorizes exact intent; creates VSP, ASP, ICSP, and a DWP plan;
  freezes and reviews planning context; proves exact QST blocking and resolution;
  executes the Dispatchable DWP through an adapter; derives and resolves output
  Review and both simplification Obligations; atomically publishes DWP r00002;
  freezes and reviews its completion; verifies exact group and composed level
  candidates with shared context; and records a reviewed exact SYS Gate Sign-off.
  The same test proves four-character ICSP identities through the public CLI and
  validates Stable required-link normalization without a V-model noun in generic
  source.


## D-046 — Close one exact pilot-discovered change without invalidating unrelated evidence

- **Status:** accepted and implemented
- **Decision:** The Example Process Package adds PRB and CHG as ordinary package-owned lifecycle types plus a declarative Phase 7 change-control tracer. An unsuitable pilot RES derives a Problem Report Obligation; the exact PRB source derives a bounded CHG impact over requirement, Review Context, Review, baseline, and verification-evidence Revisions. A passing CHG Review permits an exact `change-approval` DEC. The affected SYS Stable Datum is revised first, and replacement BSL, REV, and generated RES evidence explicitly links to the exact CHG. An atomic closure Scenario publishes an exact `change-closure` DEC and the next closed PRB Revision. Exact historical REV and RES data may declare a Stable claim dependency in addition to their immutable exact subject; baseline diff emits structural resolution changes only where that dependency moved, and package Policy decides Staleness.
- **Alternatives:** Encode PRB/CHG commands or change states in the kernel; mutate a ticket status outside Lifecycle Data; infer impact from all backlinks; mark every historical artifact Stale; treat an exact Review target as a moving Stable dependency; approve or close by mutable alias; let a prompt sequence edits without Obligation authorization; create replacement RUN/RES directly; or close CHG and PRB in separate publications.
- **Rationale:** The accepted change flow requires both immutable authorization history and selective current reuse. Exact links preserve what was observed, reviewed, approved, changed, and accepted. A separate Stable dependency says whether exact evidence may be reused against the current claim without weakening its exact historical target. Existing structural comparisons and package Policy can therefore express conservative Staleness without a change-specific kernel fact. Atomic closure prevents a durable PRB from claiming closure without its exact Decision or vice versa.
- **Expected behavior:** One unsuitable source-independent pilot creates one Dispatchable PRB report. Its exact impact CHG cannot be approved before contextual Review and cannot revise SYS before exact approval. Revision work preserves Stable lineage and executes before replacement context, Review, baseline, and pilot evidence. Baseline diff marks the changed SYS, dependent Review, dependent historical RES, and changed candidate Stale while omitting the unrelated SYS and Review. Closure cites exact approval and replacement evidence, creates PRB r00002 with its original evidence source, satisfies the CHG closure Obligation, and leaves repository health valid.
- **Reversibility:** Later package versions may support multiple impacted requirements, architecture/interface revisions, accepted-baseline promotion, ordered work packages, change campaigns, or formal verification without changing generic Scenario execution. The frozen-resolution representation may become link-keyed in a future capability version; until then, comparison consumes exact targets before pairing Stable resolutions so an exact target and Stable dependency in one lineage cannot be confused.
- **Evidence/observations:** Public executable coverage initializes a real repository, qualifies an ENV, runs an independently reviewed failing pilot, executes PRB reporting and exact CHG impact analysis through adapters, reviews and approves the CHG, revises one affected SYS in its original lineage, freezes replacement context and candidate evidence, runs replacement verification, proves selective Review/RES Staleness and unrelated evidence reuse through `baseline diff`, atomically publishes closure DEC plus PRB r00002, verifies derived closed state and absent closure Loose End, and finishes with `req doctor`. Generic source contains no PRB, CHG, pilot, original-V, or change-status identifier.


## D-047 — Review durable pilot measurements before deferring package expansion

- **Status:** accepted and implemented
- **Decision:** The Example Process Package adds generated `PAS@1` and a declarative `phase-2-pilot-assessment@1` slice. Exact durable source observations are frozen as evidence in a `pilot-assessment-context` BSL. A Dispatchable `assess-phase-0-2-pilot@1` Scenario publishes one structured PAS measuring Review and Review Context volume, observed agent tracer-issue effort with all 13 exact Git commit references, localized-change reuse and Staleness explanations, Loose End usefulness, gate ceremony, environment-profile sufficiency, verification discrimination, and actual scope reduction. PAS requires ordinary independent contextual Review. Only then may `decide-pilot-expansion@1` publish a DEC whose `decision` exactly equals the PAS `proceed`, `change`, or `stop` recommendation and whose source-owned links cite both the exact PAS and passing REV. The current evidence records `change`; Phases 3–6 remain absent.
- **Alternatives:** Store measurements only in generated reports or GitHub comments; add pilot metrics or a V-model assessment command to the kernel; use an unstructured DEC as both measurements and authorization; accept self-reported generated output without exact evidence context; infer that completed simplification removed scope; treat passing verification as sufficient to proceed; skip independent Review; or add Phase 3–6 definitions before recording a Decision.
- **Rationale:** The pilot exists to test whether the process is useful and proportionate, not merely whether the evaluator can execute it. Separating exact observations, structured assessment, independent judgment, and consequential Decision makes each claim reviewable without turning package metrics into kernel vocabulary. The measured tracer supports immutable evidence, selective reuse, correct Staleness explanations, useful exact Loose Ends, sufficient embedded profiles, and positive/negative discrimination. It also shows high review/gate ceremony and no actual removal from the challenged Phase 2 scope, so `change` is more defensible than implicit expansion.
- **Expected behavior:** A frozen pilot context derives one ready assessment Obligation. Direct PAS authoring fails. Canonical Scenario execution publishes a PAS linked to that exact context. The expansion Decision remains non-Dispatchable until PAS has a passing exact REV. The final DEC adopts `change`, cites PAS and REV exactly, satisfies the Decision Obligation, and leaves no Phase 3–6 package definitions or durable repository integrity failures.
- **Reversibility:** A later package may revise PAS metric fields, thresholds, recommendation Policy, evidence-context composition, or the Decision outcome without changing generic evaluation. A future process-neutral capability may aggregate signed execution records if realistic measurements justify it; observed effort remains authored evidence in this slice. New Phase 3–6 definitions may require the exact reviewed expansion Decision in their entry expressions.
- **Evidence/observations:** Public `req` coverage initializes a real repository, authors five exact pilot observations, freezes their hashes and provenance in a dedicated context, proves generated-authorship enforcement, executes assessment publication, checks structured burden/reuse/queue/ceremony/profile/discrimination/scope measurements, proves the Decision blocker names exact Review work, publishes a passing contextual REV, executes an exact `change` DEC with required PAS and REV links, confirms no Decision Loose End and no Phase 3–6 catalog entries, and finishes with `req doctor`. Generic source contains no PAS, pilot-assessment Phase, metric, recommendation, or Phase 3–6 identifiers.

## D-048 — Close the v0.8 concept-validating implementation profile

- **Status:** accepted and implemented
- **Decision:** Treat tracer issues #15–#48 as the completed implementation profile for the accepted v0.8 design baseline and close the parent implementation issue. Preserve `docs/mdlm-process-overview-v0.8.md` unchanged as the historical normative design document, and record current conformance separately in `docs/mdlm-v0.8-implementation-conformance.md`. Completion means the process-neutral kernel, generic CLI, durable repository, Scenario boundary, and bounded Example Process Package pilot are executable through established public seams. It does not mean production readiness or permission to add Phases 3–6 after the reviewed `change` Decision.
- **Alternatives:** Rewrite the accepted overview's historical evidence labels; leave the parent issue open indefinitely despite every planned tracer closing; call the entire V-model implemented; treat open implementation questions as blockers without observed product need; or add another kernel feature solely to manufacture a closeout test.
- **Rationale:** The accepted overview is a versioned design baseline, while implementation status changes over time. A separate conformance report preserves that distinction and maps the broad parent stories to narrow executable evidence. Closing the profile avoids equating an open tracking epic with unimplemented behavior while retaining explicit limits and future questions.
- **Expected behavior:** Repository documentation identifies the completed v0.8 concept-validating profile, its four public seams, issue/test evidence, process-neutrality invariants, pilot outcome, and deferred boundaries. The full public-seam suite, typecheck, build, prototype, and package validation pass. The bootstrap package remains at 0.29 with no Phase 3–6 definitions.
- **Reversibility:** A future accepted baseline or implementation profile may supersede this report without changing v0.8 history. Deferred work may become new independently reviewed issues, but Phase 3–6 expansion must address the exact `change` Decision rather than being folded into this closeout.
- **Evidence/observations:** Issues #15–#48 are closed. Their executable coverage spans textual expressions, type resolution, package validation and inspection, lifecycle evaluation, durable Markdown mutations, exact baselines, graph traversal, Scenario dry-run/execution, aliases, Phase 0–2 tracers, exact change control, and reviewed pilot assessment. No new runtime seam was needed for closeout; adding one would duplicate the established public contracts rather than validate missing behavior.

## D-049 — Prepare dry-run and execution from the same repository truth

- **Status:** accepted and implemented
- **Decision:** When `req scenario dry-run` omits an explicit fixture, derive a fresh Lifecycle Snapshot from authoritative repository Markdown using the same exact Process Package identity and enabled Phase preparation used by canonical Resolver Scenario execution. Preserve `--snapshot` as an explicit fixture mode for package tests and historical evaluation. Both modes continue to require one exact Dispatchable Obligation Instance and remain side-effect-free.
- **Alternatives:** Require every repository operator to construct a private snapshot; make the external agent import internal repository modules; infer bindings from generated projections; remove fixture-backed dry-run; or let dry-run and execution choose repository context independently.
- **Rationale:** Dry-run is the public preparation boundary an agent uses before execution. Requiring a caller to reproduce private snapshot assembly undermines that boundary and can make the inspected contract differ from the one passed to the adapter. One shared repository preparation path keeps Markdown authoritative while retaining deterministic fixture evaluation.
- **Expected behavior:** A selected initialized repository can dry-run an exact Dispatchable Resolver without `--snapshot`. The result includes resolved inputs, full prompt and skill bytes, Policies, prohibited inputs, expected outputs, and pending completion checks. No datum, transaction, execution record, or generated projection is written. Explicit fixtures and typed rejection of unknown, blocked, non-Dispatchable, or mismatched instances remain unchanged.
- **Reversibility:** A future public snapshot-selection option may identify an historical repository boundary explicitly, but it must preserve exact provenance and cannot silently fall back to generated truth. Fixture mode may evolve independently without changing repository-backed execution authorization.
- **Evidence/observations:** Public `req` coverage initializes a durable repository, authors an empirical QST, derives its exact Obligation Instance, and successfully dry-runs its Resolver without a fixture while proving the repository tree is byte-for-byte unchanged. Execution coverage compares the complete dry-run preparation with the adapter request produced from the same repository truth. Existing fixture, blocked, mismatch, prohibited-input, and package-authored condition checks continue to pass.

## D-050 — Inspect effective lifecycle types through the generic CLI

- **Status:** accepted and implemented
- **Decision:** Add process-neutral `req schema <type>` over the established `resolveType` seam. Resolve only from the explicitly selected exact Process Package and project the package identity, versioned type definition, complete Payload Template chain, effective kernel Datum Envelope, flattened payload schema, source-owned link contracts, lifecycle behavior, and applicable Kernel Capability bindings. Human and JSON output carry the same semantic evidence without exposing private compiled-expression structures.
- **Alternatives:** Require operators and agents to read and merge package YAML; add commands for bootstrap type IDs; inspect generated reference projections; return only the leaf payload fragment; expose internal parser or expression objects; or accept an implicit bundled package when no selection exists.
- **Rationale:** Package authors and agents need one reproducible public answer to what a lifecycle type means after inheritance and capability selection. Reusing `resolveType` keeps template flattening and envelope ownership behind the existing deep interface, while exact package provenance prevents a schema projection from being mistaken for another installed or bundled package.
- **Expected behavior:** `req schema STK` against the selected bootstrap package reports its exact package digest, `STK@2`, all three inherited templates, the kernel envelope, complete payload fields and requirements, its `derived-from` contract, and authored lifecycle behavior. A capability bound to a differently named package type is reported without kernel recognition of that type ID. Unknown types, absent package selection, and invalid selected packages fail with typed diagnostics.
- **Reversibility:** A future generic `req type list|show|resolve` family may reuse or supersede this convenience spelling while preserving this semantic projection. Additional Kernel Capabilities or schema presentation formats can extend the projection without teaching the command package-owned lifecycle vocabulary.
- **Evidence/observations:** Public `req` tests install and select exact packages, reconcile human output against every JSON evidence section, inspect the inherited bootstrap requirement type, rename the capability-bound baseline type to `SNP`, and verify unknown-type, no-selection, and invalid-package diagnostics. Generic implementation source contains no bootstrap lifecycle type or Phase IDs.

## D-051 — Separate explicit Scenario initiation from Resolver authorization

- **Status:** accepted and implemented
- **Decision:** A package-authored Scenario has exactly one execution authorization form. A Scenario with non-empty `resolves` remains a Resolver and requires one exact Dispatchable Obligation Instance. A non-Resolver Scenario declares `initiation: explicit` with empty `resolves` and may be prepared or executed only when the operator supplies `--initiate`. Both modes enter one shared preparation, adapter, contract-validation, completion, reevaluation, and atomic publication path. Dry-run and execution provenance record `dispatchable-obligation` or `explicit-initiation`; explicit initiation records no fabricated Obligation.
- **Alternatives:** Continue piecemeal `req new` authoring with Scenario-looking provenance; fabricate a synthetic Obligation Instance; infer initiation from an empty `resolves` list without an operator action; make every authored Scenario a permanent Loose End; allow arbitrary Scenario execution without authorization; or create a second publication implementation for initial authoring.
- **Rationale:** Initial wayfinding and other bounded authoring Scenarios are coherent multi-output contracts, but strict obligation-only execution made their first outputs impossible to publish together. Explicit package declaration plus explicit operator intent closes that bootstrap gap without weakening Dispatchability or teaching the kernel package-owned lifecycle vocabulary.
- **Expected behavior:** `req scenario dry-run chart-wayfinding-map@1 --initiate` derives repository truth and returns exact prompt and skill bytes, input checks, review Policy, prohibited inputs, output contracts, and pending completion. Executing the same initiation can publish MAP, QST, and ART in one transaction. Missing outputs, bad cardinality, schema or link failures, prohibited inputs, and false completion publish nothing. `resolve-question@1 --initiate` is rejected before the adapter, and a package cannot combine explicit initiation with Resolver semantics.
- **Reversibility:** The generic authorization union can admit future package-neutral authorization forms through new versioned contracts. CLI spelling may evolve, but any replacement must retain explicit operator intent, exact provenance, Resolver non-bypass, and one atomic publication path.
- **Evidence/observations:** Public `req` tests prepare a side-effect-free initial authored Scenario from durable Markdown, compare full prompt and skill bytes to the exact selected package, publish a coherent three-output wayfinding batch, inspect explicit-initiation execution provenance, and exercise every prepublication failure class without observing a transaction. Resolver tests retain exact Dispatchable Obligation provenance. Package-loading coverage rejects ambiguous authorization declarations. The package advances to `mdlm-bootstrap@0.30.0` and `bootstrap@7`.

## D-052 — Route explicitly prototype-bound questions through package evidence

- **Status:** accepted and implemented
- **Decision:** The Example Process Package lets an empirical QST optionally declare
  `resolution_evidence: prototype` plus one exact `git:<40-hex-commit>` target,
  bounded supported and unsupported behavior, and two permitted findings. Separate
  package-owned Selectors route these questions to
  `prototype-question-resolution@1` and leave all other empirical questions on
  `open-question-resolution@2`. Once the source QST Revision is frozen, the exact
  Obligation is Dispatchable only through `resolve-question-with-prototype@1`,
  which publishes one ART, one resolving and ART-justifying DEC, and the next
  answered QST Revision in one validated transaction.
- **Alternatives:** Recognize prototype vocabulary or a QST field in the kernel;
  route every empirical question through prototype work; retain the explicit
  non-Resolver prototype Scenario and then resolve the QST piecemeal; infer a Git
  target from the working tree; accept branch or tag references; publish ART, DEC,
  and QST separately; or represent exploratory findings as qualification RUN/RES
  evidence.
- **Rationale:** The external pilot exposed that empirical is too broad a routing
  discriminator: some questions need one already-bounded exact prototype while
  others need research or different evidence. A package payload declaration keeps
  that distinction durable and process-owned. Freezing the source Revision before
  replacement preserves one-open-draft and immutable Revision semantics. Exact
  claim equality and two declared findings make the adapter output mechanically
  bounded without parsing prose or promoting the prototype into formal evidence.
- **Expected behavior:** A generic empirical QST remains Dispatchable through
  `resolve-question@1`. A prototype-bound frozen QST instead reports the prototype
  Resolver as both eventual and actionable. Dry-run exposes the exact target,
  claim boundaries, complete ART/DEC/QST contract, required links, prompt, full
  skills, Policies, completion expression, and prohibited conclusions. Canonical
  execution publishes all three outputs with exact provenance and satisfies the
  original Obligation. Mutable references, conclusions outside the two declared
  findings, incomplete batches, and RUN/RES substitutions publish nothing.
- **Reversibility:** Later package versions may add other evidence-route values or
  a dedicated evidence-boundary initiation Scenario without changing generic
  evaluator, dry-run, execution, or repository contracts. The discriminator and
  Scenario identities remain package data selected by exact package provenance.
- **Evidence/observations:** Public `req` coverage authors both generic and
  prototype-bound empirical QSTs, freezes the exact prototype source boundary,
  compares resolved prompt and skill bytes, executes the three-output transaction,
  observes QST r00002 and absent original Loose End, and verifies every prohibited
  failure leaves the lifecycle tree byte-for-byte unchanged. Generic source
  contains no QST, ART, prototype, or Example Process Package Scenario identifier.
  The package advances to `mdlm-bootstrap@0.31.0` and `bootstrap@8`.

## D-056 — Finalize capability-bound baseline outputs before Scenario completion

- **Status:** accepted and implemented
- **Decision:** During repository-backed Scenario execution, an output whose type
  is selected by the package's `exact-baseline@1` capability binding is finalized
  by the kernel before the package completion expression runs. The adapter may
  propose exact definition members, evidence, and composition, but not the
  kernel-managed snapshot. The kernel validates those references, verifies
  composed baselines, hashes exact repository bytes, resolves links, records exact
  process provenance, and re-derives storage across the prospective lifecycle
  snapshot. Completion and lifecycle reevaluation therefore observe the baseline and
  its members as frozen before one transaction publishes the baseline and
  execution record.
- **Alternatives:** Evaluate completion against the adapter's editable proposal;
  let the adapter fabricate snapshot fields; publish then invoke `baseline freeze`;
  weaken package completion to accept an editable review context; attach Scenario
  provenance to a piecemeal baseline CLI sequence; or recognize `BSL` in generic
  execution code.
- **Rationale:** The repaired external pilot reached a Dispatchable
  `create-review-context@1` Resolver and supplied a valid complete BSL proposal,
  but execution rejected `context.storage.frozen == true` before any baseline
  finalization existed. Publishing first would violate atomic failure semantics,
  while weakening the completion contract would not satisfy the package's exact
  Review Context obligation. Finalization follows the generic capability binding
  and reuses the exact-baseline repository rules without teaching the kernel the
  package's type ID or review vocabulary.
- **Expected behavior:** A valid review-context proposal executes successfully;
  the completion expression sees frozen storage; `req show` reports the published
  output frozen; and `req baseline verify` passes immediately. Adapter-authored
  snapshot data, missing exact references, invalid composition, false completion,
  repository races, or publication failures expose no partial output or execution
  record.
- **Reversibility:** A later kernel capability may replace the exact-baseline
  finalizer behind the same package binding and Scenario contract. Packages that
  do not bind `exact-baseline@1`, and outputs of every other package-defined type,
  retain the ordinary publication path.
- **Evidence/observations:** The public `req` regression in
  `test/req-scenario-execution.test.ts` reproduces the exact pilot proposal shape,
  asserts successful completion, inspects frozen storage, and verifies the
  published baseline. The fresh repaired pi session—started after the package
  migration—was continued across one-step turns after the executor fix and
  atomically published `BSL-MH359T85MG-r00001`; `req doctor` then
  verified all three pilot baselines with no diagnostics.

## D-059 — Permit exact Phase and Process subjects for Obligations

- **Status:** accepted and implemented
- **Decision:** The evaluator exposes the selected exact Phase and Process Package
  contexts as identity-bearing expression entities. An Obligation `for_each`
  expression may use `[phase]` or `[process]`; the compiler infers that domain for
  the declared subject binding. A Phase subject identity contains the package's
  Phase ID and version. A Process subject uses
  `process@<phase-id>@<phase-version>` so authorization returns to the same Phase
  evaluation; the final exact Process Package reference makes the selected
  Process scope exact while keeping the colon-delimited identity unambiguous.
- **Alternatives:** Require an explicitly initiated first Scenario; fabricate a
  bootstrap Lifecycle Datum; add one kernel-recognized initial-work noun; make an
  empty `req next` implicitly authorize a package Scenario; or introduce special
  imperative Phase hooks outside the expression and Obligation model.
- **Rationale:** Required authored foundation work can precede every Lifecycle
  Datum. Treating the already-typed `phase` and `process` expression roots as
  exact subjects lets the package declare that outcome without creating false
  lifecycle truth or teaching the kernel any package-owned Phase or output name.
  The resulting Resolver uses the same Dispatchability and exact authorization
  checks as Datum-scoped work.
- **Expected behavior:** An initialized repository can report one Dispatchable
  package-declared Loose End against its exact Phase or Process subject. `req
  next`, dry-run, and execution preserve the exact Obligation Instance. Once the
  Resolver publishes evidence satisfying the package expression, reevaluation
  removes that Loose End and discovers any downstream work. Scope entities never
  appear in Revision selectors or Scenario lifecycle inputs.
- **Reversibility:** A later expression version may provide a more general exact
  scope-identity algebra. Existing Revision subjects and Obligation identities
  are unchanged, and packages that do not use `[phase]` or `[process]` retain
  their current behavior.
- **Evidence/observations:** A temporary package fixture declares an initial MAP
  outcome over both Phase and Process subjects and contains no initial Lifecycle
  Data. Public evaluator and `req` coverage proves discovery, `next`, dry-run,
  authorized Scenario execution, atomic MAP publication, and
  satisfaction-driven removal of the scoped Loose End.

## D-060 — Derive Scenario authority and attention from participation Policies

- **Status:** accepted and implemented
- **Decision:** A Scenario may reference one exact participation Policy and bind
  all of its typed parameters with `mdlm-expression@1` expressions over exact
  resolved Scenario inputs and process context. The Policy returns a standardized
  authority mode, package-defined authority, delegation allowance, attention
  timing, checkpoint, and Consolidation Group. Public Loose End, `req next`, and
  dry-run projections expose only the resulting Authority Requirement and
  Attention Schedule, the exact Policy reference, and the separate Scenario
  transaction-batching contract.
- **Alternatives:** Infer human involvement from prompts; encode authority in the
  kernel; add participation fields directly to every Scenario without Policy
  evaluation; treat every atomic transaction as a separate interruption; or let
  the operator invent checkpoint grouping.
- **Rationale:** Continuous orchestration must know when it can proceed, delegate,
  or stop for human authority without recognizing package-owned roles or reading
  prose. Attention timing is a presentation concern, while Scenario batching is
  an atomicity concern; conflating them would either interrupt too often or combine
  work that must remain separate transactions.
- **Expected behavior:** Package loading rejects unknown participation Policies,
  incomplete or mistyped parameter bindings, nonstandard result schemas, and
  invalid results. Once Resolver inputs are exact, evaluation and dry-run return
  the same autonomous, delegated, or attended result. Immediate and checkpoint
  attention remain distinct, and compatible checkpoint items expose a package-
  defined Consolidation Group without becoming satisfied or deferred.
- **Reversibility:** A later participation contract version may add new authority
  or scheduling dimensions behind a new standardized result and Scenario field.
  Scenarios without participation declarations retain their current projections,
  and the kernel remains independent of package authority names.
- **Evidence/observations:** Copied-package public-seam tests validate exact Policy
  references, parameter contracts, standardized results, and explicit-initiation
  evaluation. Repository-backed `req` coverage derives all three authority modes,
  immediate and checkpoint attention, Consolidation Group, and separate
  transaction batching from exact QST inputs; Loose Ends, `req next`, and dry-run
  agree without exposing Policy rules or schemas. The package advances to
  `mdlm-bootstrap@0.32.0` and meta-schema v3 so the new Scenario contract does
  not reuse the immutable v2 or package-version slots.

## D-061 — Declare bootstrap authority and attention as package Policies

- **Status:** accepted and implemented
- **Decision:** The Example Process Package binds contextual Review, question
  resolution, prototype-backed question resolution, and gate sign-off to exact
  participation Policies. Contextual Review requires delegated independent-reviewer
  authority; empirical resolution is autonomous under evidence authority only
  when the exact QST declares evidence available or carries a valid frozen
  prototype evidence contract; preferential resolution and gate sign-off require nondelegable stakeholder
  authority. Blocking preferences require immediate attention, while compatible
  nonblocking preferences with an explicit compatible scheduling declaration use
  the selected Phase's declared gate checkpoint and stakeholder-question
  Consolidation Group (including `phase-0-gate` and
  `phase-0-stakeholder-questions` during Phase 0); undeclared or incompatible
  scheduling remains immediate.
- **Alternatives:** Continue inferring authority from prompts; classify all
  questions as immediate interruptions; allow the agent to infer stakeholder
  approval; or defer nonblocking questions by changing their Lifecycle Data.
- **Rationale:** Package-owned participation results let orchestration distinguish
  technical Dispatchability from consequential human authority. Checkpoint
  scheduling can consolidate attention without pretending that an open QST is
  answered or durably deferred.
- **Expected behavior:** An empirical question without sufficient exact evidence
  remains blocked and requests an evidence provider rather than granting autonomous
  resolution authority. Preferential question Obligations are technically ready
  so an explicitly authorized agent can execute them, but their projected
  Authority Requirement remains attended and nondelegable. A `blocks` link
  changes both autonomous empirical and attended preferential work to immediate
  attention and continues to block dependent
  package work. Gate sign-off cannot proceed from implied approval, and
  contextual Review cannot proceed as autonomous agent judgment.
- **Reversibility:** Package versions may revise authority names, checkpoints, or
  grouping through new Policy or Scenario versions. The standardized
  participation seam and kernel remain unchanged.
- **Evidence/observations:** Public `evaluateLifecycle` package tests derive each
  result from exact Review, QST, and candidate inputs, preserve open nonblocking
  QST evidence, and distinguish immediate attention from checkpoint
  consolidation. The package advances to `mdlm-bootstrap@0.33.0`.

## D-062 — Require exact Lifecycle Data for consequential authority

- **Status:** accepted and implemented
- **Decision:** A participation-bearing Scenario names the exact output and lifecycle type that records authority. Before a delegated or attended execution reaches the adapter, the public `req scenario execute` path requires one matching `--authorize <authority>` supply for every evaluated Authority Requirement. That supply permits the operating agent to publish after explicit authorization but is not itself lifecycle satisfaction. Every invocation must return the declared authority-evidence output: REV for contextual or mandatory simplification Review judgment and DEC for gate, consequential question disposition, change approval, pilot expansion, and comparable consequential authorizations. Evidence-driven change closure remains exact DEC without adding a separate human gate. Autonomous execution needs no authority supply. Routine autonomous empirical answers may publish a new QST Revision without manufacturing a DEC; explicit deferral or cancellation remains an unsatisfied question Obligation until its exact scoped DEC passes Review. The package also defines reviewed `authority-delegation` DEC data and an applicability Selector bounded by exact target Revision, authority, delegate, versioned Scenario, validity, passing Review, expiry, and reactivation declarations.
- **Alternatives:** Treat chat text, adapter prose, or completion summaries as approval; require the stakeholder to run the sign-off command; accept any CLI authority string without comparing participation; put authority role names in the kernel; force every clarification into DEC; or allow standing delegation by role or Stable alias without exact reviewed scope.
- **Rationale:** Participation says whose judgment is needed but did not previously prove that the judgment was explicitly supplied before execution or identify the durable evidence that satisfies the lifecycle. Separating execution-time authority supply from exact output evidence lets the user authorize publication conversationally while the agent performs the public atomic command. It also prevents an execution log from replacing REV or DEC and keeps package-owned authority names and evidence choices outside the kernel.
- **Expected behavior:** Dry-run, Loose Ends, and `req next` continue to project the same Authority Requirement. Non-autonomous execution without the matching authority fails before adapter invocation and publishes nothing, even when adapter completion prose claims approval. With explicit authority, the operating agent invokes `req`, the adapter receives the evaluated requirement and evidence contract, and one atomic transaction publishes exact REV or DEC evidence. Gate evidence still becomes applicable only through its exact target, validity, and required passing Review. Reviewed standing delegation does not transfer to another target or Scenario and can authorize execution only when supplied by exact Revision through the Scenario's declared applicability Selector. Reviewed gate rejection remains exact history but cannot satisfy approval. Routine autonomous empirical clarification remains executable without authority or DEC.
- **Reversibility:** A future contract may replace role-string authority supply with authenticated principal assertions or consume applicable standing-delegation Decisions directly. Such a contract must preserve pre-adapter validation, package-owned authority vocabulary, exact output evidence, and the distinction between publication permission and lifecycle satisfaction.
- **Evidence/observations:** Public `req` coverage proves completion-summary-only gate approval cannot invoke the adapter, explicit stakeholder authority lets the agent publish the exact gate DEC, execution provenance records authority and evidence, delegated Review requires independent-reviewer supply, routine empirical resolution can omit DEC, and reviewed standing delegation selects only its valid exact target and Scenario. Package loading rejects missing or mismatched authority-evidence declarations. The package advances to `mdlm-bootstrap@0.34.0`, `DEC@3`, `QST@4`, revised sign-off/Review/question Scenario contracts, and authority-bearing adapter/execution contracts v3.

## D-063 — Derive Phase progression from exact package-declared authority

- **Status:** accepted and implemented
- **Decision:** A nonterminal Phase declares its next Phase, readiness expression, authorization condition, standardized participation Policy, public authorization Scenario, and exact evidence Selector. Repository-backed `req phase status`, `req loose-ends`, and `req next` derive the active Phase by following complete declarations from the package's initial Phase; no mutable active-Phase pointer is repository truth. The bootstrap Phase 0 declaration reuses its reviewed approving gate DEC as progression authorization. Phase 1 declares autonomous progression into pilot assessment when its exact frozen assessment context exists. The same generic contract permits another package to select a separate reviewed DEC before progression.
- **Alternatives:** Continue editing `.mdlm-phase`; always require a second progression DEC after gate approval; put bootstrap Phase IDs or DEC meanings in the kernel; treat an unreviewed Decision or chat statement as progression; or encode progression as imperative operator instructions.
- **Rationale:** Gate approval often already expresses exact authority to enter the next Phase. Requiring another identical approval adds ceremony without evidence value, while an implicit phase-file edit loses exact authorization and provenance. Separate readiness, authorization, and attention projections let an operator stop at the real Authority Requirement and continue automatically after exact evidence becomes applicable.
- **Expected behavior:** Before Review of a gate DEC, Phase status reports readiness, missing exact authorization, stakeholder attention, and the applicable sign-off Scenario. After the same DEC receives its required passing Review, Phase 0 progression is complete and repository-backed `req next` evaluates Phase 1 without another command handoff. When a ready distinct progression lacks authority, `req next` projects its Scenario, exact subjects, Authority Requirement, and attention rather than returning no work. Packages that declare a distinct progression Decision remain blocked until that exact DEC passes Review. Explicit historical Phase inspection remains available.
- **Reversibility:** A future package version may change the next Phase, readiness expression, authority Policy, Scenario, or evidence Selector. Historical authorization and package provenance remain immutable and inspectable under their original package reference.
- **Evidence/observations:** Public `loadProcessPackage`, `evaluateLifecycle`, and `req` tests cover progression reference validation, integrated gate authorization, a separate reviewed progression DEC, missing-attention projection, explicit historical Phase inspection, and automatic repository-backed continuation. The package advances to `mdlm-bootstrap@0.35.0` and `bootstrap@9`.

## D-064 — Discover the complete Phase 0 foundation from Obligations

- **Status:** accepted and implemented
- **Decision:** The bootstrap package declares Phase-scoped initial MAP and PSP Obligations, PSP-scoped STK-set Obligations, exact contextual Review Obligations, and a Phase-scoped intent-candidate Obligation. Resolver Scenarios publish each required output through the existing atomic adapter boundary. A current MAP, PSP, STK, BSL candidate, or DEC with a failed Review creates exact replacement-Revision work; the replacement must retain the same Stable Datum identity and type, and receives fresh context and Review work. Optional prototype work remains selected only by an exact prototype-bound empirical QST.
- **Alternatives:** Keep the Phase 0 order only in the pilot runbook; fabricate placeholder Lifecycle Data at initialization; make one imperative command author the complete foundation; retain failed Revisions as current work; or make all empirical work mandatory.
- **Rationale:** An initialized repository previously had no discoverable Phase 0 action even though all authoring Scenarios existed. Small package-owned Obligations let normal reevaluation reveal work only when its exact inputs exist, reuse existing Review and gate machinery, and avoid adding bootstrap lifecycle nouns or sequencing rules to the kernel.
- **Expected behavior:** `req next` on an initialized selected repository returns the exact Phase-scoped map Obligation. MAP publication reveals PSP work; PSP publication reveals STK work; exact foundation Revisions reveal Review Context and Review work; passing Reviews reveal candidate construction; candidate Review reveals gate authority; applicable reviewed approval completes declarative progression. A failed Review reveals one replacement resolver, preserves immutable history, and fresh Review work targets only the replacement Revision. Compatible nonblocking preferences retain their Phase 0 gate checkpoint and Consolidation Group, while exploratory prototype work appears only from its existing empirical evidence contract.
- **Reversibility:** A later package may split the foundation into group candidates, require VSP or simplification, or alter ordering by changing Selectors and Obligations. The public kernel interfaces, exact history, and process-neutral evaluator remain unchanged.
- **Evidence/observations:** Public `req` integration coverage starts from initialization, executes package-discovered MAP, PSP, STK, Review Context, Review, candidate, gate, and progression work, and proves failed-Review replacement and re-Review routing. Existing public evaluator coverage retains optional prototype and consolidated-attention behavior. The package advances to `mdlm-bootstrap@0.36.0` and `bootstrap@10`.

## D-065 — Derive Phase 1 environment assurance from exact entry evidence

- **Status:** accepted and implemented
- **Decision:** The bootstrap package derives verification-strategy work from current exact Phase 0 stakeholder requirements and derives one environment-assurance transaction from each applicable exact VSP. That transaction atomically publishes ENV, qualification VER, and qualification VAI with one machine-checked exact strategy profile. Existing execution Obligations derive generated RUN/RES, and each RES atomically links its exact execution ENV without a post-run mutation. ENV Review Context work remains blocked until passing qualification exists, then accepts only a frozen context containing the exact ENV and VSP definitions plus exact VER, VAI, RUN, and passing RES evidence.
- **Alternatives:** Keep VSP and environment setup in operator instructions; publish ENV, VER, and VAI through separate manually selected commands; permit ENV Review before qualification; add Phase 1 sequencing or lifecycle nouns to the kernel; or combine qualification execution and independent judgment into one transaction.
- **Rationale:** Small package-owned Obligations expose the already-declared Scenarios only when their exact dependencies exist. Reusing the generic Review and execution machinery avoids kernel scope while keeping generated evidence atomic and human authority limited to the declared independent Review boundary.
- **Expected behavior:** Phase 1 entry evidence exposes VSP work. Applicable VSP publication exposes one ENV/VER/VAI transaction. Qualification VAI publication exposes generated RUN/RES work. Before passing qualification, ENV context work is blocked by that execution; afterward, the exact assurance context is Dispatchable and independent Review is the only human-authority step in this chain.
- **Reversibility:** A future package may split profiles into separate environment Obligations or require additional assurance evidence by changing package Selectors and completion expressions. Kernel interfaces and historical package provenance remain unchanged.
- **Evidence/observations:** Public `req` coverage obtains Scenario names from projected Obligations, executes VSP, ENV/VER/VAI, RUN/RES, exact ENV context, and Review through validated Scenario execution, and preserves direct generated-type rejection. The package advances to `mdlm-bootstrap@0.37.0` and `bootstrap@11`.

## D-066 — Derive the exact pilot verification chain from ready Phase 1 evidence

- **Status:** accepted and implemented
- **Decision:** The bootstrap package derives one pilot VER Obligation for each current exact Phase 1 stakeholder requirement Revision with one applicable exact VSP Revision. The VER records Stable and exact requirement coverage. After contextual Review, the exact VER Revision derives VAI work only when one qualified reviewed ENV Revision and one current ART Revision are unambiguous. The implementation Scenario projects a delegated independent-verification-implementer Authority Requirement and atomically publishes the source-blind VAI with an exact authorization DEC. Existing execution Obligations bind the exact package-resolved VER, ENV, and ART Revisions and atomically publish immutable RUN/RES evidence after VAI Review.
- **Alternatives:** Keep pilot sequencing in operator prose; permit arbitrary current ART or ENV selection; combine VER and VAI authoring; infer independent implementation authority from agent identity; or add Phase 1 pilot nouns and sequencing to the kernel.
- **Rationale:** Two small package-owned outcome Obligations close the remaining manual pilot-authoring gap while reusing exact Review, participation, Scenario binding, and generated-evidence machinery. Exact links prevent newer requirement Revisions or unrelated targets from borrowing historical pilot design.
- **Expected behavior:** Ready exact requirement/strategy evidence exposes pilot VER work. Its Review and one exact target expose separately authorized VAI work. VAI publication exposes its Review blocker; passing Review makes the existing RUN/RES Resolver Dispatchable. Exact input Revision substitution is rejected before the adapter boundary, positive and intentionally unsupported target behavior remain separate, and pilot results cannot claim formal requirement evidence.
- **Reversibility:** A future package may require multiple pilot targets, split implementation authorization into reviewed standing delegation, or strengthen pilot Review Context membership through package Selectors. Kernel interfaces and historical evidence remain unchanged.
- **Evidence/observations:** Public `req` coverage obtains VER, VAI, Review, and execution Scenario names from projected Obligations, records exact implementation authorization, rejects an unrelated exact target before adapter invocation, and preserves immutable discriminating RUN/RES evidence. The package advances to `mdlm-bootstrap@0.38.0` and `bootstrap@12`.

## D-067 — Derive the complete bounded Phase 2 definition chain

- **Status:** accepted and implemented
- **Decision:** Accepted intent requirements derive exact ASP work, each current ASP derives ICSP work, and one unambiguous requirement/ASP/ICSP/VSP set derives DWP planning. Existing execution, Review, question, simplification, coverage, and completion Obligations remain the middle of the chain. Exact reviewed completion evidence derives a group candidate; its Review derives a composed level candidate; only the reviewed level candidate receives gate authorization. Phase 1 now progresses autonomously from complete exact pilot execution evidence into system definition, and the reviewed Phase 2 level gate authorizes progression into pilot assessment.
- **Alternatives:** Keep architecture, interface, DWP, and candidate authoring in operator instructions; gate intermediate group candidates; select context by current aliases; or add lifecycle sequencing to the kernel.
- **Rationale:** Small package-owned Obligations expose existing deep Scenario contracts while exact payload and link correlation prevents unrelated architecture, interface, strategy, candidate, or authorization evidence from satisfying the slice. Reusing generic Review, question, and gate machinery minimizes operational and kernel impact.
- **Expected behavior:** The smallest accepted requirement slice discovers ASP, ICSP, DWP, QST/DEC resolution, SYS, Reviews, simplification, DWP completion, group and level candidates, gate authorization, and progression without operator-selected core Scenario names. Open challenged scope blocks execution and completion until exact resolution evidence exists.
- **Reversibility:** A future package may support many-interface or many-group reconciliation by replacing package Selectors and Obligations. Exact historical Lifecycle Data, public kernel seams, and authorization history remain unchanged.
- **Evidence/observations:** Public `req` integration coverage traverses the bounded decomposition slice using projected actionable Resolvers, exact adapter inputs, delegated Review authority, stakeholder gate authority, and machine-evaluated progression. The package advances to `mdlm-bootstrap@0.39.0` and `bootstrap@13`.

## D-068 — Derive pilot assessment from an exact completed evidence boundary

- **Status:** accepted and implemented
- **Decision:** Every complete reviewed Phase 2 level candidate derives one durable pilot-observation Obligation whose typed payload records every PAS measurement basis. After every accepted Phase 2 requirement has a complete candidate and exactly one candidate-bound observation, the package derives one context-preparation Obligation whose Scenario freezes exactly those candidate Revisions and observations. The exact context derives generated PAS publication and independent Review. A failed PAS Review derives a changed same-lineage PAS over the unchanged context that links every exact failing REV as corrected evidence before fresh Review. Only the current passing PAS with no dominating failed Review exposes the final nondelegable stakeholder Authority Requirement for an exact `proceed`, `change`, or `stop` Expansion Decision.
- **Alternatives:** Keep observation and context preparation in operator instructions; assess a mutable repository projection; permit failed PAS Reviews to coexist with an earlier pass; infer stakeholder approval from chat; or add pilot-assessment sequencing to the kernel.
- **Rationale:** Small package-owned Obligations close the remaining pilot-assessment discovery gaps while reusing exact baselines, generic Review, generated authorship, participation, and Scenario execution. Exact candidate, observation, context, PAS, Review, and Decision correlation prevents partial Phase 2 scope or unrelated judgment from authorizing expansion.
- **Expected behavior:** Entering pilot assessment exposes exact observation work. Complete observations expose one context transaction; that context exposes PAS work and independent Review. Failure exposes correction rather than allowing Decision work. Passing Review projects the stakeholder Authority Requirement; after explicit authorization, the agent executes the exact recommendation Decision through public `req` and continues through delegated Decision Review to the implemented profile boundary.
- **Reversibility:** A future package may replace one observation per level candidate with finer measurement-category types or add later lifecycle phases. Kernel interfaces, exact historical evidence, and authority history remain unchanged.
- **Evidence/observations:** Public `req` tests discover observation and context Scenarios from projected Obligations, reject incomplete context publication through Scenario completion, exercise failed PAS correction and fresh Review, and publish exact `change` evidence after explicit stakeholder authorization. The package advances to `mdlm-bootstrap@0.40.0` and `bootstrap@14`.

## D-069 — Continue generic pi operation to a real participation boundary

- **Status:** accepted and implemented
- **Decision:** A reusable package-neutral pi prompt runs one public `req next` → exact dry-run → atomic Scenario execution → doctor → commit → reevaluation loop until public projections expose nondelegable authority, unresolved checkpoint attention, genuine ambiguity/failure, or the implemented profile boundary. Scenario dry-run projects the exact currently applicable standing-delegation Revision IDs for each invocation. Delegated independent judgment runs in a fresh read-only session; compatible checkpoint attention is collected by the package-declared checkpoint and Consolidation Group but remains separate atomic work.
- **Alternatives:** Return after every Scenario; encode the bootstrap Phase sequence in agent instructions; let the operating session invent independent Review; ask stakeholders to run sign-off commands; or add an imperative lifecycle orchestrator to the kernel.
- **Rationale:** The existing public work and participation projections already define the process. A thin operator prompt plus one missing delegation-evidence projection closes the operational seam without duplicating package sequencing or expanding lifecycle scope.
- **Expected behavior:** Autonomous work continues without turns. Exact applicable delegation permits independent Review without repeated stakeholder permission. A nondelegable Authority Requirement stops the loop once; after the stakeholder supplies it, the agent publishes the declared REV/DEC and resumes immediately. A null queue is interpreted only through public Phase and Loose-End inspection.
- **Reversibility:** Operator wording and repository conventions may evolve independently. The optional dry-run projection is additive; exact Scenario authorization and immutable execution provenance remain unchanged.
- **Evidence/observations:** `test/pi-operator-instructions.test.ts` protects the continuous generic loop and excludes known package-sequence markers. `test/req-consequential-authorization.test.ts` proves dry-run discovers one exact applicable reviewed standing delegation and canonical execution consumes that same Revision.

## D-071 — Derive direct-authoring protection from authority-evidence contracts

- **Status:** accepted and implemented
- **Decision:** The kernel derives the set of authority-evidence Lifecycle types from every exact selected-package Scenario `authority_evidence.type` contract. Generic `req new --scenario` and direct Revision creation reject those types before payload or provenance claims are considered; only validated atomic Scenario execution may publish them. The Example Process Package also makes CHG contextually reviewable so its existing change-approval chain no longer relies on direct REV setup.
- **Alternatives:** Block only known REV and DEC IDs; block only when the claimed Scenario's authority output matches the requested type; preserve a test-only import that could satisfy normal Obligations; or require package authors to mark the same type again at the type definition.
- **Rationale:** Package-derived protection remains process-neutral and closes provenance laundering through a different Scenario. Reusing the authority contract avoids duplicate declarations. Migrating public flows to actual execution exercises participation, adapter, completion, required-link, and atomic-publication checks instead of creating privileged fixtures.
- **Expected behavior:** Direct Review, gate, question, waiver, delegation, or other authority evidence fails without publishing Markdown. Chat text and completion prose do not change that result. Existing non-authority authored types remain available through `req new`; exact REV and DEC evidence is produced in and validated against its matching execution transaction. Raw historical authority imports fail repository validation and cannot satisfy normal lifecycle work.
- **Reversibility:** A future explicitly classified historical-import facility may be added without weakening normal publication. The current change adds no import path and does not rewrite historical Lifecycle Data.
- **Evidence/observations:** Public tests reject direct authority publication even when DEC provenance names a non-authority Scenario, execute Review, gate, waiver, delegation, and question flows through public Scenario commands, and preserve atomic empty-repository behavior on rejection. The package advances to `mdlm-bootstrap@0.41.0` and `bootstrap@15`.

## D-054 — Migrate repository contracts only after exact compatibility validation

- **Status:** accepted and implemented
- **Decision:** `req process migrate <package@version>` is the package-neutral operation for changing an initialized repository from its exact descriptor package to one exact installed target. It validates the target package, the current descriptor and authoring package, unchanged kernel-owned repository contracts, every authoritative Markdown Datum, Scenario transaction provenance, and exact baselines before publishing a paired selection/descriptor replacement. Historical Lifecycle Data and execution bytes remain unchanged and validate against their exact installed authoring package.
- **Alternatives:** Make `process use` silently rewrite the repository descriptor; require hand-editing JSON; reinterpret data before checking compatibility; rewrite historical provenance to the target package; or update the two contract files without rollback.
- **Rationale:** Installation, selection, and repository compatibility are separate facts. Keeping `use` selection-only preserves deliberate activation semantics, while one explicit migration transaction repairs the external-pilot mismatch without weakening exact provenance or adding package vocabulary to the kernel.
- **Expected behavior:** A repository whose selection was moved ahead of its descriptor reports `repository-contract-mismatch`. Migration to that selected installed package reports old and new exact identities, preserves Datum and execution bytes, and makes `req doctor` pass immediately. Invalid packages, kernel-contract drift, incompatible Markdown, baseline failure, selection ambiguity, or publication failure leave both contract files byte-for-byte unchanged.
- **Reversibility:** A future repository-contract version may define richer compatibility or a journaled multi-file commit protocol. The current strict contract-equality rule can be widened only by an explicit kernel compatibility contract; public command semantics and historical provenance need not change.
- **Evidence/observations:** `test/req-process.test.ts` reproduces the pilot's selection/descriptor mismatch, migrates exact historical PSP and stakeholder Decision execution evidence, proves immediate repository health, exercises reverse migration and human/JSON identity output, and rejects contract drift, incompatible Markdown, invalid installed packages, and write failure without visible partial state.

## D-055 — Freeze same-lineage question sources through package-authored work

- **Status:** accepted and implemented
- **Decision:** Every current active open QST Revision derives `source-boundary-required@1`. Its sole Resolver, `freeze-source-boundary@1`, atomically publishes and kernel-finalizes one `source-boundary` BSL whose only definition member and exact scope are that source Revision. `source-boundaries-for@1` also requires kernel-projected valid Scenario-execution provenance, so a piecemeal baseline cannot satisfy the Obligation by claiming the Scenario name. Generic and prototype question Resolvers declare this Obligation as their blocker until that exact evidence exists.
- **Alternatives:** Continue piecemeal baseline commands with borrowed Review Context provenance; weaken the one-open-draft invariant; let a resolving Scenario mutate or silently freeze its source; add QST or prototype vocabulary to generic kernel code; or require operators to infer the workaround from a failed completion diagnostic.
- **Rationale:** A frozen exact source is a durable semantic prerequisite for any next same-lineage Revision, not a Review Context. Making it an exact package Obligation and Scenario preserves kernel process neutrality, gives `req next` an actionable Resolver, and reduces the three-command workaround to one truthful atomic transaction.
- **Expected behavior:** An open generic or prototype-bound question projects source-boundary work first. Successful execution publishes one verified exact BSL, preserves the source as immutable history, and makes the intended question Resolver Dispatchable. Invalid membership or completion publishes neither baseline nor execution record. The resolving Scenario then publishes the next Revision without mutating history.
- **Reversibility:** Other package-owned same-lineage flows may reuse or specialize the boundary pattern. The current Example Process Package deliberately limits this Obligation to QST; broader applicability requires evidence rather than kernel recognition.
- **Evidence/observations:** `test/req-prototype-question-routing.test.ts` replaces borrowed piecemeal baseline setup with exact Scenario execution, covers generic and prototype routing, verifies the baseline, rejects an incomplete boundary atomically, and proves frozen r00001 plus editable r00002 history. The package advances to `mdlm-bootstrap@0.42.0` and `bootstrap@16`.

## D-072 — Do not turn package-delegated independence into stakeholder attention

- **Status:** accepted and implemented
- **Decision:** A package-declared `delegated` Authority Requirement with attention timing `none` authorizes the generic operator to invoke the named authority in a fresh read-only session without asking the stakeholder for per-execution permission. The separate delegate supplies the exact projected authority only after producing the proposed REV or DEC output; the operating session still performs canonical Scenario execution. Reviewer packets expand every exact definition and evidence member of the frozen context through public `req show` projections. Exact reviewed Standing Delegation remains an alternative reusable execution path, not a prerequisite for package-delegated/no-attention work.
- **Alternatives:** Ask the stakeholder before every contextual Review; create and independently Review one exact-target standing-delegation DEC for every subject; let the operating session judge its own work; mark independent work autonomous without retaining the named delegate; or weaken exact REV/DEC publication.
- **Rationale:** The clean #70 pilot exposed a conflation between who must perform independent work and whether stakeholder attention is required. Contextual and simplification Reviews, Decision and PAS Reviews, and source-independent verification implementation need separation of execution context, not repeated stakeholder choice. Exact-target Standing Delegation adds more ceremony on first use and expires when the target changes.
- **Expected behavior:** Package-delegated/no-attention work starts a fresh `pi -p --no-session --no-tools` session, supplies its projected authority with `--authorize`, publishes exact Scenario authority evidence, and continues. Attended preferential questions, gates and gate corrections, scope/waiver/retirement/cancellation Decisions, change approval, pilot expansion, unavailable empirical evidence, and any separately attended progression remain stop boundaries unless exact applicable delegation is allowed and supplied.
- **Reversibility:** A future authenticated delegate adapter may replace role-string authority supply while preserving the participation distinction, fresh-context requirement, pre-adapter checks, and exact authority evidence.
- **Evidence/observations:** `test/pi-operator-instructions.test.ts` protects the package-neutral distinction and complete public reviewer packet. The clean pilot required two unnecessary stakeholder turns for MAP and STK Reviews before this correction and also exposed one discarded reviewer proposal when the exact PSP context member was not expanded. After adopting the corrected operator at pilot commit `1212562`, the next exact Review ran from public projections in a fresh no-tools session and published passing `REV-Y2CDPKHC8Q-r00001` at commit `ec8034f` with no stakeholder turn.
