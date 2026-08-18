# Phase-hardening evaluator fixtures

These JSON files are synthetic evaluator snapshots, not serialized MDLM
repositories or canonical Lifecycle Data. Their `processRef` deliberately uses
the non-digest suffix `#synthetic-evaluator`, and each file declares
`canonical_lifecycle_evidence: false`.

The fixtures provide compact relational states for selector, Obligation, and
terminal-outcome tests. They must not be used as migration, provenance,
baseline-finalization, or public behavioral evidence. Public CLI integration
coverage creates and finalizes its Lifecycle Data through supported commands.
