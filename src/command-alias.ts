import {
  evaluateCompiledTextValue,
  isCompiledTextExpression,
  type ExpressionHost,
} from "./expression.js";
import type {
  ProcessDiagnostic,
  ProcessPackage,
  VersionedDefinition,
} from "./index.js";

export interface BoundCommandAlias {
  scenario: string;
  inputs: { name: string; value: string }[];
}

export type CommandAliasBindingResult =
  | { ok: true; value: BoundCommandAlias; diagnostics: [] }
  | { ok: false; diagnostics: ProcessDiagnostic[] };

const runtimeOptions = new Set([
  "--adapter",
  "--authorize",
  "--delegation",
  "--initiate",
  "--obligation",
]);
const inertHost: ExpressionHost = {
  policy() {
    throw new Error("Package Command Alias expressions cannot evaluate Policies");
  },
  select() {
    throw new Error("Package Command Alias expressions cannot evaluate Selectors");
  },
  state() {
    throw new Error("Package Command Alias expressions cannot evaluate Computed States");
  },
};

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function cardinality(value: unknown): string {
  return String(object(value).cardinality ?? "");
}

function optionName(argumentName: string): string {
  return `--${argumentName.replaceAll("_", "-")}`;
}

export function matchingCommandAlias(
  processPackage: ProcessPackage,
  commandArguments: string[],
): VersionedDefinition | undefined {
  return Object.values(processPackage.aliases)
    .sort((left, right) => {
      const depth = right.id.split(".").length - left.id.split(".").length;
      return depth || left.id.localeCompare(right.id);
    })
    .find((alias) => {
      const words = alias.id.split(".");
      return words.every((word, index) => commandArguments[index] === word);
    });
}

export function bindCommandAlias(
  definition: VersionedDefinition,
  commandArguments: string[],
): CommandAliasBindingResult {
  const argumentsContract = object(definition.arguments);
  const commandDepth = definition.id.split(".").length;
  const values = new Map<string, string[]>();
  const optionToArgument = new Map(
    Object.keys(argumentsContract).map((name) => [optionName(name), name]),
  );

  for (let index = commandDepth; index < commandArguments.length; index += 1) {
    const token = commandArguments[index]!;
    if (token === "--json") continue;
    if (runtimeOptions.has(token)) {
      index += 1;
      continue;
    }
    const argumentName = optionToArgument.get(token);
    if (!argumentName) {
      return {
        ok: false,
        diagnostics: [{
          code: "alias-unknown-argument",
          path: definition.id,
          message: `Package Command Alias '${definition.id}' does not declare CLI argument '${token}'`,
        }],
      };
    }
    const value = commandArguments[index + 1];
    if (value === undefined || value.startsWith("--")) {
      return {
        ok: false,
        diagnostics: [{
          code: "alias-argument-value-required",
          path: `${definition.id}.arguments.${argumentName}`,
          message: `Package Command Alias argument '${optionName(argumentName)}' requires a value`,
        }],
      };
    }
    values.set(argumentName, [...(values.get(argumentName) ?? []), value]);
    index += 1;
  }

  const diagnostics: ProcessDiagnostic[] = [];
  const args: Record<string, unknown> = {};
  for (const [name, contract] of Object.entries(argumentsContract)) {
    const supplied = values.get(name) ?? [];
    const declaredCardinality = cardinality(contract);
    const minimum = ["one", "one-or-more"].includes(declaredCardinality) ? 1 : 0;
    const maximum = ["one", "zero-or-one"].includes(declaredCardinality)
      ? 1
      : Number.POSITIVE_INFINITY;
    if (supplied.length < minimum || supplied.length > maximum) {
      diagnostics.push({
        code: "alias-argument-cardinality-invalid",
        path: `${definition.id}.arguments.${name}`,
        message: `Package Command Alias argument '${optionName(name)}' requires ${declaredCardinality}, received ${supplied.length}`,
      });
      continue;
    }
    args[name] = maximum === 1 ? supplied[0] : supplied;
  }
  if (diagnostics.length > 0) return { ok: false, diagnostics };

  const boundInputs: { name: string; value: string }[] = [];
  for (const [name, expression] of Object.entries(object(definition.inputs))) {
    if (!isCompiledTextExpression(expression)) {
      return {
        ok: false,
        diagnostics: [{
          code: "alias-expression-uncompiled",
          path: `${definition.id}.inputs.${name}`,
          message: `Package Command Alias input '${name}' is not a compiled expression`,
        }],
      };
    }
    let result: unknown;
    try {
      result = evaluateCompiledTextValue(expression, { args }, inertHost);
    } catch (error) {
      return {
        ok: false,
        diagnostics: [{
          code: "alias-expression-failed",
          path: `${definition.id}.inputs.${name}`,
          message: error instanceof Error ? error.message : String(error),
        }],
      };
    }
    if (result === undefined) continue;
    const resultValues = Array.isArray(result) ? result : [result];
    if (!resultValues.every((value): value is string => typeof value === "string")) {
      return {
        ok: false,
        diagnostics: [{
          code: "alias-input-value-invalid",
          path: `${definition.id}.inputs.${name}`,
          message: `Package Command Alias input '${name}' must evaluate to an identity string or array of identity strings`,
        }],
      };
    }
    boundInputs.push(...resultValues.map((value) => ({ name, value })));
  }
  return {
    ok: true,
    value: {
      scenario: String(definition.scenario),
      inputs: boundInputs,
    },
    diagnostics: [],
  };
}
