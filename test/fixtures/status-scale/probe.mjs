import { readFile } from "node:fs/promises";
import { evaluateLifecycle, loadProcessPackage } from "../../../dist/index.js";
import { dryRunResolverScenario } from "../../../dist/scenario-dry-run.js";

const fixture = JSON.parse(
  await readFile(new URL("decimal-run-025-snapshot.json", import.meta.url), "utf8"),
);
const snapshot = fixture.snapshot;
if (snapshot.records.length !== 58) {
  throw new Error(`Expected 58 lifecycle records, received ${snapshot.records.length}`);
}

const map = snapshot.records.find((record) => record.datum.type === "MAP");
const indexedQuestion = snapshot.records
  .filter((record) =>
    record.datum.type === "QST" &&
    map?.datum.links.some((link) =>
      link.type === "indexes" && link.target === record.datum.id
    )
  )
  .sort((left, right) => right.datum.revision - left.datum.revision)[0];
const mapReview = snapshot.records.find((record) =>
  record.datum.type === "REV" &&
  record.datum.links.some((link) =>
    link.type === "reviews" && link.target === map?.datum.revision_id
  )
);
const mapContextTarget = mapReview?.datum.links.find(
  (link) => link.type === "contextualizes",
)?.target;
const mapContext = snapshot.records.find(
  (record) => record.datum.revision_id === mapContextTarget,
);
if (!map || !indexedQuestion || !mapReview || !mapContext) {
  throw new Error("Expected the captured MAP review and indexed Question");
}
mapContext.datum.payload.definition_members = [
  map.datum.revision_id,
  indexedQuestion.datum.revision_id,
].sort();

const loaded = await loadProcessPackage(".lifecycle/process");
if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
const evaluation = evaluateLifecycle(loaded.package, snapshot);
const assignmentWork = evaluation.obligations.find(
  (item) => item.actionableResolver === "create-phase-0-intent-candidate@1",
);
if (!assignmentWork) throw new Error("Expected a dispatchable intent-candidate Assignment");

const prepared = await dryRunResolverScenario(
  loaded.package,
  snapshot,
  assignmentWork.actionableResolver,
  assignmentWork.id,
  [],
  evaluation,
);
if (!prepared.ok) throw new Error(JSON.stringify(prepared.diagnostics));
process.stdout.write(`${JSON.stringify({
  records: snapshot.records.length,
  scenario: prepared.value.definition.scenario,
  invocations: prepared.value.invocations.length,
})}\n`);
