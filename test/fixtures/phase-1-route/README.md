# Phase 1 route checkpoints

These archives contain exact UTF-8 Lifecycle Data transaction trees captured from retained public in-process command routes. They are not synthetic evaluator records.

`phase-1-vai-correction-ready` stops immediately before the failed Review of pilot VAI r1. It includes the exact Review Contexts and the preceding passing Review with its completed Scenario execution. The resumed route still publishes the failed Review, submits the autonomous VAI correction and authorization, finalizes the replacement Review Context, rejects a run for superseded r1, and prepares Review of corrected r2 through the command application.

`manifest.json` records the compressed and uncompressed SHA-256 digests, entry count, zero gzip-header timestamp, exact selected Process Package identity, source commit/tree, checkpoint, and capture route. `test/helpers/current-lifecycle-data-fixture.ts` verifies those fields before installing any file. Every archived Lifecycle Datum must carry the manifest's exact package reference and digest. The resumed command then performs normal repository integrity, authority-execution, baseline-snapshot, link, and current-obligation validation.

The checkpoint was captured from the named corrected-VAI test at commit `f41a24e39d9d530d3c53831ebcd144d9270f1367` after restoring the full public Review loop. The bounded capture passed in `/tmp/issue-203-phase-1-vai-fixture-capture.log` (exit 0, 99,615 ms). The uncompressed JSON was compressed twice with `gzip -n -9`; the outputs were byte-identical and the archive header timestamp bytes are zero.
