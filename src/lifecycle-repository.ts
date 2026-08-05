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
import {
  isObligationInstanceIdentity,
  parseObligationInstanceIdentity,
} from "./obligation-instance.js";
import { structuralValuesEqual } from "./structural-equality.js";
import {
  evaluateLifecycle,
  resolveType,
  type DatumEnvelope,
  type LifecycleRecord,
  type LifecycleSnapshot,
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

export interface ScenarioMutationPublication {
  created: CreatedDatum[];
  executionPath: string;
}

export type GraphIdentityKind =
  | "stable-datum"
  | "revision"
  | "obligation-instance";

export interface GraphNode {
  identity: string;
  identityKind: GraphIdentityKind;
  type?: string;
}

export interface GraphLink {
  source: string;
  sourceIdentityKind: "revision";
  sourceType: string;
  type: string;
  target: string;
  targetIdentityKind: GraphIdentityKind;
  inverseLabel: string;
}

export interface BacklinkInspection extends GraphNode {
  links: GraphLink[];
}

export interface GraphTrace {
  root: GraphNode;
  depth: number;
  relation: string | null;
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface LinkMutation {
  operation: "added" | "removed";
  sourceRevision: string;
  type: string;
  target: string;
}

export interface DatumProjections {
  backlinks: GraphLink[];
  states: Record<string, string | string[]>;
  obligations: ObligationEvaluation[];
  kernelCapabilities: string[];
}

export interface StoredDatum {
  lifecycleDatum: LifecycleRecord;
  projections: DatumProjections;
}

export interface RepositoryIndexSummary {
  rebuilt: boolean;
  data: number;
  path: ".lifecycle/generated/indexes/data.json";
}

export interface RepositoryReportSummary {
  rebuilt: boolean;
  data: number;
  path: ".lifecycle/generated/reports/lifecycle.json";
}

export interface ListedDatum {
  lifecycleDatum: LifecycleRecord;
  projections: DatumProjections;
}

export interface DatumHistory {
  id: string;
  type: string;
  revisions: {
    revision: number;
    revisionId: string;
    classification: "frozen-history" | "editable-work";
    frozenBy: string[];
    processRef: string;
  }[];
}

export type RepositoryResult<T> =
  | { ok: true; value: T; diagnostics: [] }
  | { ok: false; diagnostics: ProcessDiagnostic[] };

export interface ParsedDatum {
  lifecycleDatum: LifecycleRecord;
  relativePath: string;
}

export interface KernelFinalizedScenarioOutput {
  capability: "exact-baseline@1";
  datum: DatumEnvelope;
}

const base32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const stableIdentity = /^[A-Z]{3,8}-[0-9A-HJKMNP-TV-Z]{10,12}$/;
const revisionIdentity = /^([A-Z]{3,8}-[0-9A-HJKMNP-TV-Z]{10,12})-r([0-9]{5})$/;

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
        lifecycleDatum: {
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

function frozenRevisionMemberships(
  processPackage: ProcessPackage,
  lifecycleData: LifecycleRecord[],
): Map<string, string[]> {
  const memberships = new Map<string, string[]>();
  const baselineType = processPackage.kernelCapabilities["exact-baseline@1"]?.type;
  if (!baselineType) return memberships;
  for (const baseline of lifecycleData) {
    if (baseline.datum.type !== baselineType) continue;
    const snapshot = baseline.datum.payload.snapshot;
    if (typeof snapshot !== "object" || snapshot === null || Array.isArray(snapshot)) {
      continue;
    }
    if (!memberships.has(baseline.datum.revision_id)) {
      memberships.set(baseline.datum.revision_id, []);
    }
    for (const field of ["definition_members", "evidence"] as const) {
      const identities = baseline.datum.payload[field];
      if (!Array.isArray(identities)) continue;
      for (const identity of identities) {
        if (typeof identity !== "string") continue;
        const containing = memberships.get(identity) ?? [];
        if (!containing.includes(baseline.datum.revision_id)) {
          containing.push(baseline.datum.revision_id);
        }
        memberships.set(identity, containing);
      }
    }
  }
  for (const containing of memberships.values()) containing.sort();
  return memberships;
}

function payloadPathValue(
  payload: Record<string, unknown>,
  field: string,
): unknown {
  return field.split(".").reduce<unknown>((value, segment) =>
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)[segment]
      : undefined, payload);
}

export function deriveDatumStorage(
  processPackage: ProcessPackage,
  datum: DatumEnvelope,
  frozenByBaseline: boolean,
): LifecycleRecord["storage"] {
  const resolved = resolveType(processPackage, datum.type);
  const lifecycle = resolved.ok ? resolved.type.lifecycle : {};
  const terminalField = typeof lifecycle.terminal_payload_field === "string"
    ? lifecycle.terminal_payload_field
    : undefined;
  const terminalValues = Array.isArray(lifecycle.terminal_values)
    ? lifecycle.terminal_values
    : [];
  const frozenByTerminalOutcome = lifecycle.freeze_when === "terminal-outcome" &&
    terminalField !== undefined &&
    terminalValues.includes(payloadPathValue(datum.payload, terminalField));
  const frozen = frozenByBaseline || frozenByTerminalOutcome;
  return { editable: !frozen, frozen };
}

export function provisionalLifecycleRecord(
  datum: DatumEnvelope,
): LifecycleRecord {
  return {
    datum,
    storage: { editable: true, frozen: false },
    integrity: {
      parseable: true,
      schema_valid: true,
      identity_valid: true,
      references_valid: true,
      hash_valid: true,
    },
  };
}

export function deriveLifecycleRecordStorage(
  processPackage: ProcessPackage,
  records: LifecycleRecord[],
): LifecycleRecord[] {
  const memberships = frozenRevisionMemberships(processPackage, records);
  return records.map((record) => ({
    ...record,
    storage: deriveDatumStorage(
      processPackage,
      record.datum,
      memberships.has(record.datum.revision_id),
    ),
  }));
}

function applyStorageFacts(
  processPackage: ProcessPackage,
  parsed: ParsedDatum[],
): void {
  const derived = deriveLifecycleRecordStorage(
    processPackage,
    parsed.map((item) => item.lifecycleDatum),
  );
  parsed.forEach((item, index) => {
    item.lifecycleDatum = derived[index]!;
  });
}

function stableLineage(parsed: ParsedDatum[], stableId: string): ParsedDatum[] {
  return parsed
    .filter((item) => item.lifecycleDatum.datum.id === stableId)
    .sort((left, right) =>
      left.lifecycleDatum.datum.revision - right.lifecycleDatum.datum.revision
    );
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

function targetDatum(
  lifecycleData: LifecycleRecord[],
  target: string,
): LifecycleRecord | undefined {
  return revisionIdentity.test(target)
    ? lifecycleData.find((datum) => datum.datum.revision_id === target)
    : lifecycleData.find((datum) => datum.datum.id === target);
}

function obligationInstanceParts(
  processPackage: ProcessPackage,
  lifecycleData: LifecycleRecord[],
  target: string,
): { obligation: string; subject: string } | undefined {
  const parsed = parseObligationInstanceIdentity(target);
  if (!parsed) return undefined;
  const reference = referenceParts(parsed.obligationReference);
  const definition = reference ? processPackage.obligations[reference[0]] : undefined;
  if (!reference || !definition || definition.version !== reference[1]) return undefined;
  if (
    parsed.subject.kind === "revision" &&
    !lifecycleData.some(
      (item) => item.datum.revision_id === parsed.subject.identity,
    )
  ) {
    return undefined;
  }
  if (parsed.subject.kind === "phase") {
    const phase = processPackage.phases[parsed.subject.phaseId];
    if (!phase || phase.version !== parsed.subject.version) return undefined;
  }
  if (parsed.subject.kind === "process") {
    const phase = processPackage.phases[parsed.subject.phaseId];
    if (!phase || phase.version !== parsed.subject.phaseVersion) return undefined;
  }
  return {
    obligation: parsed.obligationReference,
    subject: parsed.subject.identity,
  };
}

function graphNode(
  processPackage: ProcessPackage,
  lifecycleData: LifecycleRecord[],
  identity: string,
): GraphNode | undefined {
  if (revisionIdentity.test(identity)) {
    const datum = lifecycleData.find((item) => item.datum.revision_id === identity);
    return datum
      ? { identity, identityKind: "revision", type: datum.datum.type }
      : undefined;
  }
  if (stableIdentity.test(identity)) {
    const datum = lifecycleData.find((item) => item.datum.id === identity);
    return datum
      ? { identity, identityKind: "stable-datum", type: datum.datum.type }
      : undefined;
  }
  return obligationInstanceParts(processPackage, lifecycleData, identity)
    ? { identity, identityKind: "obligation-instance" }
    : undefined;
}

function linkDiagnostics(
  processPackage: ProcessPackage,
  resolvedType: ResolvedType,
  links: DatumEnvelope["links"],
  lifecycleData: LifecycleRecord[],
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
    const target = targetDatum(lifecycleData, link.target);
    const obligation = obligationInstanceParts(
      processPackage,
      lifecycleData,
      link.target,
    );
    if (!target && !obligation) {
      const validIdentity = stableIdentity.test(link.target) ||
        revisionIdentity.test(link.target) ||
        isObligationInstanceIdentity(link.target);
      diagnostics.push({
        code: validIdentity ? "unknown-link-target" : "invalid-link-target-identity",
        path: `links[${index}].target`,
        message: validIdentity
          ? `Unknown link target '${link.target}'`
          : `Link target '${link.target}' is not a Stable Datum, exact Revision, or exact Obligation Instance identity`,
      });
      continue;
    }
    const targets = Array.isArray(contract.targets) ? contract.targets : [];
    const compatible = targets.some((targetContract) => {
      if (typeof targetContract !== "object" || targetContract === null) return false;
      const value = targetContract as Record<string, unknown>;
      if (value.kind === "obligation-instance") {
        return obligation !== undefined &&
          value.identity === "exact-obligation-instance";
      }
      if (value.kind !== "datum" || !target) return false;
      const identity = value.identity;
      const identityMatches = identity === "either" ||
        (identity === "revision" && revisionIdentity.test(link.target)) ||
        (identity === "stable" && stableIdentity.test(link.target));
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
  lifecycleData: LifecycleRecord[],
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
  diagnostics.push(...linkDiagnostics(
    processPackage,
    resolved.type,
    datum.links,
    lifecycleData,
  ));
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
  applyStorageFacts(processPackage, parsed);
  const lifecycleData = parsed.map((item) => item.lifecycleDatum);
  for (const item of parsed) {
    diagnostics.push(...validateDatum(
      processPackage,
      item.lifecycleDatum.datum,
      lifecycleData,
    ).map(
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

export async function repositoryLifecycleSnapshot(
  root: string,
  processPackage: ProcessPackage,
  processRef: string,
  phaseId: string,
): Promise<RepositoryResult<LifecycleSnapshot>> {
  const loaded = await readRepositoryData(root, processPackage);
  return loaded.ok
    ? {
        ok: true,
        value: {
          processRef,
          phaseId,
          records: loaded.value.map((item) => item.lifecycleDatum),
          dependencyComparisons: [],
        },
        diagnostics: [],
      }
    : loaded;
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

function generatedAuthorshipDiagnostic(
  typeId: string,
  lifecycle: Record<string, unknown>,
): ProcessDiagnostic | undefined {
  return lifecycle.authorship === "generated"
    ? {
        code: "generated-datum-requires-scenario-execution",
        path: `types.${typeId}.lifecycle.authorship`,
        message: `Lifecycle type '${typeId}' is generated and may be published only through validated Scenario execution`,
      }
    : undefined;
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
  kernelManagedFields: { path: string; value: unknown }[] = [],
): Promise<RepositoryResult<CreatedDatum>> {
  const resolved = resolveType(processPackage, typeId);
  if (!resolved.ok) return resolved;
  const authorshipDiagnostic = generatedAuthorshipDiagnostic(
    typeId,
    resolved.type.lifecycle,
  );
  if (authorshipDiagnostic) {
    return { ok: false, diagnostics: [authorshipDiagnostic] };
  }
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
  for (const field of [...fields, ...kernelManagedFields]) {
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
    loaded.value.map((item) => item.lifecycleDatum),
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

function payloadPathPresent(
  payload: Record<string, unknown>,
  payloadPath: string,
): boolean {
  let value: unknown = payload;
  for (const part of payloadPath.split(".")) {
    const asObject = typeof value === "object" && value !== null &&
        !Array.isArray(value)
      ? value as Record<string, unknown>
      : undefined;
    if (!asObject || !Object.hasOwn(asObject, part)) return false;
    value = asObject[part];
  }
  return true;
}

export async function publishScenarioMutation(
  root: string,
  processPackage: ProcessPackage,
  expectedData: DatumEnvelope[],
  data: DatumEnvelope[],
  executionId: string,
  executionRecord: unknown,
  kernelFinalizedOutputs: readonly KernelFinalizedScenarioOutput[] = [],
): Promise<RepositoryResult<ScenarioMutationPublication>> {
  const loaded = await readRepositoryData(root, processPackage);
  if (!loaded.ok) return loaded;
  const currentData = loaded.value.map((item) => item.lifecycleDatum.datum)
    .sort((left, right) => left.revision_id.localeCompare(right.revision_id));
  const expected = expectedData.slice()
    .sort((left, right) => left.revision_id.localeCompare(right.revision_id));
  if (!structuralValuesEqual(currentData, expected)) {
    return {
      ok: false,
      diagnostics: [{
        code: "scenario-repository-changed",
        path: ".lifecycle/data",
        message: "Lifecycle Data changed after Scenario inputs were validated; no outputs were published",
      }],
    };
  }
  const diagnostics: ProcessDiagnostic[] = [];
  const existing = loaded.value;
  const proposedIds = new Set<string>();
  const proposedRevisions = new Set<string>();
  for (const datum of data) {
    if (proposedRevisions.has(datum.revision_id)) {
      diagnostics.push({
        code: "scenario-output-identity-collision",
        path: datum.revision_id,
        message: `Scenario outputs repeat exact Revision '${datum.revision_id}'`,
      });
    }
    proposedRevisions.add(datum.revision_id);
    const lineage = existing.filter((item) =>
      item.lifecycleDatum.datum.id === datum.id
    );
    if (lineage.length === 0) {
      if (datum.revision !== 1 || proposedIds.has(datum.id)) {
        diagnostics.push({
          code: "scenario-output-lineage-invalid",
          path: datum.revision_id,
          message: `New Stable Datum '${datum.id}' must begin with exactly one Revision 1`,
        });
      }
      proposedIds.add(datum.id);
    } else {
      const type = lineage[0]?.lifecycleDatum.datum.type;
      const expectedRevision = Math.max(...lineage.map((item) =>
        item.lifecycleDatum.datum.revision
      )) + 1;
      const editable = lineage.find((item) => item.lifecycleDatum.storage.editable);
      if (type !== datum.type || datum.revision !== expectedRevision || editable) {
        diagnostics.push({
          code: editable ? "editable-revision-exists" : "scenario-output-lineage-invalid",
          path: datum.revision_id,
          message: editable
            ? `Stable Datum '${datum.id}' already has editable Revision '${editable.lifecycleDatum.datum.revision_id}'`
            : `Scenario output Revision '${datum.revision_id}' does not continue the exact '${type}' lineage at Revision ${expectedRevision}`,
        });
      }
    }
    const resolved = resolveType(processPackage, datum.type);
    if (!resolved.ok) diagnostics.push(...resolved.diagnostics);
    else {
      for (const managedPath of resolved.type.kernelManagedPayloadPaths) {
        if (
          !kernelFinalizedOutputs.some((output) => output.datum === datum) &&
          payloadPathPresent(datum.payload, managedPath)
        ) {
          diagnostics.push({
            code: "kernel-managed-payload",
            path: `payload.${managedPath}`,
            message: `Scenario output may not author kernel-managed payload path '${managedPath}'`,
          });
        }
      }
    }
  }
  const lifecycleData = deriveLifecycleRecordStorage(processPackage, [
    ...existing.map((item) => item.lifecycleDatum),
    ...data.map(provisionalLifecycleRecord),
  ]);
  for (const datum of data) {
    diagnostics.push(...validateDatum(processPackage, datum, lifecycleData));
  }
  if (diagnostics.length > 0) return { ok: false, diagnostics };

  const transactionRoot = ".lifecycle/data/.transactions";
  const transactionRelativePath = `${transactionRoot}/${executionId}`;
  const executionRelativePath = `${transactionRelativePath}/execution.json`;
  const finalDirectory = path.join(root, transactionRelativePath);
  const temporaryDirectory = path.join(
    root,
    ".lifecycle",
    `.scenario-${executionId}.${randomUUID()}.tmp`,
  );
  const created = data.map((datum) => ({
    id: datum.id,
    revisionId: datum.revision_id,
    type: datum.type,
    path: `${transactionRelativePath}/${datum.type}/${datum.id}/r${String(datum.revision).padStart(5, "0")}.md`,
  }));
  try {
    await fs.mkdir(temporaryDirectory, { recursive: true });
    for (let index = 0; index < data.length; index += 1) {
      const temporaryPath = path.join(
        temporaryDirectory,
        created[index]!.path.slice(transactionRelativePath.length + 1),
      );
      await fs.mkdir(path.dirname(temporaryPath), { recursive: true });
      await fs.writeFile(temporaryPath, renderDatum(data[index]!), {
        flag: "wx",
      });
    }
    await fs.writeFile(
      path.join(temporaryDirectory, "execution.json"),
      `${JSON.stringify(executionRecord, null, 2)}\n`,
      { flag: "wx" },
    );
    await fs.mkdir(path.dirname(finalDirectory), { recursive: true });
    await fs.rename(temporaryDirectory, finalDirectory);
  } catch (error) {
    return {
      ok: false,
      diagnostics: [{
        code: (error as NodeJS.ErrnoException).code === "EEXIST"
          ? "scenario-output-collision"
          : "scenario-publication-failed",
        path: transactionRelativePath,
        message: `Scenario execution was not published: ${error instanceof Error ? error.message : String(error)}`,
      }],
    };
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
  return {
    ok: true,
    value: { created, executionPath: executionRelativePath },
    diagnostics: [],
  };
}

export async function reviseDatum(
  root: string,
  processPackage: ProcessPackage,
  packageReference: string,
  packageDigest: string,
  stableId: string,
  fromRevision: string | undefined,
): Promise<RepositoryResult<CreatedDatum>> {
  if (revisionIdentity.test(stableId)) {
    return {
      ok: false,
      diagnostics: [{
        code: "stable-datum-required",
        path: stableId,
        message: `Revision creation requires a Stable Datum ID, received '${stableId}'`,
      }],
    };
  }
  const loaded = await readRepositoryData(root, processPackage);
  if (!loaded.ok) return loaded;
  const lineage = stableLineage(loaded.value, stableId);
  if (lineage.length === 0) {
    return {
      ok: false,
      diagnostics: [{
        code: "unknown-datum",
        path: stableId,
        message: `Unknown Stable Datum '${stableId}'`,
      }],
    };
  }
  const editable = lineage.find((item) => item.lifecycleDatum.storage.editable);
  if (editable) {
    const revisionId = editable.lifecycleDatum.datum.revision_id;
    return {
      ok: false,
      diagnostics: [{
        code: "editable-revision-exists",
        path: revisionId,
        message: `Stable Datum '${stableId}' already has editable Revision '${revisionId}'. Edit or abandon '${revisionId}' before creating another draft.`,
      }],
    };
  }
  const source = fromRevision === undefined
    ? lineage.at(-1)
    : lineage.find((item) => item.lifecycleDatum.datum.revision_id === fromRevision);
  if (!source) {
    return {
      ok: false,
      diagnostics: [{
        code: "unknown-source-revision",
        path: fromRevision ?? stableId,
        message: `Revision source '${fromRevision ?? stableId}' is not in Stable Datum '${stableId}'`,
      }],
    };
  }
  const sourceDatum = source.lifecycleDatum.datum;
  const resolved = resolveType(processPackage, sourceDatum.type);
  if (!resolved.ok) return resolved;
  const authorshipDiagnostic = generatedAuthorshipDiagnostic(
    sourceDatum.type,
    resolved.type.lifecycle,
  );
  if (authorshipDiagnostic) {
    return { ok: false, diagnostics: [authorshipDiagnostic] };
  }
  const revision = Math.max(...lineage.map((item) =>
    item.lifecycleDatum.datum.revision
  )) + 1;
  const revisionId = `${stableId}-r${String(revision).padStart(5, "0")}`;
  const datum = structuredClone(sourceDatum);
  datum.revision = revision;
  datum.revision_id = revisionId;
  datum.created_by.process_ref = `${packageReference}#${packageDigest}`;
  const lifecycleData = loaded.value.map((item) => item.lifecycleDatum);
  const diagnostics = validateDatum(processPackage, datum, lifecycleData);
  if (diagnostics.length > 0) return { ok: false, diagnostics };

  const relativePath = `.lifecycle/data/${datum.type}/${stableId}/${revisionId.slice(-6)}.md`;
  const finalPath = path.join(root, relativePath);
  const temporaryPath = path.join(
    path.dirname(finalPath),
    `.${path.basename(finalPath)}.${randomUUID()}.tmp`,
  );
  try {
    await fs.writeFile(temporaryPath, renderDatum(datum), { flag: "wx" });
    await fs.link(temporaryPath, finalPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      return {
        ok: false,
        diagnostics: [{
          code: "revision-collision",
          path: revisionId,
          message: `Exact Revision '${revisionId}' already exists; history was not rewritten or renumbered`,
        }],
      };
    }
    throw error;
  } finally {
    await fs.rm(temporaryPath, { force: true });
  }
  return {
    ok: true,
    value: {
      id: stableId,
      revisionId,
      type: datum.type,
      path: relativePath,
    },
    diagnostics: [],
  };
}

export async function replaceRepositoryDatum(
  root: string,
  processPackage: ProcessPackage,
  parsed: ParsedDatum[],
  source: ParsedDatum,
  datum: DatumEnvelope,
): Promise<RepositoryResult<DatumEnvelope>> {
  const lifecycleData = parsed.map((item) =>
    item === source ? { ...item.lifecycleDatum, datum } : item.lifecycleDatum
  );
  const diagnostics = validateDatum(processPackage, datum, lifecycleData);
  if (diagnostics.length > 0) return { ok: false, diagnostics };
  const finalPath = path.join(root, source.relativePath);
  const temporaryPath = path.join(
    path.dirname(finalPath),
    `.${path.basename(finalPath)}.${randomUUID()}.tmp`,
  );
  try {
    await fs.writeFile(temporaryPath, renderDatum(datum), { flag: "wx" });
    await fs.rename(temporaryPath, finalPath);
  } finally {
    await fs.rm(temporaryPath, { force: true });
  }
  return { ok: true, value: datum, diagnostics: [] };
}


function durableGraphLinks(
  processPackage: ProcessPackage,
  lifecycleData: LifecycleRecord[],
): GraphLink[] {
  const links: GraphLink[] = [];
  for (const source of lifecycleData) {
    const resolved = resolveType(processPackage, source.datum.type);
    if (!resolved.ok) continue;
    const contracts = new Map(resolved.type.outgoingLinks.map((contract) => [
      String(contract.id),
      contract,
    ]));
    for (const link of source.datum.links) {
      const contract = contracts.get(link.type);
      const target = graphNode(processPackage, lifecycleData, link.target);
      if (!contract || !target) continue;
      links.push({
        source: source.datum.revision_id,
        sourceIdentityKind: "revision",
        sourceType: source.datum.type,
        type: link.type,
        target: link.target,
        targetIdentityKind: target.identityKind,
        inverseLabel: String(contract.inverse_label),
      });
    }
  }
  return links.sort((left, right) =>
    left.source.localeCompare(right.source) ||
    left.type.localeCompare(right.type) ||
    left.target.localeCompare(right.target)
  );
}

export async function mutateDatumLink(
  root: string,
  processPackage: ProcessPackage,
  sourceRevision: string,
  target: string,
  type: string,
  operation: "added" | "removed",
): Promise<RepositoryResult<LinkMutation>> {
  if (!revisionIdentity.test(sourceRevision)) {
    return {
      ok: false,
      diagnostics: [{
        code: "exact-source-revision-required",
        path: sourceRevision,
        message: `Link mutation requires an exact source Revision ID, received '${sourceRevision}'`,
      }],
    };
  }
  const loaded = await readRepositoryData(root, processPackage);
  if (!loaded.ok) return loaded;
  const source = loaded.value.find((item) =>
    item.lifecycleDatum.datum.revision_id === sourceRevision
  );
  if (!source) {
    return {
      ok: false,
      diagnostics: [{
        code: "unknown-source-revision",
        path: sourceRevision,
        message: `Unknown source Revision '${sourceRevision}'`,
      }],
    };
  }
  if (source.lifecycleDatum.storage.frozen) {
    return {
      ok: false,
      diagnostics: [{
        code: "frozen-revision-immutable",
        path: sourceRevision,
        message: `Frozen Revision '${sourceRevision}' cannot be changed`,
      }],
    };
  }

  const datum = structuredClone(source.lifecycleDatum.datum);
  const matching = (link: DatumEnvelope["links"][number]) =>
    link.type === type && link.target === target;
  if (operation === "added") datum.links.push({ type, target });
  else {
    const index = datum.links.findIndex(matching);
    if (index < 0) {
      return {
        ok: false,
        diagnostics: [{
          code: "unknown-outgoing-link-instance",
          path: `${sourceRevision}:${type}:${target}`,
          message: `Revision '${sourceRevision}' has no '${type}' link to '${target}'`,
        }],
      };
    }
    datum.links.splice(index, 1);
  }
  datum.links.sort((left, right) =>
    left.type.localeCompare(right.type) || left.target.localeCompare(right.target)
  );
  const lifecycleData = loaded.value.map((item) =>
    item === source
      ? { ...item.lifecycleDatum, datum }
      : item.lifecycleDatum
  );
  const diagnostics = validateDatum(processPackage, datum, lifecycleData);
  if (diagnostics.length > 0) return { ok: false, diagnostics };

  const finalPath = path.join(root, source.relativePath);
  const temporaryPath = path.join(
    path.dirname(finalPath),
    `.${path.basename(finalPath)}.${randomUUID()}.tmp`,
  );
  try {
    await fs.writeFile(temporaryPath, renderDatum(datum), { flag: "wx" });
    await fs.rename(temporaryPath, finalPath);
  } finally {
    await fs.rm(temporaryPath, { force: true });
  }
  return {
    ok: true,
    value: { operation, sourceRevision, type, target },
    diagnostics: [],
  };
}

export async function inspectBacklinks(
  root: string,
  processPackage: ProcessPackage,
  identity: string,
): Promise<RepositoryResult<BacklinkInspection>> {
  const loaded = await readRepositoryData(root, processPackage);
  if (!loaded.ok) return loaded;
  const lifecycleData = loaded.value.map((item) => item.lifecycleDatum);
  const target = graphNode(processPackage, lifecycleData, identity);
  if (!target) {
    return {
      ok: false,
      diagnostics: [{
        code: "unknown-graph-identity",
        path: identity,
        message: `Unknown graph identity '${identity}'`,
      }],
    };
  }
  return {
    ok: true,
    value: {
      ...target,
      links: durableGraphLinks(processPackage, lifecycleData).filter((link) =>
        link.target === identity
      ),
    },
    diagnostics: [],
  };
}

export async function traceGraph(
  root: string,
  processPackage: ProcessPackage,
  identity: string,
  relation: string | undefined,
  depth: number,
): Promise<RepositoryResult<GraphTrace>> {
  const loaded = await readRepositoryData(root, processPackage);
  if (!loaded.ok) return loaded;
  const lifecycleData = loaded.value.map((item) => item.lifecycleDatum);
  const rootNode = graphNode(processPackage, lifecycleData, identity);
  if (!rootNode) {
    return {
      ok: false,
      diagnostics: [{
        code: "unknown-graph-identity",
        path: identity,
        message: `Unknown graph identity '${identity}'`,
      }],
    };
  }
  const availableLinks = durableGraphLinks(processPackage, lifecycleData)
    .filter((link) => relation === undefined || link.type === relation);
  const sourceStableIds = new Map(lifecycleData.map((item) => [
    item.datum.revision_id,
    item.datum.id,
  ]));
  const nodes = new Map<string, GraphNode>([[identity, rootNode]]);
  const links = new Map<string, GraphLink>();
  let frontier = new Set([identity]);
  for (let level = 0; level < depth && frontier.size > 0; level += 1) {
    const next = new Set<string>();
    for (const link of availableLinks) {
      const sourceStableId = sourceStableIds.get(link.source);
      if (
        !frontier.has(link.source) &&
        !frontier.has(link.target) &&
        (sourceStableId === undefined || !frontier.has(sourceStableId))
      ) continue;
      links.set(`${link.source}\0${link.type}\0${link.target}`, link);
      for (const adjacent of [link.source, link.target]) {
        if (nodes.has(adjacent)) continue;
        const node = graphNode(processPackage, lifecycleData, adjacent);
        if (node) {
          nodes.set(adjacent, node);
          next.add(adjacent);
        }
      }
    }
    frontier = next;
  }
  return {
    ok: true,
    value: {
      root: rootNode,
      depth,
      relation: relation ?? null,
      nodes: [...nodes.values()].sort((left, right) =>
        left.identity.localeCompare(right.identity)
      ),
      links: [...links.values()],
    },
    diagnostics: [],
  };
}

function projections(
  processPackage: ProcessPackage,
  lifecycleData: LifecycleRecord[],
  subject: LifecycleRecord,
  processReference: string,
): DatumProjections {
  let states: Record<string, string | string[]> = {};
  const obligations = new Map<string, ObligationEvaluation>();
  for (const phaseId of Object.keys(processPackage.phases).sort()) {
    const evaluation = evaluateLifecycle(processPackage, {
      processRef: processReference,
      phaseId,
      records: lifecycleData,
      dependencyComparisons: [],
    });
    states = evaluation.artifacts[subject.datum.revision_id]?.states ?? states;
    for (const obligation of evaluation.obligations) {
      if (obligation.subject === subject.datum.revision_id) {
        obligations.set(obligation.id, obligation);
      }
    }
  }
  const backlinks = durableGraphLinks(processPackage, lifecycleData).filter((link) =>
    link.target === subject.datum.id || link.target === subject.datum.revision_id
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

async function publishGeneratedJson(
  filePath: string,
  value: unknown,
): Promise<boolean> {
  try {
    const existing = JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
    if (structuralValuesEqual(existing, value)) return false;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== undefined && code !== "ENOENT") throw error;
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      flag: "wx",
    });
    await fs.rename(temporaryPath, filePath);
  } finally {
    await fs.rm(temporaryPath, { force: true });
  }
  return true;
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
    data: loaded.value.map((item) => ({
      id: item.lifecycleDatum.datum.id,
      revisionId: item.lifecycleDatum.datum.revision_id,
      type: item.lifecycleDatum.datum.type,
      path: item.relativePath,
    })).sort((left, right) =>
      left.type.localeCompare(right.type) ||
      left.id.localeCompare(right.id) ||
      left.revisionId.localeCompare(right.revisionId)
    ),
  };
  const rebuilt = await publishGeneratedJson(indexPath, value);
  return {
    ok: true,
    value: { rebuilt, data: value.data.length, path: relativePath },
    diagnostics: [],
  };
}

export async function rebuildRepositoryReport(
  root: string,
  processPackage: ProcessPackage,
  processReference: string,
): Promise<RepositoryResult<RepositoryReportSummary>> {
  const listed = await listData(root, processPackage, processReference);
  if (!listed.ok) return listed;
  const relativePath = ".lifecycle/generated/reports/lifecycle.json" as const;
  const reportPath = path.join(root, relativePath);
  const value = {
    schemaVersion: 1,
    generatedFrom: {
      package: processReference,
      source: ".lifecycle/data",
    },
    data: listed.value,
  };
  const rebuilt = await publishGeneratedJson(reportPath, value);
  return {
    ok: true,
    value: { rebuilt, data: listed.value.length, path: relativePath },
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
    item.lifecycleDatum.datum.id === identity ||
    item.lifecycleDatum.datum.revision_id === identity
  );
  candidates.sort((left, right) =>
    right.lifecycleDatum.datum.revision - left.lifecycleDatum.datum.revision
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
  const lifecycleData = loaded.value.map((item) => item.lifecycleDatum);
  return {
    ok: true,
    value: {
      lifecycleDatum: selected.lifecycleDatum,
      projections: projections(
        processPackage,
        lifecycleData,
        selected.lifecycleDatum,
        processReference,
      ),
    },
    diagnostics: [],
  };
}

export async function datumHistory(
  root: string,
  processPackage: ProcessPackage,
  stableId: string,
): Promise<RepositoryResult<DatumHistory>> {
  const loaded = await readRepositoryData(root, processPackage);
  if (!loaded.ok) return loaded;
  const lineage = stableLineage(loaded.value, stableId);
  const first = lineage[0];
  if (!first) {
    return {
      ok: false,
      diagnostics: [{
        code: "unknown-datum",
        path: stableId,
        message: `Unknown Stable Datum '${stableId}'`,
      }],
    };
  }
  const memberships = frozenRevisionMemberships(
    processPackage,
    loaded.value.map((item) => item.lifecycleDatum),
  );
  return {
    ok: true,
    value: {
      id: stableId,
      type: first.lifecycleDatum.datum.type,
      revisions: lineage.map((item) => {
        const datum = item.lifecycleDatum.datum;
        return {
          revision: datum.revision,
          revisionId: datum.revision_id,
          classification: item.lifecycleDatum.storage.frozen
            ? "frozen-history" as const
            : "editable-work" as const,
          frozenBy: memberships.get(datum.revision_id) ?? [],
          processRef: datum.created_by.process_ref,
        };
      }),
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
    const current = selected.get(item.lifecycleDatum.datum.id);
    if (
      !current ||
      current.lifecycleDatum.datum.revision < item.lifecycleDatum.datum.revision
    ) {
      selected.set(item.lifecycleDatum.datum.id, item);
    }
  }
  const lifecycleData = loaded.value.map((item) => item.lifecycleDatum);
  const result = [...selected.values()].map((item) => ({
    lifecycleDatum: item.lifecycleDatum,
    projections: projections(
      processPackage,
      lifecycleData,
      item.lifecycleDatum,
      processReference,
    ),
  }));
  result.sort((left, right) =>
    left.lifecycleDatum.datum.type.localeCompare(right.lifecycleDatum.datum.type) ||
    left.lifecycleDatum.datum.id.localeCompare(right.lifecycleDatum.datum.id)
  );
  return { ok: true, value: result, diagnostics: [] };
}
