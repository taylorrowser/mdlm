import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

function formatDuration(durationMs) {
  return `${(durationMs / 1_000).toFixed(2)}s`;
}

function sum(entries, select) {
  return entries.reduce((total, entry) => total + select(entry), 0);
}

function groupRows(entries, key) {
  return [...Map.groupBy(entries, key)]
    .map(([name, members]) => ({
      name,
      files: members.length,
      durationMs: sum(members, (entry) => entry.durationMs),
    }))
    .sort((left, right) => right.durationMs - left.durationMs || left.name.localeCompare(right.name));
}

export function readTestCostFragments(fragmentPaths, manifest) {
  const manifestByFile = new Map(manifest.map((entry) => [entry.file, entry]));
  return fragmentPaths.map((fragmentPath) => {
    const observed = JSON.parse(readFileSync(fragmentPath, "utf8"));
    const declaration = manifestByFile.get(observed.file);
    if (!declaration) throw new Error(`Test cost reporter observed an unclassified file: ${observed.file}`);
    return { ...observed, ...declaration };
  });
}

export function formatTestCostReport({ gate, startedAt, elapsedMs, entries, selectedFileCount }) {
  const ordered = [...entries].sort((left, right) =>
    right.durationMs - left.durationMs || left.file.localeCompare(right.file));
  const observedTotalMs = sum(ordered, (entry) => entry.durationMs);
  const lines = [
    "# Root test cost report",
    "",
    `Gate: ${gate}`,
    `Started: ${startedAt}`,
    `Runner elapsed: ${formatDuration(elapsedMs)}`,
    `Files observed: ${ordered.length}/${selectedFileCount}`,
    `Summed file time: ${formatDuration(observedTotalMs)}`,
    "",
    "## Runtime classes",
    "",
    "| Runtime class | Files | Summed file time |",
    "| --- | ---: | ---: |",
    ...groupRows(ordered, (entry) => entry.runtimeClass)
      .map((row) => `| ${row.name} | ${row.files} | ${formatDuration(row.durationMs)} |`),
    "",
    "## Qualification gates",
    "",
    "| Gate | Files | Summed file time |",
    "| --- | ---: | ---: |",
    ...groupRows(ordered, (entry) => entry.qualificationGate)
      .map((row) => `| ${row.name} | ${row.files} | ${formatDuration(row.durationMs)} |`),
    "",
    "## Files",
    "",
    "| File | Runtime class | Gate | File time | Model |",
    "| --- | --- | --- | ---: | ---: |",
    ...ordered.map((entry) =>
      `| ${entry.file} | ${entry.runtimeClass} | ${entry.qualificationGate} | ${formatDuration(entry.durationMs)} | ${formatDuration(entry.measuredDurationMs)} |`),
    "",
    "File time comes from Vitest's completed module result. The runner elapsed value includes scheduling, process startup, and idle overlap, so it should not equal the summed file time.",
    "",
  ];
  return lines.join("\n");
}

export function writeTestCostReport(reportPath, report) {
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, report);
}
