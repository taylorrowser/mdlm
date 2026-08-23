# Phase 0 route checkpoints

These gzip archives contain JSON arrays of UTF-8 Lifecycle Data files. They are exact Scenario transaction trees captured from the public in-process command routes, not synthetic evaluator inputs or hand-written Markdown.

- `candidate-publication` stops immediately before `create-phase-0-intent-candidate@1`.
- `candidate-currentness` stops immediately before `revise-intent-candidate-after-review@3`, after the reviewed answer has replaced only the affected PSP and STK lineages.
- `corrected-gate` stops immediately before `revise-gate-signoff-after-review@2`, after the first gate Decision has failed Review.
- `corrected-gate-review-ready` stops immediately before `review-datum-in-context@2`, after correction and automatic exact Review Context materialization.
- `corrected-gate-acceptance-ready` stops immediately before `accept-phase-0-intent@1`, after the corrected gate Decision passes Review.
- `initial-intent-foundation` stops after the initial MAP and its generated exact source boundaries, immediately before attended product-intent resolution.
- `resolved-initial-intent` stops after attended product-intent resolution publishes the answered Question and exact authority Decision, immediately before their Reviews and correction.
- `review-foundation` stops after public PSP publication and immediately before automatic MAP Review Context materialization.

`manifest.json` describes each archive's compressed and uncompressed SHA-256, deterministic gzip mtime, entry count, exact Process Package digest, checkpoint, and source route. Prepared checkpoints also include a deterministic packet/lease sidecar and its capture provenance. The installer verifies those values together with confined, sorted, unique paths; transaction ownership; completed `mdlm-scenario-execution@4` provenance; response and output ownership; selected and installed package digests; sidecar package/scenario identity; and every Markdown Lifecycle Datum's exact process reference before writing any fixture data.

`test/helpers/lifecycle-data-fixture.ts` installs an archive into a newly initialized repository. For a prepared checkpoint it refreshes only the tracked-repository fingerprint. Public submission then recomputes the exact Assignment and rejects a stale or altered fixture before publication. The resumed route still validates the Lifecycle Data, exact package provenance, authority-evidence executions, links, baseline snapshots, and current obligations.

The fixtures remove repeated foundation reconstruction from the route tests. They do not replace the retained public transitions: candidate publication and atomic rejection, current-candidate replacement and Review, corrected gate Decision and Review, Phase 0 acceptance, attended initial-intent resolution, exact answer authority and correction, PSP publication, Review Context materialization, packet preparation, atomic Review rejection, classified Review publication, and autonomous correction still use command-application or deliberate true-process seams.
