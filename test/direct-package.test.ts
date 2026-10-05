import { installedProcessPackageRoot } from "../src/installed-process-package.js";
import path from "node:path";
import { expect, test } from "vitest";
import { loadProcessPackage } from "../src/index.js";

for (const name of ["process", "exploratory", "iterative"] as const) test(`${name} exposes direct actions and no scheduling definitions`, async () => {
  const result = await loadProcessPackage(installedProcessPackageRoot(name === "process" ? "tiny" : name));
  expect(result.diagnostics).toEqual([]);
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  expect(result.package.manifest.direct_contract).toBe("mdlm-direct@1");
  const actions = (result.package as unknown as {actions:Record<string,unknown>}).actions;
  expect(Object.keys(actions).length).toBeGreaterThan(0);
  expect(result.package).not.toHaveProperty("scenarios");
  expect(result.package).not.toHaveProperty("obligations");
});
