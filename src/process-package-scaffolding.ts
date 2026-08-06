import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";
import { structuralValuesEqual } from "./structural-equality.js";
import {
  evaluateLifecycle,
  loadProcessPackage,
  type LifecycleSnapshot,
  type ProcessDiagnostic,
  type ProcessPackage,
} from "./index.js";

export interface DerivedPackageSource {
  root: string;
  reference: string;
  digest: string;
}

export interface PackageScaffold {
  package: string;
  path: string;
  derivedFrom: { package: string; digest: string } | null;
}

export interface DefinitionScaffold {
  kind: DefinitionKind;
  id: string;
  version: 1;
  path: string;
}

export interface FixtureScaffold {
  name: string;
  phase: string;
  snapshot: string;
  expected: string;
}

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

type DefinitionKind =
  | "template"
  | "type"
  | "selector"
  | "policy"
  | "state"
  | "obligation"
  | "scenario"
  | "phase"
  | "profile"
  | "alias";

const definitionGroups: Record<
  DefinitionKind,
  { directory: string; catalog?: string; id: RegExp }
> = {
  template: { directory: "templates", catalog: "templates", id: /^[a-z][a-z0-9-]*$/ },
  type: { directory: "types", catalog: "types", id: /^[A-Z]{3,8}$/ },
  selector: { directory: "selectors", catalog: "selectors", id: /^[a-z][a-z0-9-]*$/ },
  policy: { directory: "policies", catalog: "policies", id: /^[a-z][a-z0-9-]*$/ },
  state: { directory: "states", catalog: "states", id: /^[a-z][a-z0-9-]*$/ },
  obligation: { directory: "obligations", catalog: "obligations", id: /^[a-z][a-z0-9-]*$/ },
  scenario: { directory: "scenarios", catalog: "scenarios", id: /^[a-z][a-z0-9-]*$/ },
  phase: { directory: "phases", catalog: "phases", id: /^phase-[0-9]+-[a-z0-9-]+$/ },
  profile: { directory: "profiles", id: /^[a-z][a-z0-9-]*$/ },
  alias: { directory: "aliases", catalog: "aliases", id: /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/ },
};

const packageDirectories = [
  "aliases",
  "obligations",
  "phases",
  "policies",
  "profiles",
  "prompts",
  "scenarios",
  "selectors",
  "skills",
  "states",
  "templates",
  "types",
] as const;

function diagnostic(code: string, message: string, pathValue?: string): Result<never> {
  return {
    ok: false,
    diagnostics: [{
      code,
      message,
      ...(pathValue ? { path: pathValue } : {}),
    }],
  };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function readManifest(root: string): Promise<Record<string, unknown>> {
  return parse(await fs.readFile(path.join(root, "manifest.yaml"), "utf8")) as Record<string, unknown>;
}

async function writeManifest(root: string, manifest: Record<string, unknown>): Promise<void> {
  const manifestPath = path.join(root, "manifest.yaml");
  const temporaryPath = `${manifestPath}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporaryPath, stringify(manifest), { flag: "wx" });
    await fs.rename(temporaryPath, manifestPath);
  } finally {
    await fs.rm(temporaryPath, { force: true });
  }
}

function packageId(destination: string): string | undefined {
  const id = path.basename(path.resolve(destination));
  return /^[a-z][a-z0-9-]*$/.test(id) ? id : undefined;
}

function kernelContractRoot(): string {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../.lifecycle/process",
  );
}

function emptyManifest(id: string): Record<string, unknown> {
  return {
    kind: "process-package-manifest",
    id,
    version: "0.1.0",
    status: "experimental",
    description: `Case-specific Process Package ${id}.`,
    kernel_contract: {
      id: "mdlm-kernel-process-interface",
      version: 1,
      primitive_catalog_ref: "primitives/kernel-v1.yaml@1",
      envelope_schema_id:
        "https://mdlm.dev/kernel/process-interface/v1/datum-envelope.schema.json",
      envelope_schema_copy: "meta/datum-envelope.schema.json",
      package_may_override: false,
    },
    artifact_format: {
      media_type: "text/markdown",
      metadata: "yaml-frontmatter",
      merged_body_field: "body",
      payload_field: "payload",
      encoding: "utf-8",
    },
    references: {
      process_asset: "<path>@<positive-integer-version>",
      definition: "<stable-definition-id>@<positive-integer-version>",
      datum_stable: "<TYPE>-<Crockford-Base32-ID>",
      datum_revision: "<stable-id>-r<five-digit-revision>",
      obligation_instance:
        "<obligation>@<version>:<exact-subject>:<process-ref>",
    },
    language: { expressions: "mdlm-expression@1" },
    kernel_capabilities: {},
    compatibility: {
      minimum_kernel: "0.2.0",
      meta_schema_version: 3,
      json_schema_draft: "2020-12",
      unknown_definition_fields: "reject",
      arbitrary_code_execution: "forbidden",
      template_inheritance: "single-parent-additive",
    },
    catalog: {
      templates: [],
      types: [],
      policies: [],
      states: [],
      selectors: [],
      obligations: [],
      scenarios: [],
      phases: [],
      aliases: [],
    },
    assets: { prompts: [], skills: [], rubrics: [] },
    profiles: { available: [] },
    provenance: {
      created_by: "req-process-init@1",
      intent: "case-specific-process",
      normative_scope: "this-package-only",
    },
  };
}

export async function scaffoldProcessPackage(
  destination: string,
  source?: DerivedPackageSource,
): Promise<Result<PackageScaffold>> {
  const absoluteDestination = path.resolve(destination);
  const id = packageId(absoluteDestination);
  if (!id) {
    return diagnostic(
      "invalid-process-package-id",
      `Destination basename '${path.basename(absoluteDestination)}' must be a lowercase Process Package ID`,
      absoluteDestination,
    );
  }
  if (await exists(absoluteDestination)) {
    return diagnostic(
      "process-package-destination-exists",
      `Process Package destination '${absoluteDestination}' already exists`,
      absoluteDestination,
    );
  }

  const temporaryRoot = `${absoluteDestination}.scaffold-${randomUUID()}`;
  try {
    if (source) {
      await fs.cp(source.root, temporaryRoot, { recursive: true, errorOnExist: true });
      const manifest = await readManifest(temporaryRoot);
      manifest.id = id;
      manifest.version = "0.1.0";
      const priorProvenance = typeof manifest.provenance === "object" &&
          manifest.provenance !== null
        ? manifest.provenance as Record<string, unknown>
        : {};
      manifest.provenance = {
        ...priorProvenance,
        created_by: "req-process-init@1",
        derived_from: { package: source.reference, digest: source.digest },
        normative_scope: "this-package-only",
      };
      await writeManifest(temporaryRoot, manifest);
    } else {
      const contracts = kernelContractRoot();
      await fs.mkdir(temporaryRoot, { recursive: true });
      await Promise.all(packageDirectories.map((directory) =>
        fs.mkdir(path.join(temporaryRoot, directory), { recursive: true })
      ));
      await fs.cp(path.join(contracts, "meta"), path.join(temporaryRoot, "meta"), {
        recursive: true,
      });
      await fs.mkdir(path.join(temporaryRoot, "primitives"), { recursive: true });
      await fs.copyFile(
        path.join(contracts, "primitives/kernel-v1.yaml"),
        path.join(temporaryRoot, "primitives/kernel-v1.yaml"),
      );
      await writeManifest(temporaryRoot, emptyManifest(id));
    }

    const loaded = await loadProcessPackage(temporaryRoot);
    if (!loaded.ok) return { ok: false, diagnostics: loaded.diagnostics };
    await fs.mkdir(path.dirname(absoluteDestination), { recursive: true });
    await fs.rename(temporaryRoot, absoluteDestination);
    return {
      ok: true,
      value: {
        package: `${id}@0.1.0`,
        path: absoluteDestination,
        derivedFrom: source
          ? { package: source.reference, digest: source.digest }
          : null,
      },
    };
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
}

function definitionSkeleton(kind: DefinitionKind, id: string): Record<string, unknown> {
  const schema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    required: [],
    properties: {},
  };
  switch (kind) {
    case "template":
      return { kind: "type-template-definition", id, version: 1, description: `Describe ${id}.`, payload_schema: schema, outgoing_links: [] };
    case "type":
      return {
        kind: "type-definition",
        id,
        version: 1,
        name: id,
        description: `Describe ${id}.`,
        extends: "replace-with-template@1",
        lifecycle: { authorship: "authored", freeze_when: "explicit" },
        payload_schema: schema,
        outgoing_links: [],
        kernel_managed_payload_paths: [],
      };
    case "selector":
      return {
        kind: "selector-definition",
        id,
        version: 1,
        description: `Describe ${id}.`,
        parameters: [],
        result_kind: "revision",
        query: { from: { collection: "revisions" }, as: "candidate", distinct: true, order_by: ["revision_id"] },
      };
    case "policy":
      return {
        kind: "policy-definition",
        id,
        version: 1,
        description: `Describe ${id}.`,
        parameters: [{ name: "subject", kind: "revision" }],
        result_schema: {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          type: "object",
          properties: { decision: { type: "string" } },
        },
        default: { decision: "replace-me" },
        rules: [],
      };
    case "state":
      return {
        kind: "state-definition",
        id,
        version: 1,
        description: `Describe ${id}.`,
        subject_as: "subject",
        cardinality: "exactly-one",
        default: "replace-me",
        values: ["replace-me"],
        rules: [],
      };
    case "obligation":
      return {
        kind: "obligation-definition",
        id,
        version: 1,
        description: `Describe ${id}.`,
        phases: ["phase-0-replace-me"],
        for_each: 'select("replace-with-selector@1", {})',
        subject_as: "subject",
        satisfied_when: "false",
        status_rules: [{ status: "ready", priority: 1, when: "true", reason: "Replace this authored rule." }],
        default_status: "ready",
        resolve_with: { scenario: "replace-with-scenario@1", inputs: { subject: "subject" } },
        waiver_policy_ref: "replace-with-policy@1",
      };
    case "scenario":
      return {
        kind: "scenario-definition",
        id,
        version: 1,
        description: `Describe ${id}.`,
        phases: ["phase-0-replace-me"],
        inputs: [{ name: "subject", types: ["TYP"], cardinality: "one", identity: "revision" }],
        outputs: [{ name: "result", types: ["TYP"], cardinality: "one", required_links: [] }],
        prompt_ref: `prompts/${id}.md@1`,
        review_policy_ref: "replace-with-policy@1",
        completion: "execution.integrity.contract_valid == true",
        initiation: "explicit",
        resolves: [],
        prohibited_inputs: [],
        batching: "single",
      };
    case "phase":
      return {
        kind: "phase-definition",
        id,
        version: 1,
        order: 0,
        name: id,
        purpose: `Describe ${id}.`,
        coverage: "bootstrap-subset",
        entry: "process.integrity.package_valid == true",
        scenarios: ["replace-with-scenario@1"],
        obligations: [],
        outputs: ["TYP"],
        progression: null,
        gate: {
          required: false,
          candidate_selector: "[]",
          candidate_as: "candidate",
          obligation: "replace-with-obligation@1",
          completion: "true",
        },
      };
    case "profile":
      return {
        kind: "implementation-profile-definition",
        id,
        version: 1,
        status: "experimental",
        description: `Describe ${id}.`,
        enabled: { types: [], phases: [], obligation_statuses: [] },
        disabled_capabilities: [],
        success_criteria: ["Replace with an observable success criterion."],
      };
    case "alias":
      return {
        kind: "command-alias-definition",
        id,
        version: 1,
        description: `Describe ${id}.`,
        scenario: "replace-with-scenario@1",
        arguments: {},
        inputs: {},
      };
  }
}

export async function scaffoldProcessDefinition(
  root: string,
  kindValue: string,
  id: string,
): Promise<Result<DefinitionScaffold>> {
  const kind = kindValue as DefinitionKind;
  const group = definitionGroups[kind];
  if (!group) {
    return diagnostic(
      "unknown-definition-kind",
      `Unknown definition kind '${kindValue}'; expected ${Object.keys(definitionGroups).join(", ")}`,
    );
  }
  if (!group.id.test(id)) {
    return diagnostic(
      "invalid-definition-id",
      `Definition ID '${id}' is invalid for kind '${kind}'`,
    );
  }
  const manifestPath = path.join(root, "manifest.yaml");
  if (!await exists(manifestPath)) {
    return diagnostic(
      "process-package-root-required",
      "Run this command from a Process Package root containing manifest.yaml",
      root,
    );
  }
  const relativePath = `${group.directory}/${id}.yaml`;
  const definitionPath = path.join(root, relativePath);
  if (await exists(definitionPath)) {
    return diagnostic(
      "definition-exists",
      `Definition '${id}' already exists at '${relativePath}'`,
      definitionPath,
    );
  }

  const manifest = await readManifest(root);
  const catalog = typeof manifest.catalog === "object" && manifest.catalog !== null
    ? manifest.catalog as Record<string, unknown>
    : {};
  if (group.catalog) {
    const entries = Array.isArray(catalog[group.catalog])
      ? catalog[group.catalog] as unknown[]
      : [];
    catalog[group.catalog] = [...entries, id].sort((left, right) =>
      String(left).localeCompare(String(right))
    );
    manifest.catalog = catalog;
  } else {
    const profiles = typeof manifest.profiles === "object" && manifest.profiles !== null
      ? manifest.profiles as Record<string, unknown>
      : {};
    const available = Array.isArray(profiles.available)
      ? profiles.available as unknown[]
      : [];
    profiles.available = [...available, `${relativePath}@1`].sort((left, right) =>
      String(left).localeCompare(String(right))
    );
    if (typeof profiles.default !== "string") profiles.default = `${id}@1`;
    manifest.profiles = profiles;
  }

  await fs.mkdir(path.dirname(definitionPath), { recursive: true });
  await fs.writeFile(definitionPath, stringify(definitionSkeleton(kind, id)), { flag: "wx" });
  try {
    await writeManifest(root, manifest);
  } catch (error) {
    await fs.rm(definitionPath, { force: true });
    throw error;
  }
  return { ok: true, value: { kind, id, version: 1, path: relativePath } };
}

export async function scaffoldProcessFixture(
  root: string,
  name: string,
  phaseId?: string,
): Promise<Result<FixtureScaffold>> {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    return diagnostic("invalid-fixture-name", `Invalid fixture name '${name}'`);
  }
  const loaded = await loadProcessPackage(root);
  if (!loaded.ok) return { ok: false, diagnostics: loaded.diagnostics };
  const phases = Object.values(loaded.package.phases).sort((left, right) =>
    Number(left.order) - Number(right.order) || left.id.localeCompare(right.id)
  );
  const phase = phaseId ? loaded.package.phases[phaseId] : phases[0];
  if (!phase) {
    return diagnostic(
      "fixture-phase-required",
      phaseId
        ? `Unknown Phase '${phaseId}'`
        : "Fixture scaffolding requires a declared Phase or '--phase <id>'",
    );
  }
  const fixtureRoot = path.join(root, "fixtures", name);
  if (await exists(fixtureRoot)) {
    return diagnostic("fixture-exists", `Fixture '${name}' already exists`, fixtureRoot);
  }
  const reference = `${loaded.package.manifest.id}@${loaded.package.manifest.version}`;
  const snapshot: LifecycleSnapshot = {
    processRef: `fixture:${reference}:${name}`,
    phaseId: phase.id,
    records: [],
    dependencyComparisons: [],
  };
  const evaluation = evaluateLifecycle(loaded.package, snapshot);
  const temporaryRoot = `${fixtureRoot}.scaffold-${randomUUID()}`;
  await fs.mkdir(temporaryRoot, { recursive: true });
  try {
    await fs.writeFile(path.join(temporaryRoot, "snapshot.yaml"), stringify(snapshot));
    await fs.writeFile(path.join(temporaryRoot, "expected.json"), `${JSON.stringify({
      schemaVersion: 1,
      package: reference,
      snapshot: "snapshot.yaml",
      evaluation,
    }, null, 2)}\n`);
    await fs.mkdir(path.dirname(fixtureRoot), { recursive: true });
    await fs.rename(temporaryRoot, fixtureRoot);
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
  return {
    ok: true,
    value: {
      name,
      phase: phase.id,
      snapshot: `fixtures/${name}/snapshot.yaml`,
      expected: `fixtures/${name}/expected.json`,
    },
  };
}

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
