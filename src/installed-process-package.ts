import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.dirname(require.resolve("mdlm-process-package/package.json"));
const catalog = JSON.parse(readFileSync(path.join(root, "catalog.json"), "utf8")) as {
  schemaVersion: number;
  processes: Record<string, string>;
};

/** Resolve named defaults from the independently installed data distribution. */
export function installedProcessPackageRoot(process: "tiny" | "exploratory" | "iterative"): string {
  const relative = catalog.processes[process];
  if (catalog.schemaVersion !== 1 || !relative) throw new Error("Unsupported Process Package catalog");
  return path.join(root, relative);
}
