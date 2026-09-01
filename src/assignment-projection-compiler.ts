import type { ProcessDiagnostic, VersionedDefinition } from "./index.js";

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as RecordValue
    : undefined;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export interface AssignmentRendererContract {
  linkInputScope: "per-invocation" | "first-invocation-only";
}

export const publicAssignmentRenderer: AssignmentRendererContract =
  Object.freeze({ linkInputScope: "per-invocation" });

export type AssignmentOutputTypeRoute =
  | { kind: "declared"; type: string }
  | { kind: "invocation-input"; input: string; types: string[] };

export type AssignmentLinkRoute = {
  link: string;
  target:
    | { kind: "input"; input: string }
    | { kind: "output"; output: string }
    | { kind: "payload"; output: string; path: string };
};

export interface AssignmentOutputRoute {
  output: string;
  handle: string;
  type: AssignmentOutputTypeRoute;
  links: AssignmentLinkRoute[];
}

export interface AssignmentProjectionPlan {
  scenario: string;
  witnessInvocations: 1 | 2;
  outputs: AssignmentOutputRoute[];
}

export type CompileAssignmentProjectionResult =
  | {
      ok: true;
      plan: AssignmentProjectionPlan;
      diagnostics: [];
    }
  | {
      ok: false;
      diagnostics: ProcessDiagnostic[];
    };

/**
 * Compile one Scenario into the routes needed to render its public Assignment.
 * The two-invocation witness makes batch link scoping fail during package load,
 * before a repository must reach the Scenario.
 */
export function compileAssignmentProjection(input: {
  scenario: VersionedDefinition;
  renderer: AssignmentRendererContract;
  source: string;
}): CompileAssignmentProjectionResult {
  const { scenario, renderer, source } = input;
  const diagnostics: ProcessDiagnostic[] = [];
  const inputs = Array.isArray(scenario.inputs)
    ? scenario.inputs.map(record).filter(
      (value): value is RecordValue => value !== undefined,
    )
    : [];
  const inputsByName = new Map(inputs.flatMap((value) =>
    typeof value.name === "string" ? [[value.name, value] as const] : []
  ));
  const outputs = Array.isArray(scenario.outputs)
    ? scenario.outputs.map(record).filter(
      (value): value is RecordValue => value !== undefined,
    )
    : [];
  const outputNames = new Set(outputs.flatMap((value) =>
    typeof value.name === "string" ? [value.name] : []
  ));
  const witnessInvocations = scenario.batching === "single" ? 1 : 2;
  const routes: AssignmentOutputRoute[] = [];

  outputs.forEach((output, outputIndex) => {
    const outputName = String(output.name);
    const outputTypes = strings(output.types);
    const identityInputName = record(output.identity_from)?.input;
    let type: AssignmentOutputTypeRoute | undefined;
    if (outputTypes.length === 1) {
      type = { kind: "declared", type: outputTypes[0]! };
    } else if (typeof identityInputName === "string") {
      const identityInput = inputsByName.get(identityInputName);
      const inputTypes = strings(identityInput?.types);
      if (
        identityInput?.cardinality === "one" &&
        inputTypes.length > 0 &&
        inputTypes.every((candidate) => outputTypes.includes(candidate))
      ) {
        type = {
          kind: "invocation-input",
          input: identityInputName,
          types: outputTypes,
        };
      }
    }
    if (!type) {
      diagnostics.push({
        code: "missing-type-route",
        path: `${source}#outputs[${outputIndex}].types`,
        message: `Scenario '${scenario.id}' output '${outputName}' has no total public Assignment type route`,
      });
      return;
    }

    const links = [
      ...(Array.isArray(output.required_links) ? output.required_links : []),
      ...(Array.isArray(output.permitted_links) ? output.permitted_links : []),
    ].flatMap<AssignmentLinkRoute>((value, linkIndex) => {
        const required = record(value);
        const link = typeof required?.link === "string" ? required.link : undefined;
        const target = record(required?.target);
        if (!link || !target) return [];
        if (typeof target.input === "string") {
          const missingInvocation = renderer.linkInputScope ===
              "first-invocation-only" && witnessInvocations === 2
            ? 2
            : !inputsByName.has(target.input)
            ? 1
            : undefined;
          if (missingInvocation !== undefined) {
            diagnostics.push({
              code: "missing-link-input",
              path:
                `${source}#outputs[${outputIndex}].required_links[${linkIndex}].target.input`,
              message: `Scenario '${scenario.id}' output '${outputName}' cannot address input '${target.input}' in symbolic invocation ${missingInvocation}`,
            });
          }
          return [{ link, target: { kind: "input", input: target.input } }];
        }
        if (typeof target.output === "string" && outputNames.has(target.output)) {
          return [{ link, target: { kind: "output", output: target.output } }];
        }
        const payload = record(target.payload);
        if (
          typeof payload?.output === "string" &&
          outputNames.has(payload.output) &&
          typeof payload.path === "string"
        ) {
          return [{
            link,
            target: {
              kind: "payload",
              output: payload.output,
              path: payload.path,
            },
          }];
        }
        return [];
      });
    routes.push({
      output: outputName,
      handle: typeof output.handle === "string" ? output.handle : outputName,
      type,
      links,
    });
  });

  if (diagnostics.length > 0) return { ok: false, diagnostics };
  return {
    ok: true,
    plan: {
      scenario: `${scenario.id}@${scenario.version}`,
      witnessInvocations: witnessInvocations as 1 | 2,
      outputs: routes,
    },
    diagnostics: [],
  };
}
