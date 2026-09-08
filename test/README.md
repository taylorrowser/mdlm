# Current test gate

`npm test` checks both package types, builds MDLM, and runs the whole files named
in `vitest.cutover.config.ts`. These files cover the one-level tiny Process
Package, real public CLI delivery and correction, schema field diagnostics,
operator classification, symbolic response contracts, persisted settlement
identity, and release guard identity.

`npm run test:release` adds the Pi public operator contract and repeats the tiny
journey through an npm-packed installation. This command remains the host's
release qualification entrypoint. Running its constituent tests during source
development is not release qualification or permission to start a demo.

The tiny journey captures actual stdin/stdout/stderr/exit status from a separate
committed product checkout. It exercises correct code, wrong code followed by
correction, and wrong expectations followed by correction with unchanged code.
It rejects malformed submissions before publication and verifies that accepted
work uses the replacement requirement, implementation, and fresh result.
Each route prints a `TINY_JOURNEY` JSON measurement. Set `MDLM_TINY_EVIDENCE` to a
path prefix to preserve each route's measurements. Failed runs retain their
fresh temporary directory and `failure.json`.

The previous installed Phase 0/Phase 1 tracer, old cutover corpus assertions,
and old package cutover assertions were removed because they specified the
replaced default. Package-neutral classification tests were moved to their own
file rather than discarded with those route assumptions. The schema diagnostic
regression also has its own file so it does not require a removed STK type.

Other historical full-V tests remain outside the current gate. They are useful
reference material for retained kernel capabilities, but their package fixtures
do not describe the supported tiny default. A passing current gate does not
claim those historical files pass. Add or adapt a retained kernel regression to
the current gate when a source change affects its guarantee; do not resurrect
the old hierarchy just to satisfy its fixture.
