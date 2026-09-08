import path from "node:path";
import { expect, test } from "vitest";
import { loadProcessPackage } from "../src/index.js";

test("the default tiny package loads without optional lifecycle layers", async () => {
  const loaded = await loadProcessPackage(path.join(process.cwd(), ".lifecycle/process"));
  expect(loaded.ok, loaded.ok ? "" : JSON.stringify(loaded.diagnostics, null, 2)).toBe(true);
  if (!loaded.ok) return;
  expect(loaded.package.manifest.id).toBe("mdlm-tiny");
  expect(Object.keys(loaded.package.types).sort()).toEqual(["ACC", "IMP", "REQ", "RES", "REV"]);
  expect(Object.keys(loaded.package.phases)).toEqual(["phase-0-tiny-product"]);
});
