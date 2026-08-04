import { randomBytes, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  Ajv2020,
  type ErrorObject,
  type ValidateFunction,
} from "ajv/dist/2020.js";
import formatsPlugin from "ajv-formats";
import { parse, stringify } from "yaml";
import { structuralValuesEqual } from "./structural-equality.js";
import {
  evaluateLifecycle,
  resolveType,
  type DatumEnvelope,
  type LifecycleRecord,
  type ObligationEvaluation,
  type ProcessDiagnostic,
  type ProcessPackage,
  type ResolvedType,
  type VersionedDefinition,
} from "./index.js";

export interface CreatedDatum {
  id: string;
  revisionId: string;
  type: string;
  path: string;
}

export interface DatumProjections {
  backlinks: { source: string; type: string }[];
  states: Record<string, string | string[]>;
  obligations: ObligationEvaluation[];
  kernelCapabilities: string[];
}

export interface StoredDatum {
  record: LifecycleRecord;
  projections: DatumProjections;
}

export interface RepositoryIndexSummary {
  rebuilt: boolean;
  records: number;
  path: ".lifecycle/generated/indexes/data.json";
}

export interface ListedDatum {
  id: string;
  revisionId: string;
  type: string;
  title: string | null;
  states: Record<string, string | string[]>;
  obligations: ObligationEvaluation[];
}

export type RepositoryResult<T> =
  | { ok: true; value: T; diagnostics: [] }
  | { ok: false; diagnostics: ProcessDiagnostic[] };

interface ParsedDatum {
  record: LifecycleRecord;
  relativePath: string;
}

const base32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const revisionIdentity = /^([A-Z]{3}-[0-9A-HJKMNP-TV-Z]{10,12})-r([0-9]{5})$/;

function randomStableId(typeId: string): string {
  return `${typeId}-${[...randomBytes(10)]
    .map((byte) => base32[byte & 31])
    .join("")}`;
}

function validator(schema: Record<string, unknown>): ValidateFunction {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const addFormats = formatsPlugin as unknown as (
    instance: Ajv2020,
  ) => Ajv2020;
  addFormats(ajv);
  return ajv.compile(schema);
}

function schemaDiagnostics(
  errors: ErrorObject[] | null | undefined,
  pathPrefix: string,
  code: string,
): ProcessDiagnostic[] {
  return (errors ?? []).map((error) => ({
    code,
    path: `${pathPrefix}${error.instancePath}`,
    message: `${error.instancePath || "/"} ${error.message ?? "is invalid"}`,
  }));
}

function renderDatum(datum: DatumEnvelope): string {
  const { body, ...frontmatter } = datum;
  return `---\n${stringify(frontmatter).trimEnd()}\n---\n${body}`;
}

function parseDatum(source: string, relativePath: string): RepositoryResult<ParsedDatum> {
  if (!source.startsWith("---\n")) {
    return {
      ok: false,
      diagnostics: [{
        code: "datum-frontmatter",
        path: relativePath,
        message: "Lifecycle Datum Markdown must begin with YAML frontmatter",
      }],
    };
  }
  const closing = source.indexOf("\n---\n", 4);
  if (closing < 0) {
    return {
      ok: false,
      diagnostics: [{
        code: "datum-frontmatter",
        path: relativePath,
        message: "Lifecycle Datum Markdown must close its YAML frontmatter",
      }],
    };
  }
  try {
    const metadata = parse(source.slice(4, closing)) as unknown;
    if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
      throw new Error("frontmatter must be an object");
    }
    const datum = {
      ...(metadata as Record<string, unknown>),
      body: source.slice(closing + 5),
    } as unknown as DatumEnvelope;
    return {
      ok: true,
      value: {
        relativePath,
        record: {
          datum,
          storage: { editable: true, frozen: false },
          integrity: {
            parseable: true,
            schema_valid: true,
            identity_valid: true,
            references_valid: true,
            hash_valid: true,
          },
        },
      },
      diagnostics: [],
    };
  } catch (error) {
    return {
      ok: false,
      diagnostics: [{
        code: "datum-frontmatter",
        path: relativePath,
        message: error instanceof Error ? error.message : String(error),
      }],
    };
  }
}

async function markdownPaths(root: string): Promise<string[]> {
  const dataRoot = path.join(root, ".lifecycle/data");
  const paths: string[] = [];
  async function visit(directory: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(entryPath);
      else if (entry.isFile() && entry.name.endsWith(".md")) {
        paths.push(path.relative(root, entryPath));
      }
    }
  }
  await visit(dataRoot);
  return paths.sort();
}

function referenceParts(reference: string): [string, number] | undefined {
  const match = /^(.*)@([1-9][0-9]*)$/.exec(reference);
  return match?.[1] && match[2] ? [match[1], Number(match[2])] : undefined;
}

function resolveScenario(
  processPackage: ProcessPackage,
  reference: string,
  typeId: string,
): RepositoryResult<VersionedDefinition> {
  const parts = referenceParts(reference);
  const scenario = parts ? processPackage.scenarios[parts[0]] : undefined;
  if (!parts || !scenario || scenario.version !== parts[1]) {
    return {
      ok: false,
      diagnostics: [{
        code: "unknown-scenario",
        path: "created_by.scenario",
        message: `Unknown Scenario '${reference}'`,
      }],
    };
  }
  const declaresType = Array.isArray(scenario.outputs) && scenario.outputs.some((output) => {
    if (typeof output !== "object" || output === null) return false;
    const types = (output as Record<string, unknown>).types;
    return Array.isArray(types) && types.includes(typeId);
  });
  if (!declaresType) {
    return {
      ok: false,
      diagnostics: [{
        code: "scenario-output-type",
        path: "created_by.scenario",
        message: `Scenario '${reference}' does not declare lifecycle type '${typeId}' as an output`,
      }],
    };
  }
  return { ok: true, value: scenario, diagnostics: [] };
}

function targetRecord(
  records: LifecycleRecord[],
  target: string,
): LifecycleRecord | undefined {
  return revisionIdentity.test(target)
    ? records.find((record) => record.datum.revision_id === target)
    : records.find((record) => record.datum.id === target);
}

function linkDiagnostics(
  resolvedType: ResolvedType,
  links: DatumEnvelope["links"],
  records: LifecycleRecord[],
): ProcessDiagnostic[] {
  const diagnostics: ProcessDiagnostic[] = [];
  const contracts = new Map(resolvedType.outgoingLinks.map((contract) => [
    String(contract.id),
    contract,
  ]));
  for (const [index, link] of links.entries()) {
    const contract = contracts.get(link.type);
    if (!contract) {
      diagnostics.push({
        code: "unknown-outgoing-link",
        path: `links[${index}].type`,
        message: `Resolved type '${resolvedType.id}' does not declare outgoing link '${link.type}'`,
      });
      continue;
    }
    const target = targetRecord(records, link.target);
    if (!target) {
      diagnostics.push({
        code: "unknown-link-target",
        path: `links[${index}].target`,
        message: `Unknown Lifecycle Datum target '${link.target}'`,
      });
      continue;
    }
    const targets = Array.isArray(contract.targets) ? contract.targets : [];
    const compatible = targets.some((targetContract) => {
      if (typeof targetContract !== "object" || targetContract === null) return false;
      const value = targetContract as Record<string, unknown>;
      const identity = value.identity;
      const identityMatches = identity === "revision"
        ? revisionIdentity.test(link.target)
        : identity === "stable" && !revisionIdentity.test(link.target);
      return identityMatches && Array.isArray(value.types) &&
        value.types.includes(target.datum.type);
    });
    if (!compatible) {
      diagnostics.push({
        code: "incompatible-link-target",
        path: `links[${index}].target`,
        message: `Link '${link.type}' cannot target '${link.target}'`,
      });
    }
  }
  for (const contract of resolvedType.outgoingLinks) {
    const id = String(contract.id);
    const count = links.filter((link) => link.type === id).length;
    const cardinality = typeof contract.cardinality === "object" &&
        contract.cardinality !== null
      ? contract.cardinality as Record<string, unknown>
      : {};
    const minimum = typeof cardinality.minimum === "number" ? cardinality.minimum : 0;
    const maximum = typeof cardinality.maximum === "number"
      ? cardinality.maximum
      : Number.POSITIVE_INFINITY;
    if (count < minimum || count > maximum) {
      diagnostics.push({
        code: "link-cardinality",
        path: `links.${id}`,
        message: `Link '${id}' requires ${minimum}..${Number.isFinite(maximum) ? maximum : "many"} targets, received ${count}`,
      });
    }
  }
  return diagnostics;
}

function validateDatum(
  processPackage: ProcessPackage,
  datum: DatumEnvelope,
  records: LifecycleRecord[],
): ProcessDiagnostic[] {
  const resolved = resolveType(processPackage, datum.type);
  if (!resolved.ok) return resolved.diagnostics;
  const envelopeValidator = validator(processPackage.envelopeSchema);
  const payloadValidator = validator(resolved.type.payloadSchema);
  const diagnostics = [
    ...(envelopeValidator(datum)
      ? []
      : schemaDiagnostics(envelopeValidator.errors, "datum", "datum-envelope")),
    ...(payloadValidator(datum.payload)
      ? []
      : schemaDiagnostics(payloadValidator.errors, "payload", "datum-payload")),
  ];
  if (
    !datum.id.startsWith(`${datum.type}-`) ||
    datum.revision_id !== `${datum.id}-r${String(datum.revision).padStart(5, "0")}`
  ) {
    diagnostics.push({
      code: "datum-identity",
      path: "revision_id",
      message: "Lifecycle Datum identity must match its type, Stable ID, and revision number",
    });
  }
  diagnostics.push(...linkDiagnostics(resolved.type, datum.links, records));
  return diagnostics;
}

export async function readRepositoryData(
  root: string,
  processPackage: ProcessPackage,
): Promise<RepositoryResult<ParsedDatum[]>> {
  const parsed: ParsedDatum[] = [];
  const diagnostics: ProcessDiagnostic[] = [];
  for (const relativePath of await markdownPaths(root)) {
    const result = parseDatum(
      await fs.readFile(path.join(root, relativePath), "utf8"),
      relativePath,
    );
    if (!result.ok) diagnostics.push(...result.diagnostics);
    else parsed.push(result.value);
  }
  const records = parsed.map((item) => item.record);
  for (const item of parsed) {
    diagnostics.push(...validateDatum(processPackage, item.record.datum, records).map(
      (diagnostic) => ({
        ...diagnostic,
        path: `${item.relativePath}#${diagnostic.path ?? ""}`,
      }),
    ));
  }
  return diagnostics.length > 0
    ? { ok: false, diagnostics }
    : { ok: true, value: parsed, diagnostics: [] };
}

function setPayloadValue(
  payload: Record<string, unknown>,
  payloadPath: string,
  value: unknown,
): ProcessDiagnostic | undefined {
  const parts = payloadPath.split(".");
  if (
    parts.some((part) => !/^[a-z][a-z0-9_]*$/.test(part) ||
      part === "__proto__" || part === "constructor" || part === "prototype")
  ) {
    return {
      code: "invalid-payload-path",
      path: payloadPath,
      message: `Invalid payload path '${payloadPath}'`,
    };
  }
  let current = payload;
  for (const part of parts.slice(0, -1)) {
    const existing = current[part];
    if (existing === undefined) current[part] = {};
    else if (typeof existing !== "object" || existing === null || Array.isArray(existing)) {
      return {
        code: "invalid-payload-path",
        path: payloadPath,
        message: `Payload path '${payloadPath}' crosses a non-object value`,
      };
    }
    current = current[part] as Record<string, unknown>;
  }
  const leaf = parts.at(-1);
  if (leaf) current[leaf] = value;
  return undefined;
}

export async function createDatum(
  root: string,
  processPackage: ProcessPackage,
  packageReference: string,
  packageDigest: string,
  typeId: string,
  scenarioReference: string | undefined,
  fields: { path: string; value: unknown }[],
  links: DatumEnvelope["links"],
  body: string,
): Promise<RepositoryResult<CreatedDatum>> {
  const resolved = resolveType(processPackage, typeId);
  if (!resolved.ok) return resolved;
  if (!scenarioReference) {
    return {
      ok: false,
      diagnostics: [{
        code: "creation-scenario-required",
        path: "created_by.scenario",
        message: "Lifecycle Datum creation requires '--scenario <scenario@version>'",
      }],
    };
  }
  const scenarioResult = resolveScenario(processPackage, scenarioReference, typeId);
  if (!scenarioResult.ok) return scenarioResult;
  const loaded = await readRepositoryData(root, processPackage);
  if (!loaded.ok) return loaded;
  const payload: Record<string, unknown> = {};
  for (const field of fields) {
    const pathDiagnostic = setPayloadValue(payload, field.path, field.value);
    if (pathDiagnostic) return { ok: false, diagnostics: [pathDiagnostic] };
  }
  for (const managedPath of resolved.type.kernelManagedPayloadPaths) {
    if (fields.some((field) =>
      field.path === managedPath || field.path.startsWith(`${managedPath}.`)
    )) {
      return {
        ok: false,
        diagnostics: [{
          code: "kernel-managed-payload",
          path: `payload.${managedPath}`,
          message: `Payload path '${managedPath}' is managed by the kernel`,
        }],
      };
    }
  }
  const id = randomStableId(typeId);
  const revisionId = `${id}-r00001`;
  const scenario = scenarioResult.value;
  const reviewPolicy = typeof scenario.review_policy_ref === "string"
    ? [scenario.review_policy_ref]
    : [];
  const datum: DatumEnvelope = {
    id,
    revision: 1,
    revision_id: revisionId,
    type: typeId,
    payload,
    links,
    created_by: {
      scenario: scenarioReference,
      prompt_ref: String(scenario.prompt_ref),
      process_ref: `${packageReference}#${packageDigest}`,
      loaded_skill_refs: [],
      policy_refs: reviewPolicy,
    },
    body: body.length === 0 || body.endsWith("\n") ? body : `${body}\n`,
  };
  const diagnostics = validateDatum(
    processPackage,
    datum,
    loaded.value.map((item) => item.record),
  );
  if (diagnostics.length > 0) return { ok: false, diagnostics };

  const relativeDirectory = `.lifecycle/data/${typeId}/${id}`;
  const finalDirectory = path.join(root, relativeDirectory);
  const typeRoot = path.dirname(finalDirectory);
  const temporaryDirectory = path.join(typeRoot, `.${id}.${randomUUID()}.tmp`);
  try {
    await fs.mkdir(typeRoot, { recursive: true });
    await fs.mkdir(temporaryDirectory);
    await fs.writeFile(path.join(temporaryDirectory, "r00001.md"), renderDatum(datum), {
      flag: "wx",
    });
    await fs.rename(temporaryDirectory, finalDirectory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      return {
        ok: false,
        diagnostics: [{
          code: "datum-identity-collision",
          path: finalDirectory,
          message: `Stable Datum '${id}' already exists`,
        }],
      };
    }
    throw error;
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
  return {
    ok: true,
    value: {
      id,
      revisionId,
      type: typeId,
      path: `${relativeDirectory}/r00001.md`,
    },
    diagnostics: [],
  };
}

function projections(
  processPackage: ProcessPackage,
  records: LifecycleRecord[],
  subject: LifecycleRecord,
  processReference: string,
): DatumProjections {
  let states: Record<string, string | string[]> = {};
  const obligations = new Map<string, ObligationEvaluation>();
  for (const phaseId of Object.keys(processPackage.phases).sort()) {
    const evaluation = evaluateLifecycle(processPackage, {
      processRef: processReference,
      phaseId,
      records,
      dependencyComparisons: [],
    });
    states = evaluation.artifacts[subject.datum.revision_id]?.states ?? states;
    for (const obligation of evaluation.obligations) {
      if (obligation.subject === subject.datum.revision_id) {
        obligations.set(obligation.id, obligation);
      }
    }
  }
  const backlinks = records.flatMap((record) => record.datum.links
    .filter((link) =>
      link.target === subject.datum.id || link.target === subject.datum.revision_id
    )
    .map((link) => ({ source: record.datum.revision_id, type: link.type })))
    .sort((left, right) =>
      left.source.localeCompare(right.source) || left.type.localeCompare(right.type)
    );
  const resolved = resolveType(processPackage, subject.datum.type);
  return {
    backlinks,
    states,
    obligations: [...obligations.values()].sort((left, right) =>
      left.id.localeCompare(right.id)
    ),
    kernelCapabilities: resolved.ok ? resolved.type.kernelCapabilities : [],
  };
}

export async function rebuildRepositoryIndex(
  root: string,
  processPackage: ProcessPackage,
  packageReference: string,
): Promise<RepositoryResult<RepositoryIndexSummary>> {
  const loaded = await readRepositoryData(root, processPackage);
  if (!loaded.ok) return loaded;
  const relativePath = ".lifecycle/generated/indexes/data.json" as const;
  const indexPath = path.join(root, relativePath);
  const value = {
    schemaVersion: 1,
    generatedFrom: {
      package: packageReference,
      source: ".lifecycle/data",
    },
    records: loaded.value.map((item) => ({
      id: item.record.datum.id,
      revisionId: item.record.datum.revision_id,
      type: item.record.datum.type,
      path: item.relativePath,
    })).sort((left, right) =>
      left.type.localeCompare(right.type) ||
      left.id.localeCompare(right.id) ||
      left.revisionId.localeCompare(right.revisionId)
    ),
  };
  let rebuilt = true;
  try {
    const existing = JSON.parse(await fs.readFile(indexPath, "utf8")) as unknown;
    rebuilt = !structuralValuesEqual(existing, value);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (rebuilt) {
    await fs.mkdir(path.dirname(indexPath), { recursive: true });
    const temporaryPath = `${indexPath}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
        flag: "wx",
      });
      await fs.rename(temporaryPath, indexPath);
    } finally {
      await fs.rm(temporaryPath, { force: true });
    }
  }
  return {
    ok: true,
    value: { rebuilt, records: value.records.length, path: relativePath },
    diagnostics: [],
  };
}

export async function showDatum(
  root: string,
  processPackage: ProcessPackage,
  processReference: string,
  identity: string,
): Promise<RepositoryResult<StoredDatum>> {
  const loaded = await readRepositoryData(root, processPackage);
  if (!loaded.ok) return loaded;
  const candidates = loaded.value.filter((item) =>
    item.record.datum.id === identity || item.record.datum.revision_id === identity
  );
  candidates.sort((left, right) =>
    right.record.datum.revision - left.record.datum.revision
  );
  const selected = candidates[0];
  if (!selected) {
    return {
      ok: false,
      diagnostics: [{
        code: "unknown-datum",
        path: identity,
        message: `Unknown Lifecycle Datum '${identity}'`,
      }],
    };
  }
  const records = loaded.value.map((item) => item.record);
  return {
    ok: true,
    value: {
      record: selected.record,
      projections: projections(
        processPackage,
        records,
        selected.record,
        processReference,
      ),
    },
    diagnostics: [],
  };
}

export async function listData(
  root: string,
  processPackage: ProcessPackage,
  processReference: string,
): Promise<RepositoryResult<ListedDatum[]>> {
  const loaded = await readRepositoryData(root, processPackage);
  if (!loaded.ok) return loaded;
  const selected = new Map<string, ParsedDatum>();
  for (const item of loaded.value) {
    const current = selected.get(item.record.datum.id);
    if (!current || current.record.datum.revision < item.record.datum.revision) {
      selected.set(item.record.datum.id, item);
    }
  }
  const records = loaded.value.map((item) => item.record);
  const result = [...selected.values()].map((item) => {
    const computed = projections(
      processPackage,
      records,
      item.record,
      processReference,
    );
    return {
      id: item.record.datum.id,
      revisionId: item.record.datum.revision_id,
      type: item.record.datum.type,
      title: typeof item.record.datum.payload.title === "string"
        ? item.record.datum.payload.title
        : null,
      states: computed.states,
      obligations: computed.obligations,
    };
  });
  result.sort((left, right) =>
    left.type.localeCompare(right.type) || left.id.localeCompare(right.id)
  );
  return { ok: true, value: result, diagnostics: [] };
}
