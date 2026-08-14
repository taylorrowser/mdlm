import { promises as fs } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { structuralValuesEqual } from "./structural-equality.js";
import {
  evaluateLifecycle,
  loadProcessPackage,
  type LifecycleSnapshot,
  type ProcessDiagnostic,
} from "./index.js";

export interface FixtureTestSummary {
  passed: number;
  failed: number;
  fixtures: {
    name: string;
    passed: boolean;
    diagnostics: ProcessDiagnostic[];
  }[];
}

type Result<T> =
  | { ok: true; value: T }
  | { ok: false; diagnostics: ProcessDiagnostic[] };

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

/** Evaluate every declared Process Package fixture without mutating the package. */
export async function testProcessFixtures(
  root: string,
): Promise<Result<FixtureTestSummary>> {
  const loaded = await loadProcessPackage(root);
  if (!loaded.ok) return { ok: false, diagnostics: loaded.diagnostics };
  const fixturesRoot = path.join(root, "fixtures");
  const names = await exists(fixturesRoot)
    ? (await fs.readdir(fixturesRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
    : [];
  const fixtures = await Promise.all(names.map(async (name) => {
    const fixtureRoot = path.join(fixturesRoot, name);
    const diagnostics: ProcessDiagnostic[] = [];
    try {
      const snapshot = parse(
        await fs.readFile(path.join(fixtureRoot, "snapshot.yaml"), "utf8"),
      ) as LifecycleSnapshot;
      const expected = JSON.parse(
        await fs.readFile(path.join(fixtureRoot, "expected.json"), "utf8"),
      ) as Record<string, unknown>;
      const expectedPath = path.join(fixtureRoot, "expected.json");
      const packageReference =
        `${loaded.package.manifest.id}@${loaded.package.manifest.version}`;
      if (
        expected.schemaVersion !== 1 ||
        expected.package !== packageReference ||
        expected.snapshot !== "snapshot.yaml" ||
        typeof expected.evaluation !== "object" ||
        expected.evaluation === null
      ) {
        diagnostics.push({
          code: "fixture-contract",
          path: expectedPath,
          message: `Fixture '${name}' must name schema version 1, '${packageReference}', snapshot.yaml, and an expected evaluation`,
        });
      } else {
        const actual = evaluateLifecycle(loaded.package, snapshot);
        if (!structuralValuesEqual(actual, expected.evaluation)) {
          diagnostics.push({
            code: "fixture-result-mismatch",
            path: expectedPath,
            message: `Fixture '${name}' evaluation does not match its expected result`,
          });
        }
      }
    } catch (error) {
      diagnostics.push({
        code: "fixture-load",
        path: fixtureRoot,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return { name, passed: diagnostics.length === 0, diagnostics };
  }));
  return {
    ok: true,
    value: {
      passed: fixtures.filter((fixture) => fixture.passed).length,
      failed: fixtures.filter((fixture) => !fixture.passed).length,
      fixtures,
    },
  };
}
