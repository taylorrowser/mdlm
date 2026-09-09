import type { DatumEnvelope, LifecycleRecord } from "./index.js";
import type { ProcessDiagnostic, ProcessPackage, ResolvedType } from "./index.js";

export interface PayloadReferenceRule {
  field: string;
  target: string;
  key: string;
  link?: string;
  covered?: boolean;
  acyclic?: boolean;
}
export interface PayloadCollection {
  path: string;
  key?: string;
  references?: PayloadReferenceRule[];
}
export interface PayloadView {
  title: string;
  path: string;
  columns: { title: string; fragments: { field: string; prefix?: string; suffix?: string }[] }[];
}
export interface RenderedPayloadView { title: string; columns: string[]; rows: string[][] }

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}
function at(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => object(value)?.[key], value);
}
function values(value: unknown): unknown[] { return Array.isArray(value) ? value : value === undefined ? [] : [value]; }
function diagnostic(path: string, message: string): ProcessDiagnostic {
  return { code: "datum-payload", path: `payload.${path}`, message };
}

/** Fixed collection relations, with all field and link choices supplied by the package. */
export function validatePayloadCollections(
  type: Pick<ResolvedType, "payloadCollections">,
  datum: DatumEnvelope,
  records: readonly LifecycleRecord[],
): ProcessDiagnostic[] {
  const diagnostics: ProcessDiagnostic[] = [];
  for (const collection of type.payloadCollections) {
    const rows = at(datum.payload, collection.path);
    if (!Array.isArray(rows)) continue; // JSON Schema owns shape failures.
    if (collection.key) {
      const seen = new Set<unknown>();
      rows.forEach((row, index) => {
        const key = at(row, collection.key!);
        if (seen.has(key)) diagnostics.push(diagnostic(`${collection.path}[${index}].${collection.key}`, `Duplicate local key '${String(key)}'`));
        seen.add(key);
      });
    }
    for (const rule of collection.references ?? []) {
      let targetPayload: unknown = datum.payload;
      if (rule.link) {
        const links = datum.links.filter((link) => link.type === rule.link);
        const target = links.length === 1 ? records.find((record) => record.datum.revision_id === links[0]!.target) : undefined;
        if (!target) {
          diagnostics.push(diagnostic(collection.path, `Cannot resolve one exact revision through '${rule.link}' for reference validation`));
          continue;
        }
        targetPayload = target.datum.payload;
      }
      const targets = at(targetPayload, rule.target);
      if (!Array.isArray(targets)) {
        diagnostics.push(diagnostic(collection.path, `Reference target '${rule.target}' is not an array`));
        continue;
      }
      const keys = new Set(targets.map((row) => at(row, rule.key)));
      const covered = new Set<unknown>();
      rows.forEach((row, index) => values(at(row, rule.field)).forEach((reference) => {
        if (!keys.has(reference)) diagnostics.push(diagnostic(`${collection.path}[${index}].${rule.field}`, `Unknown reference '${String(reference)}' in '${rule.target}'`));
        else covered.add(reference);
      }));
      if (rule.covered) for (const key of keys) {
        if (!covered.has(key)) diagnostics.push(diagnostic(collection.path, `No declared mapping covers '${String(key)}' in '${rule.target}'`));
      }
      if (rule.acyclic && collection.key) {
        const byKey = new Map(rows.map((row) => [at(row, collection.key!), row]));
        const visited = new Set<unknown>();
        const visiting = new Set<unknown>();
        const cycle = (key: unknown): boolean => {
          if (visiting.has(key)) return true;
          if (visited.has(key)) return false;
          const row = byKey.get(key);
          if (!row) return false;
          visiting.add(key);
          for (const parent of values(at(row, rule.field))) if (cycle(parent)) return true;
          visiting.delete(key);
          visited.add(key);
          return false;
        };
        if ([...byKey.keys()].some(cycle)) diagnostics.push(diagnostic(`${collection.path}.${rule.field}`, "Parent references contain a cycle"));
      }
    }
  }
  return diagnostics;
}

/** Read-only rows. Literal fragments and field lookup are the entire rendering contract. */
export function renderPayloadViews(type: Pick<ResolvedType, "payloadViews">, payload: unknown): RenderedPayloadView[] {
  return type.payloadViews.map((view) => ({
    title: view.title,
    columns: view.columns.map((column) => column.title),
    rows: values(at(payload, view.path)).map((row) => view.columns.map((column) => column.fragments.map((fragment) => {
      const value = at(row, fragment.field);
      if (value === undefined || value === null) return "";
      const text = Array.isArray(value) ? value.join(", ") : String(value);
      return `${fragment.prefix ?? ""}${text}${fragment.suffix ?? ""}`;
    }).join(""))),
  }));
}

function schemaAt(schema: unknown, path: string): Record<string, unknown> | undefined {
  let result = object(schema);
  for (const field of path.split(".")) result = object(object(result?.properties)?.[field]);
  return result;
}

/** Reject misspelled declaration paths at package loading instead of silently skipping checks. */
export function validatePayloadCollectionDefinitions(
  pkg: ProcessPackage,
  resolve: (id: string) => ResolvedType | undefined,
): ProcessDiagnostic[] {
  const diagnostics: ProcessDiagnostic[] = [];
  for (const id of Object.keys(pkg.types)) {
    const type = resolve(id);
    if (!type) continue;
    const bad = (path: string, message: string) => diagnostics.push({ code: "payload-collection-contract", path: `types.${id}.${path}`, message });
    for (const collection of type.payloadCollections) {
      const schema = schemaAt(type.payloadSchema, collection.path);
      const item = schema?.items;
      if (schema?.type !== "array") bad("payload_collections", `Unknown array '${collection.path}'`);
      if (collection.key && schemaAt(item, collection.key)?.type !== "string") bad("payload_collections", `Key '${collection.path}.${collection.key}' must be a string field`);
      for (const rule of collection.references ?? []) {
        const source = schemaAt(item, rule.field);
        if (!(source?.type === "string" || (source?.type === "array" && object(source.items)?.type === "string"))) bad("payload_collections", `Reference '${collection.path}.${rule.field}' must be a string or string array`);
        let targets = [type];
        if (rule.link) {
          const link = type.outgoingLinks.find((link) => link.id === rule.link);
          const definitions = values(link?.targets).map(object);
          if (!link || definitions.some((target) => target?.identity !== "revision") || object(link.cardinality)?.minimum !== 1 || object(link.cardinality)?.maximum !== 1) bad("payload_collections", `Reference link '${rule.link}' must select one exact revision`);
          targets = definitions.flatMap((target) => values(target?.types)).flatMap((target) => typeof target === "string" && resolve(target) ? [resolve(target)!] : []);
          if (targets.length === 0) bad("payload_collections", `Reference link '${rule.link}' has no resolved target type`);
        }
        for (const target of targets) {
          const targetSchema = schemaAt(target.payloadSchema, rule.target);
          if (targetSchema?.type !== "array" || schemaAt(targetSchema.items, rule.key)?.type !== "string") bad("payload_collections", `Unknown string key '${rule.target}.${rule.key}' on reference target`);
        }
        if (rule.acyclic && (rule.link || rule.target !== collection.path || rule.key !== collection.key)) bad("payload_collections", "Acyclic references must target their own keyed collection");
      }
    }
    for (const view of type.payloadViews) {
      const schema = schemaAt(type.payloadSchema, view.path);
      if (schema?.type !== "array") bad("payload_views", `Unknown view array '${view.path}'`);
      for (const column of view.columns) for (const fragment of column.fragments) {
        const field = schemaAt(schema?.items, fragment.field);
        if (!field || !["string", "integer", "number", "boolean", "array"].includes(String(field.type))) bad("payload_views", `Unknown scalar or array view field '${view.path}.${fragment.field}'`);
      }
    }
  }
  return diagnostics;
}
