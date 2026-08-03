# MDLM bootstrap process package v0.2

This experimental package implements the typed declarative model described in
[`docs/mdlm-process-package-reference-v0.2.md`](../../docs/mdlm-process-package-reference-v0.2.md).
It remains intentionally limited to `PSP`, `STK`, `SYS`, `REV`, `BSL`, `QST`, and
`DEC`. These are a bootstrap subset of the bundled V-model Example Process Package,
not lifecycle types recognized by MDLM core. The package has not yet migrated to
the v0.8 textual expression or explicit Kernel Capability binding formats.

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
4. reject removed requirements, widened constraints, incompatible properties, or
   duplicate inherited outgoing-link IDs;
5. add the final type payload fragment and source-owned links;
6. set the flattened payload schema to reject unknown fields.

`req schema STK` should expose the resulting envelope, payload schema, link
contracts, lifecycle behavior, and review-policy result.

## Evaluator

All declarative behavior uses:

- the primitive catalog in `primitives/kernel-v1.yaml`;
- parameterized selectors in `selectors/`;
- the shared expression grammar in `meta/expression.schema.json`;
- machine policies in `policies/*.yaml`.

A process rule must not request a process-specific kernel fact. Conclusions such
as “passing review,” “current candidate,” and “members missing review” are named
selectors assembled from primitive collections, graph relations, integrity
paths, states, and policies.

Expressions contain values (`literal`, `var`, `path`, `state`, `policy`, and
`count`), comparisons, boolean composition, and relational quantifiers (`exists`,
`none`, and `every`). They cannot execute arbitrary code or produce side effects.

## Links

Outgoing link contracts live on their source type. Backlinks are computed. The
same relationship ID may be declared by several source types with different
allowed target types; each source definition is authoritative for its own links.

## Scope

Phase 0 and Phase 2 are marked `bootstrap-subset`. DWP, architecture, interfaces,
verification, implementation, change, full simplification, and complete promotion
semantics remain deferred. The package tests the evaluator seam before lifecycle
breadth.
