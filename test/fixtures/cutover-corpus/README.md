# Cutover corpus

This directory keeps the smallest exact evidence needed to compare the old and
new operator decisions during the v2 cutover. It is not a compatibility layer
or a shadow implementation.

The three retained files are copied byte-for-byte from qualified 0.79 demo
evidence. Their names identify the lane and boundary. The test pins each byte
digest and records the safety result that the v2 contract must preserve.

- `retained-051-assignment.json` preserves dispatch of one eligible Assignment.
- `retained-051-materialization.json` preserves atomic automatic publication
  before another decision. V2 may absorb this choreography, but it cannot skip
  the transaction or expose its incomplete state as an Assignment.
- `retained-052-attention.json` preserves the exact attended stakeholder
  boundary. V2 must not turn it into autonomous or delegated work.

The independently executable v2 outcome, packet, response, and submission
bytes live in `../operator-contract-v2`. Representative package fixtures own
terminal and invalid decisions. Do not grow this directory with route
permutations.

`bundles/package-0.79.0.tar.gz` contains the exact selected package bytes.
The two lane snapshot bundles contain repository descriptors, Lifecycle Data,
and active leases. `cutover-corpus.test.ts` extracts and authenticates them with
the public repository loader. Active recovery must return Assignment
`3848d89a-c926-408c-a802-113407e5de12`; the attended case must remain
Attention Required for Assignment `ca96351a-38af-4086-a5cb-5af038ab74e0`.
The old `publication-required` case changes intentionally: v2 owns that atomic
materialization inside claim and then returns the active Assignment. It may not
skip the materialized transaction or expose partial publication.
