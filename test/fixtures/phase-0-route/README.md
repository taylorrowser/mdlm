# Phase 0 route checkpoints

These gzip archives contain JSON arrays of UTF-8 Lifecycle Data files. They are exact Scenario transaction trees captured from the public in-process command routes, not evaluator records or hand-written Markdown.

- `candidate-publication` stops immediately before `create-phase-0-intent-candidate@1`.
- `candidate-currentness` stops immediately before `revise-intent-candidate-after-review@3`, after the reviewed answer has replaced only the affected PSP and STK lineages.
- `corrected-gate` stops immediately before `revise-gate-signoff-after-review@2`, after the first gate Decision has failed Review.
- `initial-intent-foundation` stops after the initial MAP and its generated exact source boundaries, immediately before attended product-intent resolution.
- `review-foundation` stops after public PSP publication and immediately before automatic MAP Review Context materialization.

The archives use deterministic gzip headers. Their uncompressed SHA-256 digests are:

- `candidate-publication`: `863802070d55e997105463f69805e13bd5b8d505de19fc816cd7dbe196b6544c`
- `candidate-currentness`: `d1e721228716094272d76e43f243d06ffd2b5d4b908dfa0e193a2f098e6bf921`
- `corrected-gate`: `7135250bb077fb61513df5e6c63635b62264eff965269c05e8e8c38b0274a35d`
- `initial-intent-foundation`: `b9b560310529d393d0509445286c58a794697d4ea5f0edd777dbb84f8f745eca`
- `review-foundation`: `9839fb1bbe50630f79495586d2d14ff9197fa210bbc875b22986389b6a04cedb`

`test/helpers/lifecycle-data-fixture.ts` installs an archive into a newly initialized repository. The resumed public command must load and validate the records, exact package provenance, authority-evidence executions, links, baseline snapshots, and current obligations before it can prepare or publish the next Assignment.

The fixtures remove repeated foundation reconstruction from the route tests. They do not replace the retained public transitions: candidate publication and atomic rejection, current-candidate replacement and Review, corrected gate Decision and Review, Phase 0 acceptance, attended initial-intent resolution, exact answer authority and correction, PSP publication, Review Context materialization, packet preparation, atomic Review rejection, classified Review publication, and autonomous correction still use command-application or deliberate true-process seams.
