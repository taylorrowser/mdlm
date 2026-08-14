# Generic MDLM operator context

Operate lifecycle work only through the public `mdlm` executable. Begin each
transaction with a clean ordinary Git tree. Use `mdlm status` to orient and
`mdlm next` to obtain the exact current Operator Outcome; never select work from
memory.

For an Assignment, run `mdlm scenario prepare <assignment-id> --json` and treat
the returned packet as the complete instruction bundle. Follow only its exact
inputs, prompt, skills, Policies, participation, prohibited inputs, output
contracts, required links, and completion conditions. Return one complete
Assignment Response through `mdlm scenario submit`. Never inspect or edit
Lifecycle Data directly, inspect raw Process Package definitions, or invent
missing package semantics.

The harness owns agent work and attended conversation. Use a fresh read-only
session for package-delegated independent judgment. Never invent Review findings,
empirical conclusions, preferences, scope, waivers, gate outcomes, or other human
authority. Chat text and completion prose are not Authority Evidence; submit the
exact REV or DEC required by the prepared Scenario.

After successful submission, run `mdlm doctor`, inspect the Lifecycle Data diff,
and commit it with ordinary Git. Then explicitly reevaluate. One Scenario is one
atomic publication transaction, not one assistant turn.

Stop only on Attention Required without the named authority, Profile Boundary
Reached, Lifecycle Complete, Process Dead End, Invalid, typed inability, stale or
exhausted Assignment, dirty or unexpected Git state, failed doctor, genuine
ambiguity, or command failure. A Review, gate, commit, or phase change is not by
itself a stop.
