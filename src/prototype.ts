#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { executeCommandApplication } from "./command-application.js";
import {
  evaluateLifecycle,
  loadProcessPackage,
  resolveType,
  type LifecycleSnapshot,
} from "./index.js";

const repositoryRoot = process.cwd();
const snapshot = process.argv[2] ?? "examples/psp-to-sys-snapshot.yaml";
const execution = await executeCommandApplication(
  [
    "loose-ends",
    "--ref",
    ".lifecycle/process",
    "--snapshot",
    snapshot,
  ],
  repositoryRoot,
);

if (execution.exitCode === 0) {
  const loaded = await loadProcessPackage(
    path.join(repositoryRoot, ".lifecycle/process"),
  );
  if (loaded.ok) {
    const lifecycleSnapshot = parse(
      await fs.readFile(path.resolve(repositoryRoot, snapshot), "utf8"),
    ) as LifecycleSnapshot;
    const resolved = resolveType(loaded.package, "STK");
    const evaluation = evaluateLifecycle(loaded.package, lifecycleSnapshot);
    const lines = [
      `Process package: ${loaded.package.manifest.id}@${loaded.package.manifest.version}`,
      `Snapshot: ${snapshot}`,
      ...(resolved.ok
        ? [
            `Resolved STK templates: ${resolved.type.templateChain.join(" → ")}`,
            `Resolved STK payload fields: ${resolved.type.payloadSchema.required.join(", ")}`,
          ]
        : []),
      "",
      "Computed artifact states:",
      ...Object.entries(evaluation.artifacts).map(([revision, artifact]) =>
        `- ${revision}: ${JSON.stringify(artifact.states)}`
      ),
      "",
    ];
    process.stdout.write(`${lines.join("\n")}\n`);
  }
}
process.stdout.write(execution.output);
process.exitCode = execution.exitCode;
