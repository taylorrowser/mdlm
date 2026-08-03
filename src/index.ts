import { promises as fs } from "node:fs";
import path from "node:path";
import {
  Ajv2020,
  type ErrorObject,
  type ValidateFunction,
} from "ajv/dist/2020.js";
import formatsPlugin from "ajv-formats";
import { parse } from "yaml";
import { compileDefinitionExpressions } from "./expression.js";

export {
  evaluateLifecycle,
  type ArtifactEvaluation,
  type DatumEnvelope,
  type DependencyChange,
  type LifecycleEvaluation,
  type LifecycleRecord,
  type LifecycleSnapshot,
  type ObligationEvaluation,
} from "./evaluator.js";

export interface ProcessDiagnostic {
  code: string;
  message: string;
  path?: string;
  line?: number;
  column?: number;
  source?: string;
}

export interface ProcessManifest {
  id: string;
  version: string;
  [key: string]: unknown;
}

export interface VersionedDefinition {
  id: string;
  version: number;
  kind: string;
  [key: string]: unknown;
}

export interface ProcessPackage {
  root: string;
  manifest: ProcessManifest;
  envelopeSchema: Record<string, unknown>;
  templates: Record<string, VersionedDefinition>;
  types: Record<string, VersionedDefinition>;
  policies: Record<string, VersionedDefinition>;
  states: Record<string, VersionedDefinition>;
  selectors: Record<string, VersionedDefinition>;
  obligations: Record<string, VersionedDefinition>;
  scenarios: Record<string, VersionedDefinition>;
  phases: Record<string, VersionedDefinition>;
  profiles: Record<string, VersionedDefinition>;
  primitives: Record<string, VersionedDefinition>;
}

export interface ResolvedType {
  id: string;
  name: string;
  description: string;
  templateChain: string[];
  envelopeSchema: Record<string, unknown>;
  payloadSchema: {
    $schema: string;
    type: "object";
    additionalProperties: false;
    required: string[];
    properties: Record<string, unknown>;
  };
  outgoingLinks: Record<string, unknown>[];
  lifecycle: Record<string, unknown>;
  kernelManagedPayloadPaths: string[];
}

export type ResolveTypeResult =
  | { ok: true; type: ResolvedType; diagnostics: [] }
  | { ok: false; diagnostics: ProcessDiagnostic[] };

export type LoadProcessPackageResult =
  | { ok: true; package: ProcessPackage; diagnostics: [] }
  | { ok: false; diagnostics: ProcessDiagnostic[] };

const definitionSchemas = {
  templates: "template-definition.schema.json",
  types: "type-definition.schema.json",
  policies: "policy-definition.schema.json",
  states: "state-definition.schema.json",
  selectors: "selector-definition.schema.json",
  obligations: "obligation-definition.schema.json",
  scenarios: "scenario-definition.schema.json",
  phases: "phase-definition.schema.json",
  profiles: "profile-definition.schema.json",
  primitives: "primitive-catalog.schema.json",
} as const;

type DefinitionGroup = keyof typeof definitionSchemas;

async function readYaml(filePath: string): Promise<unknown> {
  return parse(await fs.readFile(filePath, "utf8"));
}

async function yamlFiles(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return yamlFiles(entryPath);
      return entry.isFile() && entry.name.endsWith(".yaml") ? [entryPath] : [];
    }),
  );
  return files.flat().sort();
}

function formatAjvErrors(
  filePath: string,
  errors: ErrorObject[] | null | undefined,
): ProcessDiagnostic[] {
  return (errors ?? []).map((error) => ({
    code: "meta-schema",
    path: `${filePath}${error.instancePath}`,
    message: error.message ?? "Process definition failed meta-schema validation",
  }));
}

function isVersionedDefinition(value: unknown): value is VersionedDefinition {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).id === "string" &&
    typeof (value as Record<string, unknown>).version === "number" &&
    typeof (value as Record<string, unknown>).kind === "string"
  );
}

function validateVersionedReference(
  reference: string,
  definitions: Record<string, VersionedDefinition>,
  pathLabel: string,
): ProcessDiagnostic[] {
  const match = /^(.*)@([1-9][0-9]*)$/.exec(reference);
  if (!match) {
    return [
      {
        code: "invalid-reference",
        path: pathLabel,
        message: `Invalid versioned reference '${reference}'`,
      },
    ];
  }
  const [, id, version] = match;
  const definition = id === undefined ? undefined : definitions[id];
  if (!definition) {
    return [
      {
        code: "unknown-reference",
        path: pathLabel,
        message: `Unknown definition reference '${reference}'`,
      },
    ];
  }
  if (String(definition.version) !== version) {
    return [
      {
        code: "version-mismatch",
        path: pathLabel,
        message: `Reference '${reference}' resolves to ${id}@${definition.version}`,
      },
    ];
  }
  return [];
}

function validateDefinitionReferences(
  definitions: Record<DefinitionGroup, Record<string, VersionedDefinition>>,
): ProcessDiagnostic[] {
  const diagnostics: ProcessDiagnostic[] = [];

  for (const [group, byId] of [
    ["templates", definitions.templates],
    ["types", definitions.types],
  ] as const) {
    for (const [id, definition] of Object.entries(byId)) {
      if (typeof definition.extends === "string") {
        diagnostics.push(
          ...validateVersionedReference(
            definition.extends,
            definitions.templates,
            `${group}.${id}.extends`,
          ),
        );
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visitTemplate = (id: string, chain: string[]): void => {
    if (visiting.has(id)) {
      diagnostics.push({
        code: "reference-cycle",
        path: `templates.${id}.extends`,
        message: `The template inheritance graph contains a cycle: ${[...chain, id].join(" -> ")}`,
      });
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    const parentReference = definitions.templates[id]?.extends;
    const parent = referenceParts(parentReference)?.[0];
    if (parent && definitions.templates[parent]) {
      visitTemplate(parent, [...chain, id]);
    }
    visiting.delete(id);
    visited.add(id);
  };
  Object.keys(definitions.templates).forEach((id) => visitTemplate(id, []));

  const visit = (value: unknown, pathLabel: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${pathLabel}[${index}]`));
      return;
    }
    if (typeof value !== "object" || value === null) return;
    for (const [key, child] of Object.entries(value)) {
      const childPath = `${pathLabel}.${key}`;
      if (key === "selector" && typeof child === "string") {
        diagnostics.push(
          ...validateVersionedReference(
            child,
            definitions.selectors,
            childPath,
          ),
        );
      }
      visit(child, childPath);
    }
  };

  for (const [group, byId] of Object.entries(definitions)) {
    for (const [id, definition] of Object.entries(byId)) {
      visit(definition, `${group}.${id}`);
    }
  }
  return diagnostics;
}

async function createMetaValidators(
  metaDirectory: string,
): Promise<Map<string, ValidateFunction>> {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const addFormats = formatsPlugin as unknown as (
    instance: Ajv2020,
  ) => Ajv2020;
  addFormats(ajv);

  const schemaFiles = (await fs.readdir(metaDirectory))
    .filter((name) => name.endsWith(".json"))
    .sort();
  const schemas = await Promise.all(
    schemaFiles.map(async (name) => ({
      name,
      schema: JSON.parse(await fs.readFile(path.join(metaDirectory, name), "utf8")),
    })),
  );

  for (const { schema } of schemas) ajv.addSchema(schema);

  const validators = new Map<string, ValidateFunction>();
  for (const { name, schema } of schemas) {
    const id = (schema as { $id?: string }).$id;
    if (!id) continue;
    const validator = ajv.getSchema(id);
    if (validator) validators.set(name, validator);
  }
  return validators;
}

export async function loadProcessPackage(
  root: string,
): Promise<LoadProcessPackageResult> {
  const diagnostics: ProcessDiagnostic[] = [];

  try {
    const metaDirectory = path.join(root, "meta");
    const validators = await createMetaValidators(metaDirectory);
    const envelopeSchema = JSON.parse(
      await fs.readFile(path.join(metaDirectory, "datum-envelope.schema.json"), "utf8"),
    ) as Record<string, unknown>;
    const manifestPath = path.join(root, "manifest.yaml");
    const manifest = await readYaml(manifestPath);
    const manifestValidator = validators.get("manifest.schema.json");
    if (!manifestValidator || !manifestValidator(manifest)) {
      diagnostics.push(
        ...formatAjvErrors(manifestPath, manifestValidator?.errors),
      );
    }

    const definitions = {} as Record<
      DefinitionGroup,
      Record<string, VersionedDefinition>
    >;

    for (const [group, schemaName] of Object.entries(definitionSchemas) as [
      DefinitionGroup,
      string,
    ][]) {
      const validator = validators.get(schemaName);
      const byId: Record<string, VersionedDefinition> = {};
      for (const filePath of await yamlFiles(path.join(root, group))) {
        const definition = await readYaml(filePath);
        if (!validator || !validator(definition)) {
          diagnostics.push(...formatAjvErrors(filePath, validator?.errors));
          continue;
        }
        if (!isVersionedDefinition(definition)) {
          diagnostics.push({
            code: "definition-envelope",
            path: filePath,
            message: "Definition lacks a stable id, integer version, or kind",
          });
          continue;
        }
        if (byId[definition.id]) {
          diagnostics.push({
            code: "duplicate-definition",
            path: filePath,
            message: `Duplicate ${group} definition '${definition.id}'`,
          });
          continue;
        }
        if (group === "states" || group === "policies") {
          diagnostics.push(...compileDefinitionExpressions(definition, filePath));
        }
        byId[definition.id] = definition;
      }
      definitions[group] = byId;
    }

    diagnostics.push(...validateDefinitionReferences(definitions));
    if (diagnostics.length > 0) return { ok: false, diagnostics };
    if (
      typeof manifest !== "object" ||
      manifest === null ||
      typeof (manifest as Record<string, unknown>).id !== "string" ||
      typeof (manifest as Record<string, unknown>).version !== "string"
    ) {
      return {
        ok: false,
        diagnostics: [
          {
            code: "manifest-envelope",
            path: manifestPath,
            message: "Manifest lacks a stable id or semantic version",
          },
        ],
      };
    }

    return {
      ok: true,
      package: {
        root,
        manifest: manifest as ProcessManifest,
        envelopeSchema,
        ...definitions,
      },
      diagnostics: [],
    };
  } catch (error) {
    return {
      ok: false,
      diagnostics: [
        {
          code: "package-load",
          path: root,
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
}

function referenceParts(reference: unknown): [string, number] | undefined {
  if (typeof reference !== "string") return undefined;
  const match = /^(.*)@([1-9][0-9]*)$/.exec(reference);
  if (!match?.[1] || !match[2]) return undefined;
  return [match[1], Number(match[2])];
}

function payloadFragment(definition: VersionedDefinition): {
  required: string[];
  properties: Record<string, unknown>;
} {
  const schema = definition.payload_schema as Record<string, unknown> | undefined;
  return {
    required: Array.isArray(schema?.required)
      ? schema.required.filter((item): item is string => typeof item === "string")
      : [],
    properties:
      typeof schema?.properties === "object" && schema.properties !== null
        ? (schema.properties as Record<string, unknown>)
        : {},
  };
}

export function resolveType(
  processPackage: ProcessPackage,
  typeId: string,
): ResolveTypeResult {
  const typeDefinition = processPackage.types[typeId];
  if (!typeDefinition) {
    return {
      ok: false,
      diagnostics: [
        {
          code: "unknown-type",
          path: `types.${typeId}`,
          message: `Unknown lifecycle type '${typeId}'`,
        },
      ],
    };
  }

  const diagnostics: ProcessDiagnostic[] = [];
  const templates: VersionedDefinition[] = [];
  const visiting = new Set<string>();
  let reference = typeDefinition.extends;
  while (reference !== undefined) {
    const parts = referenceParts(reference);
    if (!parts) {
      diagnostics.push({
        code: "invalid-reference",
        path: `types.${typeId}.extends`,
        message: `Invalid template reference '${String(reference)}'`,
      });
      break;
    }
    const [templateId, expectedVersion] = parts;
    if (visiting.has(templateId)) {
      diagnostics.push({
        code: "template-cycle",
        path: `templates.${templateId}.extends`,
        message: `Template inheritance cycle includes '${templateId}'`,
      });
      break;
    }
    const template = processPackage.templates[templateId];
    if (!template) {
      diagnostics.push({
        code: "unknown-reference",
        path: `types.${typeId}.extends`,
        message: `Unknown template reference '${String(reference)}'`,
      });
      break;
    }
    if (template.version !== expectedVersion) {
      diagnostics.push({
        code: "version-mismatch",
        path: `types.${typeId}.extends`,
        message: `Template '${templateId}' is version ${template.version}, not ${expectedVersion}`,
      });
      break;
    }
    visiting.add(templateId);
    templates.unshift(template);
    reference = template.extends;
  }

  if (diagnostics.length > 0) return { ok: false, diagnostics };

  const required = new Set<string>();
  const properties: Record<string, unknown> = {};
  const outgoingLinks: Record<string, unknown>[] = [];
  const linkIds = new Set<string>();

  for (const definition of [...templates, typeDefinition]) {
    const fragment = payloadFragment(definition);
    fragment.required.forEach((field) => required.add(field));
    Object.assign(properties, fragment.properties);
    const links = Array.isArray(definition.outgoing_links)
      ? definition.outgoing_links
      : [];
    for (const link of links) {
      if (typeof link !== "object" || link === null) continue;
      const id = (link as Record<string, unknown>).id;
      if (typeof id !== "string") continue;
      if (linkIds.has(id)) {
        diagnostics.push({
          code: "duplicate-inherited-link",
          path: `types.${typeId}.outgoing_links`,
          message: `Resolved type '${typeId}' declares outgoing link '${id}' more than once`,
        });
      } else {
        linkIds.add(id);
        outgoingLinks.push(link as Record<string, unknown>);
      }
    }
  }

  if (diagnostics.length > 0) return { ok: false, diagnostics };

  return {
    ok: true,
    type: {
      id: typeId,
      name: String(typeDefinition.name),
      description: String(typeDefinition.description),
      templateChain: templates.map(
        (template) => `${template.id}@${template.version}`,
      ),
      envelopeSchema: processPackage.envelopeSchema,
      payloadSchema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        additionalProperties: false,
        required: [...required].sort(),
        properties,
      },
      outgoingLinks,
      lifecycle: (typeDefinition.lifecycle ?? {}) as Record<string, unknown>,
      kernelManagedPayloadPaths: Array.isArray(
        typeDefinition.kernel_managed_payload_paths,
      )
        ? typeDefinition.kernel_managed_payload_paths.filter(
            (item): item is string => typeof item === "string",
          )
        : [],
    },
    diagnostics: [],
  };
}
