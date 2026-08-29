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
