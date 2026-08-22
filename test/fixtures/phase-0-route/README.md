# Phase 0 route checkpoints

These gzip archives contain JSON arrays of UTF-8 Lifecycle Data files. They are exact Scenario transaction trees captured from the public in-process command routes, not evaluator records or hand-written Markdown.

- `candidate-publication` stops immediately before `create-phase-0-intent-candidate@1`.
- `candidate-currentness` stops immediately before `revise-intent-candidate-after-review@3`, after the reviewed answer has replaced only the affected PSP and STK lineages.
- `corrected-gate` stops immediately before `revise-gate-signoff-after-review@2`, after the first gate Decision has failed Review.

The archives use deterministic gzip headers. Their uncompressed SHA-256 digests are:

- `candidate-publication`: `863802070d55e997105463f69805e13bd5b8d505de19fc816cd7dbe196b6544c`
- `candidate-currentness`: `d1e721228716094272d76e43f243d06ffd2b5d4b908dfa0e193a2f098e6bf921`
- `corrected-gate`: `7135250bb077fb61513df5e6c63635b62264eff965269c05e8e8c38b0274a35d`

`test/helpers/lifecycle-data-fixture.ts` installs an archive into a newly initialized repository. The resumed public command must load and validate the records, exact package provenance, authority-evidence executions, links, baseline snapshots, and current obligations before it can prepare or publish the next Assignment.

The fixtures remove repeated foundation reconstruction from the route tests. They do not replace the retained public transitions: candidate publication and atomic rejection, current-candidate replacement and Review, corrected gate Decision and Review, and Phase 0 acceptance still run through `executeCommandApplication`.
