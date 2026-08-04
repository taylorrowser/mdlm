# MDLM bootstrap process package v0.23

This experimental package is migrating the typed declarative model described in
[`docs/mdlm-process-package-reference-v0.2.md`](../../docs/mdlm-process-package-reference-v0.2.md)
toward the accepted v0.8 design. It remains intentionally limited to `PSP`, `STK`,
`SYS`, `REV`, `BSL`, `QST`, and `DEC`. These are a bootstrap subset of the bundled
V-model Example Process Package, not lifecycle types recognized by MDLM core.

The package can be explicitly installed and selected with the package-neutral
`req process install` and `req process use` commands. The recorded selection
includes its exact package version, expression-language version, and content
digest. `req process show`, `validate`, and `capabilities` expose the same semantic
projection in human-readable or JSON form without implicitly selecting this
Example Process Package. `req process expression evaluate` addresses a compiled
definition field in its authored binding and result-type context; generic Relation,
Selector, Policy, Computed State, and Obligation evaluation commands expose the
same deterministic package execution with source-span evidence. Generic Phase
status, Loose End, and next-work commands retain exact gate, blocker, resolver
output, Dispatchability, and waiver dimensions without embedding these example
Phase or type IDs in the executable. `req process init` may copy this package
under a new identity with exact source provenance, but that independently
versioned copy is ordinary package data rather than inherited kernel behavior.
The same command can create an empty package containing only the supported
meta-schema, Datum Envelope, primitive catalog, and empty authored catalogs.

The package declares `mdlm-expression@1`. Every expression-bearing bootstrap
definition now uses textual source compiled at package load, including finite
universal predicates over typed Selector results. Authored YAML expression trees
are rejected by both meta-schema and semantic validation. The package explicitly
binds `BSL` to the versioned `exact-baseline@1` Kernel Capability; the kernel does
not recognize `BSL` by ID.

## Ownership

The kernel owns the datum envelope, identity, revisions, immutability, graph
storage, hashing, primitive relations, and deterministic evaluation. The process
package owns payload templates and types, outgoing-link contracts, policies,
states, selectors, obligations, scenarios, phases, prompts, and skills.

The compatibility copy at `meta/datum-envelope.schema.json` cannot redefine the
kernel. A kernel accepts it only when its known schema ID and contract version
match.

## Resolution order

To resolve a lifecycle type:

1. load the kernel datum envelope;
2. follow the type's single template chain from root to leaf;
3. add required payload fields and compatible property constraints;
4. reject nested required-field removal, widened constraints, incompatible
   property types, or duplicate inherited outgoing-link IDs;
5. allow only deterministic narrowing through enum subsets, stronger lower and
   upper bounds, preserved patterns and formats, recursive item/object schemas,
   and added constraints;
6. add the final type payload fragment and source-owned links;
7. set the flattened payload schema to reject unknown fields.

`req schema STK` should expose the resulting envelope, payload schema, link
contracts, lifecycle behavior, and review-policy result.

## Evaluator

All declarative behavior uses:

- the primitive catalog in `primitives/kernel-v1.yaml`;
- parameterized selectors in `selectors/`;
- the textual expression source contract in `meta/expression.schema.json`;
- machine policies in `policies/*.yaml`.

A process rule must not request a process-specific kernel fact. Conclusions such
as “passing review,” “current candidate,” and “members missing review” are named
selectors assembled from primitive collections, graph relations, integrity
paths, states, and policies.

Obligation status rules may declare exact blocking Obligation subjects with
textual expressions. Evaluation separates the eventual Resolver Scenario from
the currently actionable resolver and marks work Dispatchable only when the
status permits action, every binding resolves, and no exact blocker remains.
Blocker chains use exact Obligation Instance identities; presentation still puts
ready work before blocked work without changing Obligation truth. Every result
also exposes the eventual Resolver Scenario's typed output cardinalities and
required links. Waiver evidence is discovered through package-owned outgoing-link
contracts targeting exact Obligation Instances, then judged by the referenced
Waiver Policy. Only an exact, reviewed, unexpired structured waiver suppresses
work; generic justification remains ordinary evidence. Callers may supply named
historical repository snapshots alongside the current snapshot. Each is evaluated
independently through the same package rules and returned under
`obligationHistory`, preserving exact definition-version, subject-Revision, and
process-reference identity without introducing a historical lifecycle type.

Phase entry, candidate selection, and gate completion are evaluated directly
from each selected Phase's textual expressions. Each selected exact candidate
receives an independent gate result with authored expression source, exact Policy
and Selector evidence, and the blocker and Resolver Scenario evidence from the
package-declared gate Obligation. Candidate revisions therefore never inherit or
mutate earlier gate evidence. The evaluator recognizes neither a Phase ID nor a
candidate lifecycle type.

The accepted authoring surface is the textual MDLM Expression Language. The
implemented slices support typed bound variables, entity and context paths,
JSON-like literals, comparisons, membership, Boolean composition, parentheses,
presence checks, typed `select`, `exists`, `none`, `count`, and `one` Selector
operations, `state(subject, dimension)`, typed Policy result-field selection, and
`every(selector, arguments, binding => predicate)` over finite Selector results.
Package loading reconciles the manifest and loaded catalogs, validates exact
cross-definition references, arguments, bindings, and result types, and rejects
complete Template, Selector, Computed State, and Policy dependency cycles.
Resolver bindings must cover exactly the Scenario inputs with compatible identity,
types, and cardinality. Scenario output types, prohibited-input conflicts, required-
link targets, source-owned link availability, target types, and cardinalities are
also validated before the package is exposed. The kernel's `dependency-changes`
relation emits deterministic `dependency-change@1` content, outbound-link, and
stable-link-resolution records from exact Revision comparisons. When
`exact-baseline@1` is bound, the same comparison service adds membership,
composition, evidence-target, and explicitly identified review-context variants
for the package-selected type without recognizing its ID. Package selectors, not
the kernel, decide which typed records imply Staleness, and Computed State
explanations identify the exact structural evidence selected by the package rule. `mdlm-expression@1` textual source is
the only accepted authoring representation and cannot execute arbitrary code or
produce side effects.

## Kernel Capability

The manifest binds `exact-baseline@1` to `BSL`. Package loading validates the
bound type's managed definition-member, evidence, and snapshot payload paths and
its exact `composes` contract. Baseline collections and membership, evidence, and
composition relations are available only through that binding. A compatible
package may bind a differently named type and receive the same evaluator
behavior and capability-scoped change records.

## Links

Outgoing link contracts live on their source type. Backlinks are computed. The
same relationship ID may be declared by several source types with different
allowed target types; each source definition is authoritative for its own links.

## Scope

Phase 0 and Phase 2 are marked `bootstrap-subset`. DWP, architecture, interfaces,
verification, implementation, change, full simplification, and complete promotion
semantics remain deferred. The package tests the evaluator seam before lifecycle
breadth.
