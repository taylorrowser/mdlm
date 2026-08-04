import type {
  ProcessDiagnostic,
  VersionedDefinition,
} from "./index.js";

interface PayloadDefinitions {
  templates: Record<string, VersionedDefinition>;
  types: Record<string, VersionedDefinition>;
}

interface ComparisonContext {
  diagnostics: ProcessDiagnostic[];
  owner: VersionedDefinition;
  propertyPath: string;
  diagnosticPath: string;
}

const lowerBounds = [
  "minimum",
  "exclusiveMinimum",
  "minLength",
  "minItems",
  "minProperties",
] as const;
const upperBounds = [
  "maximum",
  "exclusiveMaximum",
  "maxLength",
  "maxItems",
  "maxProperties",
] as const;
const supportedConstraintKeywords = new Set<string>([
  "type",
  "enum",
  "const",
  "pattern",
  "format",
  "uniqueItems",
  ...lowerBounds,
  ...upperBounds,
  "items",
  "additionalProperties",
  "required",
  "properties",
]);
const annotationKeywords = new Set([
  "$schema",
  "$id",
  "title",
  "description",
  "default",
  "examples",
]);

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function parentId(definition: VersionedDefinition): string | undefined {
  if (typeof definition.extends !== "string") return undefined;
  return /^(.*)@[1-9][0-9]*$/.exec(definition.extends)?.[1];
}

function payloadProperties(
  definition: VersionedDefinition,
): Record<string, unknown> {
  return object(object(definition.payload_schema)?.properties) ?? {};
}

function declaredLinks(
  definition: VersionedDefinition,
): Record<string, unknown>[] {
  return Array.isArray(definition.outgoing_links)
    ? definition.outgoing_links
        .map(object)
        .filter((link): link is Record<string, unknown> => link !== undefined)
    : [];
}

function effectiveTemplateProperties(
  template: VersionedDefinition,
  definitions: PayloadDefinitions,
  visiting = new Set<string>(),
): Record<string, unknown> {
  if (visiting.has(template.id)) return {};
  const nextVisiting = new Set(visiting).add(template.id);
  const parent = definitions.templates[parentId(template) ?? ""];
  return {
    ...(parent
      ? effectiveTemplateProperties(parent, definitions, nextVisiting)
      : {}),
    ...payloadProperties(template),
  };
}

export function effectiveOutgoingLinks(
  definition: VersionedDefinition,
  templates: Record<string, VersionedDefinition>,
  visiting = new Set<string>(),
): Record<string, unknown>[] {
  if (visiting.has(definition.id)) return [];
  const nextVisiting = new Set(visiting).add(definition.id);
  const parent = templates[parentId(definition) ?? ""];
  return [
    ...(parent
      ? effectiveOutgoingLinks(parent, templates, nextVisiting)
      : []),
    ...declaredLinks(definition),
  ];
}

function ownerLabel(owner: VersionedDefinition): string {
  return owner.kind === "type-template-definition"
    ? "Payload Template"
    : "Lifecycle type";
}

function widening(
  context: ComparisonContext,
  constraint: string,
  detail: string,
): void {
  context.diagnostics.push({
    code: "unsafe-schema-widening",
    path: `${context.diagnosticPath}.${constraint}`,
    message: `${ownerLabel(context.owner)} '${context.owner.id}' ${detail}`,
  });
}

function compareInheritedSchema(
  parentValue: unknown,
  childValue: unknown,
  context: ComparisonContext,
): void {
  if (typeof parentValue === "boolean") {
    if (parentValue === false && childValue !== false) {
      widening(
        context,
        "schema",
        `widens inherited Boolean schema '${context.propertyPath}'`,
      );
    }
    return;
  }
  const parent = object(parentValue);
  const child = object(childValue);
  if (!parent) return;
  if (!child) {
    widening(
      context,
      "schema",
      `removes inherited property schema '${context.propertyPath}'`,
    );
    return;
  }

  if (
    parent.type !== undefined &&
    JSON.stringify(parent.type) !== JSON.stringify(child.type)
  ) {
    context.diagnostics.push({
      code: "incompatible-inherited-property",
      path: `${context.diagnosticPath}.type`,
      message: `${ownerLabel(context.owner)} '${context.owner.id}' changes inherited property '${context.propertyPath}' from type ${String(parent.type)} to ${String(child.type)}`,
    });
    return;
  }

  for (const [keyword, inherited] of Object.entries(parent)) {
    if (
      supportedConstraintKeywords.has(keyword) ||
      annotationKeywords.has(keyword)
    ) {
      continue;
    }
    if (JSON.stringify(inherited) !== JSON.stringify(child[keyword])) {
      widening(
        context,
        keyword,
        `cannot prove a safe narrowing for inherited constraint '${context.propertyPath}.${keyword}'`,
      );
    }
  }

  if (Array.isArray(parent.enum)) {
    const childValues = Array.isArray(child.enum) ? child.enum : undefined;
    const parentValues = new Set(
      parent.enum.map((value) => JSON.stringify(value)),
    );
    if (
      !childValues ||
      childValues.some((value) => !parentValues.has(JSON.stringify(value)))
    ) {
      widening(
        context,
        "enum",
        `widens inherited constraint '${context.propertyPath}.enum'`,
      );
    }
  }
  if (
    parent.const !== undefined &&
    JSON.stringify(parent.const) !== JSON.stringify(child.const)
  ) {
    widening(
      context,
      "const",
      `widens inherited constraint '${context.propertyPath}.const'`,
    );
  }
  for (const constraint of ["pattern", "format"] as const) {
    if (
      parent[constraint] !== undefined &&
      parent[constraint] !== child[constraint]
    ) {
      widening(
        context,
        constraint,
        `cannot prove a safe narrowing for inherited constraint '${context.propertyPath}.${constraint}'`,
      );
    }
  }
  if (parent.uniqueItems === true && child.uniqueItems !== true) {
    widening(
      context,
      "uniqueItems",
      `widens inherited constraint '${context.propertyPath}.uniqueItems'`,
    );
  }

  for (const constraint of lowerBounds) {
    const inherited = parent[constraint];
    if (typeof inherited !== "number") continue;
    const declared = child[constraint];
    if (typeof declared !== "number" || declared < inherited) {
      widening(
        context,
        constraint,
        `widens inherited constraint '${context.propertyPath}.${constraint}' from ${inherited} to ${String(declared)}`,
      );
    }
  }
  for (const constraint of upperBounds) {
    const inherited = parent[constraint];
    if (typeof inherited !== "number") continue;
    const declared = child[constraint];
    if (typeof declared !== "number" || declared > inherited) {
      widening(
        context,
        constraint,
        `widens inherited constraint '${context.propertyPath}.${constraint}' from ${inherited} to ${String(declared)}`,
      );
    }
  }

  if (parent.type === "array" && parent.items !== undefined) {
    if (child.items === undefined) {
      widening(
        context,
        "items",
        `removes inherited constraint '${context.propertyPath}.items'`,
      );
    } else {
      compareInheritedSchema(parent.items, child.items, {
        ...context,
        propertyPath: `${context.propertyPath}.items`,
        diagnosticPath: `${context.diagnosticPath}.items`,
      });
    }
  }
  if (parent.type !== "object" || child.type !== "object") return;

  if (parent.additionalProperties === false) {
    if (child.additionalProperties !== false) {
      widening(
        context,
        "additionalProperties",
        `widens inherited constraint '${context.propertyPath}.additionalProperties'`,
      );
    }
  } else if (object(parent.additionalProperties)) {
    compareInheritedSchema(
      parent.additionalProperties,
      child.additionalProperties,
      {
        ...context,
        propertyPath: `${context.propertyPath}.additionalProperties`,
        diagnosticPath: `${context.diagnosticPath}.additionalProperties`,
      },
    );
  }
  const inheritedRequired = Array.isArray(parent.required)
    ? parent.required.filter((field): field is string => typeof field === "string")
    : [];
  const declaredRequired = new Set(
    Array.isArray(child.required)
      ? child.required.filter((field): field is string => typeof field === "string")
      : [],
  );
  const removed = inheritedRequired.filter(
    (field) => !declaredRequired.has(field),
  );
  if (removed.length > 0) {
    context.diagnostics.push({
      code: "inherited-required-field-removed",
      path: `${context.diagnosticPath}.required`,
      message: `${ownerLabel(context.owner)} '${context.owner.id}' removes inherited required fields from '${context.propertyPath}': ${removed.join(", ")}`,
    });
  }

  const parentProperties = object(parent.properties) ?? {};
  const childProperties = object(child.properties) ?? {};
  for (const [field, inheritedSchema] of Object.entries(parentProperties)) {
    if (childProperties[field] === undefined) {
      context.diagnostics.push({
        code: "unsafe-schema-widening",
        path: `${context.diagnosticPath}.properties.${field}`,
        message: `${ownerLabel(context.owner)} '${context.owner.id}' removes inherited property constraint '${context.propertyPath}.${field}'`,
      });
      continue;
    }
    compareInheritedSchema(inheritedSchema, childProperties[field], {
      ...context,
      propertyPath: `${context.propertyPath}.${field}`,
      diagnosticPath: `${context.diagnosticPath}.properties.${field}`,
    });
  }
}

export function validatePayloadInheritance(
  definitions: PayloadDefinitions,
): ProcessDiagnostic[] {
  const diagnostics: ProcessDiagnostic[] = [];
  for (const [group, definitionsById] of [
    ["templates", definitions.templates],
    ["types", definitions.types],
  ] as const) {
    for (const definition of Object.values(definitionsById)) {
      const parent = definitions.templates[parentId(definition) ?? ""];
      if (!parent) continue;

      const inheritedProperties = effectiveTemplateProperties(
        parent,
        definitions,
      );
      for (const [property, childSchema] of Object.entries(
        payloadProperties(definition),
      )) {
        if (inheritedProperties[property] === undefined) continue;
        compareInheritedSchema(inheritedProperties[property], childSchema, {
          diagnostics,
          owner: definition,
          propertyPath: property,
          diagnosticPath:
            `${group}.${definition.id}.payload_schema.properties.${property}`,
        });
      }

      const inheritedLinkIds = new Set(
        effectiveOutgoingLinks(parent, definitions.templates)
          .map((link) => link.id)
          .filter((id): id is string => typeof id === "string"),
      );
      for (const link of declaredLinks(definition)) {
        if (
          typeof link.id !== "string" ||
          !inheritedLinkIds.has(link.id)
        ) {
          continue;
        }
        diagnostics.push({
          code: "duplicate-inherited-link",
          path: `${group}.${definition.id}.outgoing_links`,
          message: `${ownerLabel(definition)} '${definition.id}' redeclares inherited outgoing link '${link.id}'`,
        });
      }
    }
  }
  return diagnostics;
}
