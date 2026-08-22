# Phase 0 route checkpoints

These gzip archives contain JSON arrays of UTF-8 Lifecycle Data files. They are exact Scenario transaction trees captured from the public in-process command routes, not evaluator records or hand-written Markdown.

- `candidate-publication` stops immediately before `create-phase-0-intent-candidate@1`.
- `candidate-currentness` stops immediately before `revise-intent-candidate-after-review@3`, after the reviewed answer has replaced only the affected PSP and STK lineages.
- `corrected-gate` stops immediately before `revise-gate-signoff-after-review@2`, after the first gate Decision has failed Review.
- `initial-intent-foundation` stops after the initial MAP and its generated exact source boundaries, immediately before attended product-intent resolution.
- `resolved-initial-intent` stops after attended product-intent resolution publishes the answered Question and exact authority Decision, immediately before their Reviews and correction.
- `review-foundation` stops after public PSP publication and immediately before automatic MAP Review Context materialization.

`manifest.json` records each archive's compressed and uncompressed SHA-256, deterministic gzip mtime, entry count, exact Process Package digest, checkpoint, and source route. The installer verifies those values together with confined, sorted, unique paths; transaction ownership; completed `mdlm-scenario-execution@4` provenance; response and output ownership; selected and installed package digests; and every Markdown record's exact process reference before writing any fixture data.

`test/helpers/lifecycle-data-fixture.ts` installs an archive into a newly initialized repository. The resumed public command must load and validate the records, exact package provenance, authority-evidence executions, links, baseline snapshots, and current obligations before it can prepare or publish the next Assignment.

The fixtures remove repeated foundation reconstruction from the route tests. They do not replace the retained public transitions: candidate publication and atomic rejection, current-candidate replacement and Review, corrected gate Decision and Review, Phase 0 acceptance, attended initial-intent resolution, exact answer authority and correction, PSP publication, Review Context materialization, packet preparation, atomic Review rejection, classified Review publication, and autonomous correction still use command-application or deliberate true-process seams.
