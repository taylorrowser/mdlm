import { promises as fs } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

export type LifecycleDataFixture =
  | "candidate-publication"
  | "candidate-currentness"
  | "corrected-gate"
  | "initial-intent-foundation"
  | "resolved-initial-intent"
  | "review-foundation";

type FixtureEntry = { path: string; source: string };

function fixtureEntries(value: unknown): FixtureEntry[] {
  if (!Array.isArray(value) || value.some((entry) =>
    typeof entry !== "object" || entry === null ||
    typeof (entry as FixtureEntry).path !== "string" ||
    typeof (entry as FixtureEntry).source !== "string"
  )) {
    throw new Error("Invalid Lifecycle Data fixture");
  }
  return value as FixtureEntry[];
}

export async function installLifecycleDataFixture(
  repository: string,
  fixture: LifecycleDataFixture,
): Promise<void> {
  const archive = path.join(
    process.cwd(),
    "test/fixtures/phase-0-route",
    `${fixture}.data.json.gz`,
  );
  const entries = fixtureEntries(JSON.parse(
    gunzipSync(await fs.readFile(archive)).toString("utf8"),
  ));
  const dataRoot = path.join(repository, ".lifecycle/data");
  await fs.rm(dataRoot, { recursive: true, force: true });
  await fs.mkdir(dataRoot, { recursive: true });
  for (const entry of entries) {
    const target = path.resolve(dataRoot, entry.path);
    if (!target.startsWith(`${path.resolve(dataRoot)}${path.sep}`)) {
      throw new Error(`Lifecycle Data fixture path escapes its root: ${entry.path}`);
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, entry.source, { flag: "wx" });
  }
}
