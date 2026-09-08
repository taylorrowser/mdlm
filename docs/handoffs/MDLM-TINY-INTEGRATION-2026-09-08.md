# Tiny process integration evidence

This change replaces the default package with `mdlm-tiny@0.1.0`, one requirement
level, one phase, and a six-Assignment accepted-product route. It retains exact
revisions, independent content Review participation, explicit stakeholder
acceptance, immutable failed evidence, and CLI publication validation.

The tests use the ordinary `mdlm assignment submit-proposal` command. The CLI
supplies fixed publication values, required links, exact identities, and the
verification comparison. Tests run `doctor` and commit each accepted Lifecycle
Data transaction. Product code has its own Git checkout so implementation does
not change the active Assignment's lifecycle-repository fingerprint.

These are scripted integration judgments over actual executable observations.
They do not demonstrate independent agent judgment quality, autonomous runtime,
release qualification, or the operational tiny reliability gate. Observations
come from a test harness executing the named committed source. CLI validation
establishes capture shape and expected/actual consistency, not execution
authenticity.

## Current checks

The default gate runs both typechecks, builds MDLM, and executes the complete
current test files. It retains package loading, public authoring and publication,
corrective lineage, field diagnostics, array expression validation, operator
classification, response/settlement contracts, and release guard identity.

The old installed Phase 0/Phase 1 journey, cutover corpus test, and package
cutover test were deleted. Their assertions specified the replaced package.
Other historical tests remain outside the current gate. No claim is made that
those old full-V fixtures pass against the new default.

## Observed failures during integration

- The package initially removed the only tracked file from its aliases directory.
  A fresh checkout then failed loading with ENOENT. Restoring `.gitkeep` fixed
  the fresh-checkout and packed-artifact contract.
- An initial diagnostic-response fixture overwrote the scaffold's fixed
  publication value. This was a test authoring error, not a package dead end.
  The final journey uses ordinary authored submission and lets the CLI derive
  these values.
- Extracting package-neutral classification tests initially removed an import
  still used by one historical test. Typecheck caught the extraction error and
  the import was restored.

The first diagnostic-submit experiment completed all three executable routes,
then was replaced with the ordinary authoring route before final validation.
Its timings are not the final process measurements.

## Final ordinary-route measurements

| Route | Accepted Assignments/publications | Real program executions | Wall time |
| --- | ---: | ---: | ---: |
| Correct product | 6 | 2 | 21.356 s |
| Wrong code, corrected | 8 | 4 | 22.593 s |
| Wrong expectation, corrected with unchanged code | 10 | 4 | 27.513 s |
| Failed content Review, corrected requirement | 8 | 2 | 21.875 s |
| Installed correct product, including pack/install | 6 | 2 | 23.215 s |

Each source route includes malformed-field rejection and correction. The correct
product route additionally rejects duplicate requirement case IDs, an incomplete
observation capture, and acceptance without the required authority. Rejection
preserves Lifecycle Data and the active Assignment. Fixed values and links are
absent from the authored proposal and supplied by the CLI.

`npm test` passed 22 tests in seven files, including both typechecks and build,
in 108.83 s with 683,684 KiB maximum RSS. The separately selected installed
journey passed in 23.71 s with 150,992 KiB maximum RSS. Both commands ran under
`flock --wait 900 /tmp/mdlm-development-test.lock` with a 240 s gate bound and a
180 s installed bound. These source-development checks did not invoke the
one-shot release qualification guard.

Native logs are [current-gate.log](tiny-process-evidence-2026-09-08/current-gate.log)
and [installed.log](tiny-process-evidence-2026-09-08/installed.log).
[Captured journey evidence](tiny-process-evidence-2026-09-08/journeys.json)
preserves route/Assignment identities, source commits and program text, actual
Lifecycle Data, failed observations, corrective links, acceptance, and the
installed archive digest. The test source is
[`tiny-process-journey.test.ts`](../../test/tiny-process-journey.test.ts).

Compared with source `31a2eac`, the package shrinks from 965 to 89 tracked files,
23 to 5 types, 93 to 11 scenarios, 566 to 19 selectors, 94 to 11 obligations,
and 9 to 1 phases. These are source structure counts. The prior audit's
174-transaction operational demo is a different measurement and cannot be used
as a controlled runtime baseline for these scripted tests.
