import { validateExpressionDependencyCycles } from "./expression.js";
import type {
  ProcessDiagnostic,
  VersionedDefinition,
} from "./index.js";

interface DefinitionCatalogs {
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

type ManifestCatalogGroup =
  | "templates"
  | "types"
  | "policies"
  | "states"
  | "selectors"
  | "obligations"
  | "scenarios"
  | "phases";

const manifestCatalogGroups: ManifestCatalogGroup[] = [
  "templates",
  "types",
  "policies",
  "states",
  "selectors",
  "obligations",
  "scenarios",
  "phases",
];

function referenceId(reference: unknown): string | undefined {
  if (typeof reference !== "string") return undefined;
  return /^(.*)@[1-9][0-9]*$/.exec(reference)?.[1];
}

function validateVersionedReference(
  reference: string,
  definitions: Record<string, VersionedDefinition>,
  path: string,
  definitionKind = "definition",
): ProcessDiagnostic[] {
  const match = /^(.*)@([1-9][0-9]*)$/.exec(reference);
  if (!match) {
    return [{
      code: "invalid-reference",
      path,
      message: `Invalid versioned reference '${reference}'`,
    }];
  }
  const [, id, version] = match;
  const definition = id === undefined ? undefined : definitions[id];
  if (!definition) {
    return [{
      code: "unknown-reference",
      path,
      message: `Unknown ${definitionKind} reference '${reference}'`,
    }];
  }
  if (String(definition.version) !== version) {
    return [{
      code: "version-mismatch",
      path,
      message: `Reference '${reference}' resolves to ${id}@${definition.version}`,
    }];
  }
  return [];
}

function validateUnversionedReferences(
  references: unknown,
  definitions: Record<string, VersionedDefinition>,
  path: string,
  definitionKind: string,
): ProcessDiagnostic[] {
  if (!Array.isArray(references)) return [];
  return references.flatMap((reference, index) => {
    if (typeof reference !== "string" || definitions[reference]) return [];
    return [{
      code: "unknown-reference",
      path: `${path}[${index}]`,
      message: `Unknown ${definitionKind} reference '${reference}'`,
    }];
  });
}

function validateManifestCatalog(
  manifest: unknown,
  definitions: DefinitionCatalogs,
): ProcessDiagnostic[] {
  if (typeof manifest !== "object" || manifest === null) return [];
  const catalogValue = (manifest as Record<string, unknown>).catalog;
  if (typeof catalogValue !== "object" || catalogValue === null) return [];
  const catalog = catalogValue as Record<string, unknown>;
  const diagnostics: ProcessDiagnostic[] = [];
  for (const group of manifestCatalogGroups) {
    const listed = new Set(
      Array.isArray(catalog[group])
        ? catalog[group].filter((id): id is string => typeof id === "string")
        : [],
    );
    const loaded = new Set(Object.keys(definitions[group]));
    const missing = [...loaded].filter((id) => !listed.has(id)).sort();
    const unknown = [...listed].filter((id) => !loaded.has(id)).sort();
    if (missing.length === 0 && unknown.length === 0) continue;
    const details = [
      ...(missing.length > 0
        ? [`missing from manifest: ${missing.join(", ")}`]
        : []),
      ...(unknown.length > 0
        ? [`not found in package: ${unknown.join(", ")}`]
        : []),
    ];
    diagnostics.push({
      code: "manifest-catalog-disagreement",
      path: `manifest.catalog.${group}`,
      message: `Manifest catalog '${group}' does not match loaded definitions; ${details.join("; ")}`,
    });
  }
  return diagnostics;
}

function validateReferences(
  definitions: DefinitionCatalogs,
): ProcessDiagnostic[] {
  const diagnostics: ProcessDiagnostic[] = [];
  for (const [group, byId] of [
    ["templates", definitions.templates],
    ["types", definitions.types],
  ] as const) {
    for (const [id, definition] of Object.entries(byId)) {
      if (typeof definition.extends !== "string") continue;
      diagnostics.push(
        ...validateVersionedReference(
          definition.extends,
          definitions.templates,
          `${group}.${id}.extends`,
          "Payload Template",
        ),
      );
    }
  }

  for (const [id, definition] of Object.entries(definitions.obligations)) {
    diagnostics.push(
      ...validateUnversionedReferences(
        definition.phases,
        definitions.phases,
        `obligations.${id}.phases`,
        "Phase",
      ),
    );
    const resolver = typeof definition.resolve_with === "object" &&
        definition.resolve_with !== null
      ? definition.resolve_with as Record<string, unknown>
      : undefined;
    if (typeof resolver?.scenario === "string") {
      diagnostics.push(
        ...validateVersionedReference(
          resolver.scenario,
          definitions.scenarios,
          `obligations.${id}.resolve_with.scenario`,
          "Scenario",
        ),
      );
    }
    if (typeof definition.waiver_policy_ref === "string") {
      diagnostics.push(
        ...validateVersionedReference(
          definition.waiver_policy_ref,
          definitions.policies,
          `obligations.${id}.waiver_policy_ref`,
          "Policy",
        ),
      );
    }
  }

  for (const [id, definition] of Object.entries(definitions.scenarios)) {
    diagnostics.push(
      ...validateUnversionedReferences(
        definition.phases,
        definitions.phases,
        `scenarios.${id}.phases`,
        "Phase",
      ),
      ...validateUnversionedReferences(
        definition.resolves,
        definitions.obligations,
        `scenarios.${id}.resolves`,
        "Obligation",
      ),
    );
    if (typeof definition.review_policy_ref === "string") {
      diagnostics.push(
        ...validateVersionedReference(
          definition.review_policy_ref,
          definitions.policies,
          `scenarios.${id}.review_policy_ref`,
          "Policy",
        ),
      );
    }
  }

  for (const [id, definition] of Object.entries(definitions.phases)) {
    for (const [field, catalog, kind] of [
      ["scenarios", definitions.scenarios, "Scenario"],
      ["obligations", definitions.obligations, "Obligation"],
    ] as const) {
      const references = Array.isArray(definition[field])
        ? definition[field]
        : [];
      references.forEach((reference, index) => {
        if (typeof reference !== "string") return;
        diagnostics.push(
          ...validateVersionedReference(
            reference,
            catalog,
            `phases.${id}.${field}[${index}]`,
            kind,
          ),
        );
      });
    }
  }

  const visitSelectorReferences = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) =>
        visitSelectorReferences(item, `${path}[${index}]`)
      );
      return;
    }
    if (typeof value !== "object" || value === null) return;
    for (const [key, child] of Object.entries(value)) {
      const childPath = `${path}.${key}`;
      if (key === "selector" && typeof child === "string") {
        diagnostics.push(
          ...validateVersionedReference(
            child,
            definitions.selectors,
            childPath,
            "Selector",
          ),
        );
      }
      visitSelectorReferences(child, childPath);
    }
  };
  for (const [group, byId] of Object.entries(definitions)) {
    for (const [id, definition] of Object.entries(byId)) {
      visitSelectorReferences(definition, `${group}.${id}`);
    }
  }
  return diagnostics;
}

function validateTemplateCycles(
  definitions: DefinitionCatalogs,
): ProcessDiagnostic[] {
  const diagnostics: ProcessDiagnostic[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string, chain: string[]): void => {
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
    const parent = referenceId(definitions.templates[id]?.extends);
    if (parent && definitions.templates[parent]) {
      visit(parent, [...chain, id]);
    }
    visiting.delete(id);
    visited.add(id);
  };
  Object.keys(definitions.templates).forEach((id) => visit(id, []));
  return diagnostics;
}

export function validateDefinitionGraph(
  manifest: unknown,
  definitions: DefinitionCatalogs,
): ProcessDiagnostic[] {
  return [
    ...validateManifestCatalog(manifest, definitions),
    ...validateReferences(definitions),
    ...validateTemplateCycles(definitions),
    ...validateExpressionDependencyCycles({
      selectors: definitions.selectors,
      states: definitions.states,
      policies: definitions.policies,
    }),
  ];
}
