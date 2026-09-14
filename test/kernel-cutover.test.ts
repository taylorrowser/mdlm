import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "vitest";

test("runtime has no Assignment lease or Scenario dispatch implementation", async () => {
  const files = await readdir(path.join(process.cwd(), "src"));
  expect(files.filter(name => /^(assignment|scenario|operator-outcome|pending-work|obligation)/.test(name))).toEqual([]);
  const violations: string[] = [];
  for (const file of files.filter(name => name.endsWith(".ts"))) {
    const source = await readFile(path.join(process.cwd(), "src", file),"utf8");
    if (/\b(claimNextWork|submitAssignmentResponse|submitPreparedResolverScenario|dryRunResolverScenario|nextWorkProjection)\b/.test(source)) violations.push(file);
  }
  expect(violations).toEqual([]);
});
