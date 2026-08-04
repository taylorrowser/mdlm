import { promises as fs } from "node:fs";
import path from "node:path";
import {
  Ajv2020,
  type ErrorObject,
  type ValidateFunction,
} from "ajv/dist/2020.js";
import formatsPlugin from "ajv-formats";
import { parse } from "yaml";
import { validateDefinitionGraph } from "./definition-graph.js";
import { compileDefinitionExpressions } from "./expression.js";
import { validatePayloadInheritance } from "./payload-inheritance.js";
import { validateScenarioContracts } from "./scenario-contract.js";

export {
  evaluateLifecycle,
  type ArtifactEvaluation,
  type DatumEnvelope,
  type ExactTypedEntity,
  type HistoricalLifecycleSnapshot,
  type LifecycleEvaluation,
  type LifecycleRecord,
  type LifecycleSnapshot,
  type ObligationEvaluation,
  type ObligationHistoryEvaluation,
  type PhaseEvaluation,
  type PhaseExpressionEvidence,
  type SelectorEvaluationEvidence,
} from "./evaluator.js";
export type {
  BaselineCompositionDependencyChange,
  BaselineMembershipDependencyChange,
  ContentDependencyChange,
  DependencyChangeRecord,
  DependencyComparison,
  EvidenceTargetDependencyChange,
  OutboundLinkDependencyChange,
  ReviewContextDependencyChange,
  StableLinkResolution,
  StableLinkResolutionDependencyChange,
} from "./dependency-changes.js";

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

export interface KernelCapabilityBinding {
  type: string;
}

export interface ProcessPackage {
  root: string;
  manifest: ProcessManifest;
  kernelCapabilities: Record<string, KernelCapabilityBinding>;
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
  aliases: Record<string, VersionedDefinition>;
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
  kernelCapabilities: string[];
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
  aliases: "command-alias-definition.schema.json",
  primitives: "primitive-catalog.schema.json",
} as const;

type DefinitionGroup = keyof typeof definitionSchemas;

const exactBaselineCapability = {
  reference: "exact-baseline@1",
  managedPayloadPaths: ["definition_members", "evidence", "snapshot"],
  payloadFields: {
    definition_members: "array:string",
    evidence: "array:string",
    snapshot: "object",
  },
} as const;

const exactBaselineRelations = new Set([
  "baseline-members",
  "baseline-evidence",
  "baseline-memberships",
  "baseline-composed",
]);

function capabilityPrimitiveDiagnostics(
  definition: VersionedDefinition,
  filePath: string,
  capabilityBindings: unknown,
): ProcessDiagnostic[] {
  if (definition.kind !== "selector-definition") return [];
  if (
    typeof capabilityBindings === "object" &&
    capabilityBindings !== null &&
    Object.keys(capabilityBindings).some((reference) =>
      reference.startsWith("exact-baseline@")
    )
  ) {
    return [];
  }
  const query = typeof definition.query === "object" &&
      definition.query !== null
    ? definition.query as Record<string, unknown>
    : undefined;
  const from = typeof query?.from === "object" && query.from !== null
    ? query.from as Record<string, unknown>
    : undefined;
  if (from?.collection === "baselines") {
    return [{
      code: "capability-required",
      path: `${filePath}#query.from.collection`,
      message:
        "Collection 'baselines' requires Kernel Capability exact-baseline@1",
    }];
  }
  if (
    typeof from?.relation === "string" &&
    exactBaselineRelations.has(from.relation)
  ) {
    return [{
      code: "capability-required",
      path: `${filePath}#query.from.relation`,
      message: `Relation '${from.relation}' requires Kernel Capability exact-baseline@1`,
    }];
  }
  return [];
}

function validateKernelCapabilities(
  processPackage: ProcessPackage,
): ProcessDiagnostic[] {
  const diagnostics: ProcessDiagnostic[] = [];
  for (const [reference, binding] of Object.entries(
    processPackage.kernelCapabilities,
  )) {
    const bindingPath = `manifest.kernel_capabilities.${reference}.type`;
    if (reference !== exactBaselineCapability.reference) {
      diagnostics.push({
        code: "unknown-kernel-capability",
        path: bindingPath,
        message: `Unknown Kernel Capability '${reference}'`,
      });
      continue;
    }
    if (!processPackage.types[binding.type]) {
      diagnostics.push({
        code: "unknown-capability-type",
        path: bindingPath,
        message: `Kernel Capability '${reference}' binds unknown lifecycle type '${binding.type}'`,
      });
      continue;
    }
    const resolved = resolveType(processPackage, binding.type);
    if (!resolved.ok) {
      diagnostics.push(...resolved.diagnostics);
      continue;
    }
    const properties = resolved.type.payloadSchema.properties;
    const missingFields = Object.keys(
      exactBaselineCapability.payloadFields,
    ).filter((field) => properties[field] === undefined);
    if (missingFields.length > 0) {
      diagnostics.push({
        code: "incompatible-kernel-capability",
        path: bindingPath,
        message: `Type '${binding.type}' bound to ${reference} must define capability payload fields: ${missingFields.join(", ")}`,
      });
    }
    for (const [field, expected] of Object.entries(
      exactBaselineCapability.payloadFields,
    )) {
      const schema = properties[field];
      if (typeof schema !== "object" || schema === null) continue;
      const fieldSchema = schema as Record<string, unknown>;
      const items = typeof fieldSchema.items === "object" &&
          fieldSchema.items !== null
        ? fieldSchema.items as Record<string, unknown>
        : undefined;
      const compatible = expected === "object"
        ? fieldSchema.type === "object"
        : fieldSchema.type === "array" && items?.type === "string";
      if (!compatible) {
        diagnostics.push({
          code: "incompatible-kernel-capability",
          path: `types.${binding.type}.payload_schema.properties.${field}`,
          message: `${reference} requires '${field}' to be ${expected === "object" ? "an object" : "an array of strings"}`,
        });
      }
    }
    const compositionLink = resolved.type.outgoingLinks.find(
      (link) => link.id === "composes",
    );
    const compositionTargets =
      typeof compositionLink === "object" && compositionLink !== null &&
        Array.isArray(compositionLink.targets)
        ? compositionLink.targets
        : [];
    const supportsExactComposition = compositionTargets.some((target) => {
      if (typeof target !== "object" || target === null) return false;
      const contract = target as Record<string, unknown>;
      return contract.identity === "revision" &&
        Array.isArray(contract.types) &&
        contract.types.includes(binding.type);
    });
    if (!supportsExactComposition) {
      diagnostics.push({
        code: "incompatible-kernel-capability",
        path: `types.${binding.type}.outgoing_links`,
        message: `Type '${binding.type}' bound to ${reference} must declare the 'composes' exact-revision link to ${binding.type}`,
      });
    }
    const managedPaths = new Set(resolved.type.kernelManagedPayloadPaths);
    const missingManagedPaths = exactBaselineCapability.managedPayloadPaths.filter(
      (payloadPath) => !managedPaths.has(payloadPath),
    );
    if (missingManagedPaths.length > 0) {
      diagnostics.push({
        code: "incompatible-kernel-capability",
        path: bindingPath,
        message: `Type '${binding.type}' bound to ${reference} must declare kernel-managed payload paths: ${missingManagedPaths.join(", ")}`,
      });
    }
  }
  return diagnostics;
}

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

function legacyExpressionAuthoringDiagnostics(
  value: unknown,
  filePath: string,
): ProcessDiagnostic[] {
  if (typeof value !== "object" || value === null) return [];
  const definition = value as Record<string, unknown>;
  const diagnostics: ProcessDiagnostic[] = [];
  const check = (expression: unknown, expressionPath: string): void => {
    if (typeof expression === "object" && expression !== null) {
      diagnostics.push({
        code: "legacy-expression-authoring",
        path: `${filePath}#${expressionPath}`,
        message:
          "Expression-bearing fields require mdlm-expression@1 textual source; legacy YAML expression trees are not accepted",
      });
    }
  };
  const checkRules = (rules: unknown, prefix: string): void => {
    if (!Array.isArray(rules)) return;
    rules.forEach((rule, index) => {
      if (typeof rule !== "object" || rule === null) return;
      const ruleRecord = rule as Record<string, unknown>;
      check(ruleRecord.when, `${prefix}[${index}].when`);
      check(
        ruleRecord.explanation_evidence,
        `${prefix}[${index}].explanation_evidence`,
      );
      const blockers = Array.isArray(ruleRecord.blocked_by)
        ? ruleRecord.blocked_by
        : [];
      blockers.forEach((blocker, blockerIndex) => {
        if (typeof blocker !== "object" || blocker === null) return;
        check(
          (blocker as Record<string, unknown>).subjects,
          `${prefix}[${index}].blocked_by[${blockerIndex}].subjects`,
        );
      });
    });
  };
  const checkArguments = (argumentsValue: unknown, prefix: string): void => {
    if (typeof argumentsValue !== "object" || argumentsValue === null) return;
    for (const [name, argument] of Object.entries(argumentsValue)) {
      check(argument, `${prefix}.${name}`);
    }
  };

  switch (definition.kind) {
    case "state-definition":
    case "policy-definition":
      checkRules(definition.rules, "rules");
      break;
    case "selector-definition": {
      const query = typeof definition.query === "object" && definition.query !== null
        ? definition.query as Record<string, unknown>
        : undefined;
      const from = typeof query?.from === "object" && query.from !== null
        ? query.from as Record<string, unknown>
        : undefined;
      check(query?.where, "query.where");
      check(from?.of, "query.from.of");
      checkArguments(from?.arguments, "query.from.arguments");
      break;
    }
    case "obligation-definition": {
      check(definition.for_each, "for_each");
      check(definition.satisfied_when, "satisfied_when");
      checkRules(definition.status_rules, "status_rules");
      const resolver = typeof definition.resolve_with === "object" &&
          definition.resolve_with !== null
        ? definition.resolve_with as Record<string, unknown>
        : undefined;
      const dispatch = typeof resolver?.dispatch === "object" &&
          resolver.dispatch !== null
        ? resolver.dispatch as Record<string, unknown>
        : undefined;
      check(dispatch?.for_each, "resolve_with.dispatch.for_each");
      checkArguments(resolver?.inputs, "resolve_with.inputs");
      break;
    }
    case "scenario-definition": {
      check(definition.completion, "completion");
      const inputs = Array.isArray(definition.inputs) ? definition.inputs : [];
      inputs.forEach((input, index) => {
        if (typeof input !== "object" || input === null) return;
        check(
          (input as Record<string, unknown>).conditions,
          `inputs[${index}].conditions`,
        );
      });
      break;
    }
    case "phase-definition": {
      check(definition.entry, "entry");
      const gate = typeof definition.gate === "object" && definition.gate !== null
        ? definition.gate as Record<string, unknown>
        : undefined;
      check(gate?.candidate_selector, "gate.candidate_selector");
      check(gate?.completion, "gate.completion");
      break;
    }
  }
  return diagnostics;
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
    const expressionDefinitions: {
      definition: VersionedDefinition;
      filePath: string;
    }[] = [];

    for (const [group, schemaName] of Object.entries(definitionSchemas) as [
      DefinitionGroup,
      string,
    ][]) {
      const validator = validators.get(schemaName);
      const byId: Record<string, VersionedDefinition> = {};
      for (const filePath of await yamlFiles(path.join(root, group))) {
        const definition = await readYaml(filePath);
        diagnostics.push(
          ...legacyExpressionAuthoringDiagnostics(definition, filePath),
        );
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
        diagnostics.push(
          ...capabilityPrimitiveDiagnostics(
            definition,
            filePath,
            typeof manifest === "object" && manifest !== null
              ? (manifest as Record<string, unknown>).kernel_capabilities
              : undefined,
          ),
        );
        if (byId[definition.id]) {
          diagnostics.push({
            code: "duplicate-definition",
            path: filePath,
            message: `Duplicate ${group} definition '${definition.id}'`,
          });
          continue;
        }
        if (
          group === "states" ||
          group === "policies" ||
          group === "selectors" ||
          group === "obligations" ||
          group === "scenarios" ||
          group === "phases"
        ) {
          expressionDefinitions.push({ definition, filePath });
        }
        byId[definition.id] = definition;
      }
      definitions[group] = byId;
    }

    if (diagnostics.length > 0) return { ok: false, diagnostics };

    for (const { definition, filePath } of expressionDefinitions) {
      diagnostics.push(
        ...compileDefinitionExpressions(
          definition,
          filePath,
          {
            selectors: definitions.selectors,
            states: definitions.states,
            policies: definitions.policies,
          },
        ),
      );
    }

    diagnostics.push(...validateDefinitionGraph(manifest, definitions));
    diagnostics.push(...validatePayloadInheritance(definitions));
    diagnostics.push(...validateScenarioContracts(definitions));
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

    const processPackage: ProcessPackage = {
      root,
      manifest: manifest as ProcessManifest,
      kernelCapabilities: ((manifest as Record<string, unknown>)
        .kernel_capabilities ?? {}) as Record<
        string,
        KernelCapabilityBinding
      >,
      envelopeSchema,
      ...definitions,
    };
    diagnostics.push(...validateKernelCapabilities(processPackage));
    if (diagnostics.length > 0) return { ok: false, diagnostics };

    return {
      ok: true,
      package: processPackage,
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
      kernelCapabilities: Object.entries(processPackage.kernelCapabilities)
        .filter(([, binding]) => binding.type === typeId)
        .map(([reference]) => reference)
        .sort(),
    },
    diagnostics: [],
  };
}
