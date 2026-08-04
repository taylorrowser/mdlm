import { expressionLanguageCapabilities } from "./expression.js";
import type { ProcessPackage, VersionedDefinition } from "./index.js";

export interface ProcessCapabilities {
  contextRoots: {
    id: string;
    paths: { path: string; type: string }[];
  }[];
  paths: {
    entity: Record<string, unknown>[];
    context: { root: string; path: string; type: string }[];
  };
  operators: string[];
  hostFunctions: string[];
  collections: { id: string; requires: string | null }[];
  relations: (Record<string, unknown> & {
    id: string;
    requires: string | null;
  })[];
  kernelCapabilities: {
    reference: string;
    binding: { type: string };
    collections: string[];
    relations: string[];
  }[];
  definitionCatalogs: Record<string, string[]>;
}

export interface ProcessInspection {
  status: string;
  description: string;
  kernelContract: {
    id: string;
    version: number;
    primitiveCatalogRef: string;
  };
  compatibility: Record<string, unknown>;
  kernelCapabilities: {
    reference: string;
    binding: { type: string };
  }[];
  definitionCatalogs: Record<string, string[]>;
}

const definitionCatalogGroups = [
  "templates",
  "types",
  "policies",
  "states",
  "selectors",
  "obligations",
  "scenarios",
  "phases",
  "profiles",
  "primitives",
] as const;

function versionedReferences(
  definitions: Record<string, VersionedDefinition>,
): string[] {
  return Object.values(definitions)
    .map((definition) => `${definition.id}@${definition.version}`)
    .sort();
}

function definitionCatalogs(
  processPackage: ProcessPackage,
): Record<string, string[]> {
  return Object.fromEntries(
    definitionCatalogGroups.map((group) => [
      group,
      versionedReferences(processPackage[group]),
    ]),
  );
}

export function processCapabilities(
  processPackage: ProcessPackage,
): ProcessCapabilities {
  const expression = expressionLanguageCapabilities();
  const primitiveCatalogs = Object.values(processPackage.primitives);
  const entityPaths = primitiveCatalogs.flatMap((catalog) =>
    Array.isArray(catalog.entity_paths)
      ? catalog.entity_paths.filter(
          (value): value is Record<string, unknown> =>
            typeof value === "object" && value !== null,
        )
      : []
  );
  const collections = new Map<string, string | null>();
  const relations = new Map<
    string,
    Record<string, unknown> & { id: string; requires: string | null }
  >();
  for (const catalog of primitiveCatalogs) {
    for (
      const collection of Array.isArray(catalog.collections)
        ? catalog.collections
        : []
    ) {
      if (typeof collection === "string") collections.set(collection, null);
    }
    for (
      const relationValue of Array.isArray(catalog.relations)
        ? catalog.relations
        : []
    ) {
      if (typeof relationValue !== "object" || relationValue === null) continue;
      const relation = relationValue as Record<string, unknown>;
      if (typeof relation.id !== "string") continue;
      relations.set(relation.id, {
        ...relation,
        id: relation.id,
        requires: null,
      });
    }
  }

  const kernelCapabilities = Object.entries(processPackage.kernelCapabilities)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([reference, binding]) => {
      const capabilityCollections = new Set<string>();
      const capabilityRelations = new Set<string>();
      for (const catalog of primitiveCatalogs) {
        const surfaces = typeof catalog.capability_surfaces === "object" &&
            catalog.capability_surfaces !== null
          ? catalog.capability_surfaces as Record<string, unknown>
          : {};
        const surface = typeof surfaces[reference] === "object" &&
            surfaces[reference] !== null
          ? surfaces[reference] as Record<string, unknown>
          : {};
        for (
          const collection of Array.isArray(surface.collections)
            ? surface.collections
            : []
        ) {
          if (typeof collection !== "string") continue;
          capabilityCollections.add(collection);
          collections.set(collection, reference);
        }
        for (
          const relationValue of Array.isArray(surface.relations)
            ? surface.relations
            : []
        ) {
          if (typeof relationValue !== "object" || relationValue === null) {
            continue;
          }
          const relation = relationValue as Record<string, unknown>;
          if (typeof relation.id !== "string") continue;
          capabilityRelations.add(relation.id);
          relations.set(relation.id, {
            ...relation,
            id: relation.id,
            requires: reference,
          });
        }
      }
      return {
        reference,
        binding: { type: binding.type },
        collections: [...capabilityCollections].sort(),
        relations: [...capabilityRelations].sort(),
      };
    });

  return {
    contextRoots: expression.contextRoots,
    paths: {
      entity: entityPaths.sort((left, right) =>
        String(left.path).localeCompare(String(right.path))
      ),
      context: expression.contextRoots.flatMap((root) =>
        root.paths.map((item) => ({ root: root.id, ...item }))
      ),
    },
    operators: expression.operators,
    hostFunctions: expression.hostFunctions,
    collections: [...collections]
      .map(([id, requires]) => ({ id, requires }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    relations: [...relations.values()].sort((left, right) =>
      left.id.localeCompare(right.id)
    ),
    kernelCapabilities,
    definitionCatalogs: definitionCatalogs(processPackage),
  };
}

export function processInspection(
  processPackage: ProcessPackage,
): ProcessInspection {
  const kernelContract = typeof processPackage.manifest.kernel_contract ===
        "object" && processPackage.manifest.kernel_contract !== null
    ? processPackage.manifest.kernel_contract as Record<string, unknown>
    : {};
  const compatibility = typeof processPackage.manifest.compatibility ===
        "object" && processPackage.manifest.compatibility !== null
    ? processPackage.manifest.compatibility as Record<string, unknown>
    : {};
  return {
    status: String(processPackage.manifest.status),
    description: String(processPackage.manifest.description),
    kernelContract: {
      id: String(kernelContract.id),
      version: Number(kernelContract.version),
      primitiveCatalogRef: String(kernelContract.primitive_catalog_ref),
    },
    compatibility,
    kernelCapabilities: Object.entries(processPackage.kernelCapabilities)
      .map(([reference, binding]) => ({
        reference,
        binding: { type: binding.type },
      }))
      .sort((left, right) => left.reference.localeCompare(right.reference)),
    definitionCatalogs: definitionCatalogs(processPackage),
  };
}
