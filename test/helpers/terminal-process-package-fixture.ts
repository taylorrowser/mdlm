import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import type { ProcessPackage } from "../../src/index.js";

const FIXTURE_ROOT = path.join(
  process.cwd(),
  "test/fixtures/operator-terminal-process-package",
);
const PROCESS_ROOT = "operator-terminal-process-package-fixture";
const DEFINITION_GROUPS = [
  "templates",
  "types",
  "policies",
  "states",
  "selectors",
  "obligations",
  "scenarios",
  "phases",
  "profiles",
  "aliases",
  "primitives",
] as const;

interface FixtureManifest {
  contract: "mdlm-operator-terminal-process-package-fixture@1";
  schemaVersion: 1;
  artifact: {
    archive: string;
    compression: "gzip -n -9";
    compressedSha256: string;
    contentSha256: string;
    gzipHeaderMtime: 0;
  };
  processPackage: {
    root: typeof PROCESS_ROOT;
    reference: "terminal-fixture@1.0.0";
    definitionCount: 9;
  };
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function assertManifest(value: unknown): asserts value is FixtureManifest {
  const manifest = value as Partial<FixtureManifest> | null;
  const artifact = manifest?.artifact;
  const processPackage = manifest?.processPackage;
  if (
    typeof manifest !== "object" || manifest === null ||
    manifest.contract !== "mdlm-operator-terminal-process-package-fixture@1" ||
    manifest.schemaVersion !== 1 ||
    typeof artifact !== "object" || artifact === null ||
    artifact.archive !== "process-package.json.gz" ||
    artifact.compression !== "gzip -n -9" ||
    !/^[a-f0-9]{64}$/.test(artifact.compressedSha256 ?? "") ||
    !/^[a-f0-9]{64}$/.test(artifact.contentSha256 ?? "") ||
    artifact.gzipHeaderMtime !== 0 ||
    typeof processPackage !== "object" || processPackage === null ||
    processPackage.root !== PROCESS_ROOT ||
    processPackage.reference !== "terminal-fixture@1.0.0" ||
    processPackage.definitionCount !== 9
  ) {
    throw new Error("Invalid operator terminal Process Package fixture manifest");
  }
}

function definitionCount(processPackage: ProcessPackage): number {
  return DEFINITION_GROUPS.reduce(
    (count, group) => count + Object.keys(processPackage[group]).length,
    0,
  );
}

function assertPackage(value: unknown, manifest: FixtureManifest): asserts value is ProcessPackage {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid serialized operator terminal Process Package");
  }
  const processPackage = value as Partial<ProcessPackage>;
  const reference = `${processPackage.manifest?.id}@${processPackage.manifest?.version}`;
  if (
    processPackage.root !== PROCESS_ROOT ||
    reference !== manifest.processPackage.reference ||
    DEFINITION_GROUPS.some((group) =>
      typeof processPackage[group] !== "object" ||
      processPackage[group] === null ||
      Array.isArray(processPackage[group])
    ) ||
    definitionCount(processPackage as ProcessPackage) !== manifest.processPackage.definitionCount
  ) {
    throw new Error("Serialized operator terminal Process Package identity or shape mismatch");
  }
  const profile = processPackage.profiles?.terminal as {
    disabled_capabilities?: unknown;
    terminal_outcomes?: Record<string, {
      condition?: { source?: unknown };
      explanation?: unknown;
    }>;
  } | undefined;
  const phase = processPackage.phases?.["phase-0-terminal"] as {
    omitted_capabilities?: unknown;
  } | undefined;
  if (
    JSON.stringify(profile?.disabled_capabilities) !== JSON.stringify(["broader fixture coverage"]) ||
    JSON.stringify(phase?.omitted_capabilities) !== JSON.stringify(["external fixture work"]) ||
    profile?.terminal_outcomes?.profile_boundary?.condition?.source !==
      'none("terminal-evidence@1", {}) && phase.id == "phase-0-terminal"' ||
    profile.terminal_outcomes.profile_boundary.explanation !==
      "This exact profile intentionally omits external breadth." ||
    profile.terminal_outcomes.lifecycle_complete?.condition?.source !==
      'phase.id == "phase-0-terminal"' ||
    profile.terminal_outcomes.lifecycle_complete.explanation !==
      "Every lifecycle objective selected by this package is complete."
  ) {
    throw new Error("Serialized operator terminal Process Package declarations mismatch");
  }
}

/**
 * Load the exact immutable terminal evaluator fixture. Live package authoring
 * and loading remain owned by scenario-policy-assets.test.ts.
 */
export async function operatorTerminalProcessPackageFixture(): Promise<ProcessPackage> {
  const manifestValue: unknown = JSON.parse(
    await fs.readFile(path.join(FIXTURE_ROOT, "manifest.json"), "utf8"),
  );
  assertManifest(manifestValue);
  const archivePath = path.resolve(FIXTURE_ROOT, manifestValue.artifact.archive);
  if (!archivePath.startsWith(`${FIXTURE_ROOT}${path.sep}`)) {
    throw new Error("Operator terminal Process Package fixture archive escapes its root");
  }
  const archive = await fs.readFile(archivePath);
  if (sha256(archive) !== manifestValue.artifact.compressedSha256) {
    throw new Error("Operator terminal Process Package compressed digest mismatch");
  }
  if (archive.length < 8 || archive.readUInt32LE(4) !== 0) {
    throw new Error("Non-deterministic operator terminal Process Package gzip header");
  }
  const content = gunzipSync(archive);
  if (sha256(content) !== manifestValue.artifact.contentSha256) {
    throw new Error("Operator terminal Process Package content digest mismatch");
  }
  const processPackage: unknown = JSON.parse(content.toString("utf8"));
  assertPackage(processPackage, manifestValue);
  return deepFreeze(processPackage);
}
