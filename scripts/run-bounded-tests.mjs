import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runInProcessGroup } from "./frontier-process-group.mjs";

const budgetMs = Number(process.env.MDLM_TEST_BUDGET_MS ?? 7 * 60_000);
const temporaryParent = mkdtempSync(path.join(os.tmpdir(), "mdlm-authoritative-"));
const temporaryRoot = path.join(temporaryParent, "tests.noindex");
mkdirSync(temporaryRoot);
writeFileSync(path.join(temporaryRoot, ".metadata_never_index"), "");
let result;
try {
  result = runInProcessGroup(
    process.execPath,
    ["scripts/authoritative-tests.mjs"],
    {
      cwd: process.cwd(),
      environment: {
        TMPDIR: temporaryRoot,
        TMP: temporaryRoot,
        TEMP: temporaryRoot,
      },
      timeout: budgetMs,
      terminationGrace: 2_000,
      stdio: ["ignore", "inherit", "inherit"],
    },
  );
} finally {
  if (result && !result.timedOut) {
    rmSync(temporaryParent, { recursive: true, force: true });
  }
}

if (result.timedOut) {
  process.stderr.write(
    `Authoritative test budget exceeded ${budgetMs}ms; terminate redundant reconstruction or move route permutations to package/evaluator seams.\n`,
  );
}
process.exitCode = result.status ?? 1;
