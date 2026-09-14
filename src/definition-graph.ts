import {
  validateExpressionDependencyCycles,
} from "./expression.js";
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
  primitives: Record<string, VersionedDefinition>;
  actions: Record<string, VersionedDefinition>;
}

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

function validateReferences(
  definitions: DefinitionCatalogs,
  manifest?: unknown,
): ProcessDiagnostic[] {
  const diagnostics: ProcessDiagnostic[] = [];
  for (const [id, policy] of Object.entries(definitions.policies)) {
    const parameterNames = (Array.isArray(policy.parameters)
      ? policy.parameters
      : []).flatMap((value) => {
        if (typeof value !== "object" || value === null) return [];
        const name = (value as Record<string, unknown>).name;
        return typeof name === "string" ? [name] : [];
      });
    if (new Set(parameterNames).size !== parameterNames.length) {
      diagnostics.push({
        code: "policy-parameters",
        path: `policies.${id}.parameters`,
        message: `Policy '${id}@${policy.version}' has duplicate parameter names`,
      });
    }
  }
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

  for (const [id, action] of Object.entries(definitions.actions)) {
    diagnostics.push(...validateUnversionedReferences(action.types, definitions.types, `actions.${id}.types`, "Lifecycle Data type"));

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

/**
 * Report Selectors that no other declaration references.
 *
 * A Selector exists because a declaration outside `selectors/` needs it or
 * because two Selectors share it. References are versioned `id@n` strings in
 * any definition field, including compiled expression source text, so plain
 * reference fields and expressions count alike. A Selector that references
 * only itself is a cycle and is reported elsewhere.
 */
export function validateUnreferencedSelectors(
  manifest: unknown,
  definitions: DefinitionCatalogs,
): ProcessDiagnostic[] {
  const selectorIds = new Set(Object.keys(definitions.selectors));
  const referenced = new Set<string>();
  const pattern = /([a-z0-9][a-z0-9-]*)@[1-9][0-9]*/g;
  const collect = (value: unknown, owner?: string): void => {
    if (typeof value === "string") {
      for (const match of value.matchAll(pattern)) {
        const id = match[1]!;
        if (id !== owner && selectorIds.has(id)) referenced.add(id);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => collect(item, owner));
      return;
    }
    if (typeof value === "object" && value !== null) {
      Object.values(value).forEach((item) => collect(item, owner));
    }
  };
  collect(manifest);
  for (const [catalog, entries] of Object.entries(definitions)) {
    for (const [id, definition] of Object.entries(entries)) {
      collect(definition, catalog === "selectors" ? id : undefined);
    }
  }
  return [...selectorIds]
    .filter((id) => !referenced.has(id))
    .sort()
    .map((id) => ({
      code: "unreferenced-selector",
      path: `selectors/${id}`,
      message: `Selector '${id}' is not referenced by any other declaration`,
    }));
}

export function validateDefinitionGraph(
  manifest: unknown,
  definitions: DefinitionCatalogs,
): ProcessDiagnostic[] {
  return [
    ...validateReferences(definitions, manifest),
    ...validateTemplateCycles(definitions),
    ...validateExpressionDependencyCycles({
      templates: definitions.templates,
      types: definitions.types,
      selectors: definitions.selectors,
      states: definitions.states,
      policies: definitions.policies,
    }),
  ];
}
