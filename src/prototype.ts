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
const packagePath = path.join(repositoryRoot, ".lifecycle/process");
const snapshotPath = path.resolve(
  repositoryRoot,
  process.argv[2] ?? "examples/psp-to-sys-snapshot.yaml",
);
const validation = await executeCommandApplication(
  ["process", "validate", "--ref", packagePath],
  repositoryRoot,
);

if (validation.exitCode !== 0) {
  process.stdout.write(validation.output);
  process.exitCode = validation.exitCode;
} else {
  const loaded = await loadProcessPackage(packagePath);
  if (!loaded.ok) {
    for (const diagnostic of loaded.diagnostics) {
      console.error(
        `${diagnostic.code}: ${diagnostic.path ?? ""} ${diagnostic.message}`,
      );
    }
    process.exitCode = 1;
  } else {
    const snapshot = parse(
      await fs.readFile(snapshotPath, "utf8"),
    ) as LifecycleSnapshot;
    const resolved = resolveType(loaded.package, "STK");
    const evaluation = evaluateLifecycle(loaded.package, snapshot);

    console.log(
      `Process package: ${loaded.package.manifest.id}@${loaded.package.manifest.version}`,
    );
    console.log(`Snapshot: ${path.relative(repositoryRoot, snapshotPath)}`);
    if (resolved.ok) {
      console.log(
        `Resolved STK templates: ${resolved.type.templateChain.join(" → ")}`,
      );
      console.log(
        `Resolved STK payload fields: ${resolved.type.payloadSchema.required.join(", ")}`,
      );
    }
    console.log("");
    console.log("Computed artifact states:");
    for (const [revision, artifact] of Object.entries(evaluation.artifacts)) {
      console.log(`- ${revision}: ${JSON.stringify(artifact.states)}`);
    }
    console.log("");
    console.log(`Loose ends (${evaluation.looseEnds.length}):`);
    for (const looseEnd of evaluation.looseEnds) {
      console.log(
        `- [${looseEnd.status}] ${looseEnd.obligation} for ${looseEnd.subject}`,
      );
      console.log(`  Why: ${looseEnd.explanation}`);
      console.log(`  Dispatchable: ${looseEnd.dispatchable}`);
      console.log(`  Eventual resolver: ${looseEnd.eventualResolver}`);
      console.log(
        `  Actionable resolver: ${looseEnd.actionableResolver ?? "none"}`,
      );
    }
    if (evaluation.diagnostics.length > 0) {
      console.log("");
      console.log("Evaluation diagnostics:");
      for (const diagnostic of evaluation.diagnostics) {
        console.log(`- ${diagnostic.code}: ${diagnostic.message}`);
      }
      process.exitCode = 1;
    }
  }
}
