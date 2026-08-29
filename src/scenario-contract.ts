import { compiledExpressionShape } from "./expression.js";
import {
  effectiveOutgoingLinks,
  effectivePayloadPathSchema,
} from "./payload-inheritance.js";
import type {
  ProcessDiagnostic,
  VersionedDefinition,
} from "./index.js";

interface ScenarioContractCatalogs {
  obligations: Record<string, VersionedDefinition>;
  scenarios: Record<string, VersionedDefinition>;
  phases: Record<string, VersionedDefinition>;
  types: Record<string, VersionedDefinition>;
  templates: Record<string, VersionedDefinition>;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function referencedScenario(
  reference: unknown,
  scenarios: Record<string, VersionedDefinition>,
): VersionedDefinition | undefined {
  if (typeof reference !== "string") return undefined;
  const match = /^(.*)@([1-9][0-9]*)$/.exec(reference);
  const scenario = match?.[1] ? scenarios[match[1]] : undefined;
  return scenario?.version === Number(match?.[2]) ? scenario : undefined;
}

export function validateScenarioContracts(
  catalogs: ScenarioContractCatalogs,
): ProcessDiagnostic[] {
  const diagnostics: ProcessDiagnostic[] = [];
  for (const scenario of Object.values(catalogs.scenarios)) {
    const resolves = Array.isArray(scenario.resolves) ? scenario.resolves : [];
    const explicitlyInitiated = scenario.initiation === "explicit";
    if (explicitlyInitiated && resolves.length > 0) {
      diagnostics.push({
        code: "scenario-authorization-ambiguous",
        path: `scenarios.${scenario.id}.initiation`,
        message: `Scenario '${scenario.id}' cannot combine explicit initiation with Resolver semantics`,
      });
    } else if (!explicitlyInitiated && resolves.length === 0) {
      diagnostics.push({
        code: "scenario-authorization-missing",
        path: `scenarios.${scenario.id}.initiation`,
        message: `Non-Resolver Scenario '${scenario.id}' must declare explicit initiation`,
      });
    }
    const inputs = Array.isArray(scenario.inputs) ? scenario.inputs : [];
    const inputsByName = new Map(
      inputs.flatMap((inputValue) => {
        const input = record(inputValue);
        return typeof input?.name === "string"
          ? [[input.name, input] as const]
          : [];
      }),
    );
    const inputNames = new Set(inputsByName.keys());
    inputs.forEach((inputValue, inputIndex) => {
      const input = record(inputValue);
      const types = Array.isArray(input?.types) ? input.types : [];
      types.forEach((type, typeIndex) => {
        if (typeof type !== "string" || catalogs.types[type]) return;
        diagnostics.push({
          code: "unknown-scenario-input-type",
          path: `scenarios.${scenario.id}.inputs[${inputIndex}].types[${typeIndex}]`,
          message: `Scenario '${scenario.id}' input '${String(input?.name)}' references undeclared lifecycle type '${type}'`,
        });
      });
    });
    const prohibitedInputs = Array.isArray(scenario.prohibited_inputs)
      ? scenario.prohibited_inputs
      : [];
    prohibitedInputs.forEach((prohibitedInput, index) => {
      if (
        typeof prohibitedInput !== "string" ||
        !inputNames.has(prohibitedInput)
      ) {
        return;
      }
      diagnostics.push({
        code: "prohibited-scenario-input",
        path: `scenarios.${scenario.id}.prohibited_inputs[${index}]`,
        message: `Scenario '${scenario.id}' declares input '${prohibitedInput}' as prohibited`,
      });
    });
    const inputSummaries = record(scenario.input_summaries);
    for (const name of Object.keys(inputSummaries ?? {})) {
      if (inputNames.has(name)) continue;
      diagnostics.push({
        code: "unknown-scenario-input-summary",
        path: `scenarios.${scenario.id}.input_summaries.${name}`,
        message: `Scenario '${scenario.id}' summarizes undeclared input '${name}'`,
      });
    }
    const reviewContract = record(scenario.review_contract);
    const requiredEvidence = Array.isArray(reviewContract?.required_evidence)
      ? reviewContract.required_evidence
      : [];
    requiredEvidence.forEach((name, index) => {
      if (typeof name !== "string" || inputNames.has(name)) return;
      diagnostics.push({
        code: "unknown-review-evidence-input",
        path: `scenarios.${scenario.id}.review_contract.required_evidence[${index}]`,
        message: `Scenario '${scenario.id}' requires evidence from undeclared input '${name}'`,
      });
    });

    const outputs = Array.isArray(scenario.outputs) ? scenario.outputs : [];
    const outputsByName = new Map(
      outputs.flatMap((outputValue) => {
        const output = record(outputValue);
        return typeof output?.name === "string"
          ? [[output.name, output] as const]
          : [];
      }),
    );
    const outputNames = new Set(outputsByName.keys());
    const kernelMaterialization = record(scenario.kernel_materialization);
    if (kernelMaterialization?.kind === "exact-baseline@1") {
      const output = kernelMaterialization.output;
      const matchingOutputs = outputs.filter((candidate) =>
        record(candidate)?.name === output
      );
      if (typeof output !== "string" || matchingOutputs.length !== 1) {
        diagnostics.push({
          code: "kernel-materialization-output-invalid",
          path: `scenarios.${scenario.id}.kernel_materialization.output`,
          message: `Scenario '${scenario.id}' exact baseline marker must name exactly one declared output`,
        });
      }
      for (const field of ["subject_input", "support_input"] as const) {
        const input = kernelMaterialization[field];
        if (typeof input !== "string" || !inputsByName.has(input)) {
          diagnostics.push({
            code: "kernel-materialization-input-invalid",
            path: `scenarios.${scenario.id}.kernel_materialization.${field}`,
            message: `Scenario '${scenario.id}' exact baseline marker references undeclared input '${String(input)}'`,
          });
        }
      }
    }
    const outputHandles = outputs.flatMap((outputValue) => {
      const handle = record(outputValue)?.handle;
      return typeof handle === "string" ? [handle] : [];
    });
    if (new Set(outputHandles).size !== outputHandles.length) {
      diagnostics.push({
        code: "duplicate-scenario-output-handle",
        path: `scenarios.${scenario.id}.outputs`,
        message: `Scenario '${scenario.id}' declares duplicate symbolic output handles`,
      });
    }
    outputs.forEach((outputValue, outputIndex) => {
      const output = record(outputValue);
      const outputName = String(output?.name);
      const identityFrom = record(output?.identity_from);
      if (typeof identityFrom?.input === "string") {
        const input = inputsByName.get(identityFrom.input);
        const outputTypes = Array.isArray(output?.types) ? output.types : [];
        const inputTypes = Array.isArray(input?.types) ? input.types : [];
        if (!input) {
          diagnostics.push({
            code: "unknown-output-identity-input",
            path: `scenarios.${scenario.id}.outputs[${outputIndex}].identity_from.input`,
            message: `Scenario '${scenario.id}' output '${outputName}' binds identity from undeclared input '${identityFrom.input}'`,
          });
        } else if (
          input.cardinality !== "one" || output?.cardinality !== "one" ||
          !outputTypes.some((type) => inputTypes.includes(type))
        ) {
          diagnostics.push({
            code: "incompatible-output-identity-input",
            path: `scenarios.${scenario.id}.outputs[${outputIndex}].identity_from`,
            message: `Scenario '${scenario.id}' output '${outputName}' identity binding requires one exact input with a compatible lifecycle type`,
          });
        }
      }
      const requiredLinks = Array.isArray(output?.required_links)
        ? output.required_links
        : [];
      requiredLinks.forEach((linkValue, linkIndex) => {
        const link = record(linkValue);
        const linkId = link?.link;
        const outputTypes = Array.isArray(output?.types) ? output.types : [];
        for (const outputType of outputTypes) {
          if (typeof outputType !== "string") continue;
          const typeDefinition = catalogs.types[outputType];
          if (!typeDefinition || typeof linkId !== "string") continue;
          const available = effectiveOutgoingLinks(
            typeDefinition,
            catalogs.templates,
          ).some(
            (contract) => contract.id === linkId,
          );
          if (available) continue;
          diagnostics.push({
            code: "impossible-required-link",
            path: `scenarios.${scenario.id}.outputs[${outputIndex}].required_links[${linkIndex}].link`,
            message: `Scenario '${scenario.id}' output '${outputName}' requires link '${linkId}', but output type ${outputType} does not declare it`,
          });
        }
        const target = record(link?.target);
        const payloadTarget = record(target?.payload);
        const targetKind = typeof target?.input === "string"
          ? "input"
          : typeof target?.output === "string"
          ? "output"
          : typeof payloadTarget?.output === "string"
          ? "payload"
          : undefined;
        if (!targetKind) return;
        const targetName = targetKind === "payload"
          ? payloadTarget?.output
          : target?.[targetKind];
        const values = targetKind === "input" ? inputsByName : outputsByName;
        const targetValue = typeof targetName === "string"
          ? values.get(targetName)
          : undefined;
        const targetPath =
          `scenarios.${scenario.id}.outputs[${outputIndex}].required_links[${linkIndex}].target.${targetKind}`;
        if (!targetValue) {
          diagnostics.push({
            code: "unknown-required-link-target",
            path: targetPath,
            message: `Scenario '${scenario.id}' output '${outputName}' requires link '${String(link?.link)}' to undeclared ${targetKind} '${String(targetName)}'`,
          });
          return;
        }
        const targetTypes = Array.isArray(targetValue.types)
          ? targetValue.types.filter((type): type is string =>
              typeof type === "string"
            )
          : [];
        if (targetKind === "payload") {
          for (const targetType of targetTypes) {
            const pathSchema = effectivePayloadPathSchema(
              targetType,
              payloadTarget?.path,
              catalogs,
            );
            if (!pathSchema) {
              diagnostics.push({
                code: "unknown-required-link-payload-path",
                path: targetPath,
                message: `Scenario '${scenario.id}' required link payload path '${String(payloadTarget?.path)}' does not exist on output type ${targetType}`,
              });
            } else if (pathSchema.type !== "string") {
              diagnostics.push({
                code: "required-link-payload-path-type",
                path: targetPath,
                message: `Scenario '${scenario.id}' required link payload path '${String(payloadTarget?.path)}' on output type ${targetType} must produce one exact identity string`,
              });
            }
          }
          for (const outputType of outputTypes) {
            if (typeof outputType !== "string" || typeof linkId !== "string") continue;
            const sourceType = catalogs.types[outputType];
            if (!sourceType) continue;
            const contract = effectiveOutgoingLinks(
              sourceType,
              catalogs.templates,
            ).find((candidate) => candidate.id === linkId);
            const contractCardinality = record(contract?.cardinality);
            if (
              (typeof contractCardinality?.minimum === "number" &&
                contractCardinality.minimum > 1) ||
              (typeof contractCardinality?.maximum === "number" &&
                contractCardinality.maximum < 1)
            ) {
              diagnostics.push({
                code: "impossible-required-link-cardinality",
                path: targetPath,
                message: `Scenario '${scenario.id}' payload-supplied link '${linkId}' provides one exact target, which is outside the source contract cardinality`,
              });
            }
            const acceptsExactIdentity = Array.isArray(contract?.targets) &&
              contract.targets.some((value) =>
                record(value)?.kind === "obligation-instance"
              );
            if (!acceptsExactIdentity) {
              diagnostics.push({
                code: "impossible-required-link-target",
                path: targetPath,
                message: `Scenario '${scenario.id}' requires link '${linkId}' from output type ${outputType} to a payload-supplied exact identity unsupported by its source contract`,
              });
            }
          }
          return;
        }
        for (const outputType of outputTypes) {
          if (typeof outputType !== "string" || typeof linkId !== "string") {
            continue;
          }
          const sourceType = catalogs.types[outputType];
          if (!sourceType) continue;
          const contract = effectiveOutgoingLinks(
            sourceType,
            catalogs.templates,
          ).find(
            (candidate) => candidate.id === linkId,
          );
          const contractCardinality = record(contract?.cardinality);
          const targetCardinality = targetValue.cardinality;
          if (
            typeof contractCardinality?.minimum === "number" &&
            contractCardinality.minimum > 0 &&
            (targetCardinality === "zero-or-one" ||
              targetCardinality === "zero-or-more")
          ) {
            diagnostics.push({
              code: "impossible-required-link-cardinality",
              path: targetPath,
              message: `Scenario '${scenario.id}' requires link '${linkId}' with at least one target, but ${targetKind} '${targetName}' may provide zero`,
            });
          }
          if (
            typeof contractCardinality?.maximum === "number" &&
            (targetCardinality === "one-or-more" ||
              targetCardinality === "zero-or-more")
          ) {
            diagnostics.push({
              code: "impossible-required-link-cardinality",
              path: targetPath,
              message: `Scenario '${scenario.id}' requires link '${linkId}' with at most ${contractCardinality.maximum} targets, but ${targetKind} '${targetName}' may provide many`,
            });
          }
          const contractTargets = Array.isArray(contract?.targets)
            ? contract.targets.map(record).filter(
                (candidate): candidate is Record<string, unknown> =>
                  candidate !== undefined,
              )
            : [];
          const unsupported = targetTypes.find((targetType) =>
            !contractTargets.some((candidate) =>
              Array.isArray(candidate.types) &&
              candidate.types.includes(targetType)
            )
          );
          if (contract && unsupported) {
            diagnostics.push({
              code: "impossible-required-link-target",
              path: targetPath,
              message: `Scenario '${scenario.id}' requires link '${linkId}' from output type ${outputType} to ${targetKind} '${targetName}' of unsupported type ${unsupported}`,
            });
          }
          const providedIdentity = targetKind === "input"
            ? targetValue.identity
            : "revision";
          for (const targetType of targetTypes) {
            const matchingTargets = contractTargets.filter((candidate) =>
              Array.isArray(candidate.types) &&
              candidate.types.includes(targetType)
            );
            const acceptsIdentity = matchingTargets.some((candidate) =>
              candidate.identity === "either" ||
              candidate.identity === "stable" ||
              (candidate.identity === "revision" &&
                providedIdentity === "revision")
            );
            if (matchingTargets.length === 0 || acceptsIdentity) continue;
            const requiredIdentity = matchingTargets[0]?.identity;
            diagnostics.push({
              code: "impossible-required-link-identity",
              path: targetPath,
              message: `Scenario '${scenario.id}' requires link '${linkId}' from output type ${outputType} to ${String(requiredIdentity)} identity, but ${targetKind} '${targetName}' provides ${String(providedIdentity)}`,
            });
          }
        }
      });
      const types = Array.isArray(output?.types) ? output.types : [];
      types.forEach((type, typeIndex) => {
        if (typeof type !== "string" || catalogs.types[type]) return;
        diagnostics.push({
          code: "unknown-scenario-output-type",
          path: `scenarios.${scenario.id}.outputs[${outputIndex}].types[${typeIndex}]`,
          message: `Scenario '${scenario.id}' output '${String(output?.name)}' references undeclared lifecycle type '${type}'`,
        });
      });
    });
  }

  for (const obligation of Object.values(catalogs.obligations)) {
    const resolver = record(obligation.resolve_with);
    const scenarioReference = resolver?.scenario;
    const scenario = referencedScenario(scenarioReference, catalogs.scenarios);
    if (!scenario || typeof scenarioReference !== "string") continue;
    const obligationReference = `${obligation.id}@${obligation.version}`;
    for (const [phaseId, phase] of Object.entries(catalogs.phases)) {
      const enabledObligations = Array.isArray(phase.obligations)
        ? phase.obligations
        : [];
      if (!enabledObligations.includes(obligationReference)) continue;
      const enabledScenarios = Array.isArray(phase.scenarios)
        ? phase.scenarios
        : [];
      const scenarioPhases = Array.isArray(scenario.phases)
        ? scenario.phases
        : [];
      if (
        enabledScenarios.includes(scenarioReference) &&
        scenarioPhases.includes(phaseId)
      ) {
        continue;
      }
      diagnostics.push({
        code: "resolver-scenario-disabled",
        path: `phases.${phaseId}.scenarios`,
        message: `Obligation '${obligationReference}' is enabled in Phase '${phaseId}' without Resolver Scenario '${scenarioReference}'`,
      });
    }

    const bindings = record(resolver?.inputs) ?? {};
    const inputs = Array.isArray(scenario.inputs) ? scenario.inputs : [];
    const inputNames = new Set(
      inputs
        .map((value) => record(value)?.name)
        .filter((name): name is string => typeof name === "string"),
    );
    for (const bindingName of Object.keys(bindings)) {
      if (inputNames.has(bindingName)) continue;
      diagnostics.push({
        code: "resolver-input-undeclared",
        path: `obligations.${obligation.id}.resolve_with.inputs.${bindingName}`,
        message: `Obligation '${obligation.id}' binds undeclared input '${bindingName}' for Resolver Scenario '${scenarioReference}'`,
      });
    }
    for (const inputValue of inputs) {
      const input = record(inputValue);
      if (typeof input?.name !== "string") continue;
      const bindingPath =
        `obligations.${obligation.id}.resolve_with.inputs.${input.name}`;
      if (!(input.name in bindings)) {
        diagnostics.push({
          code: "resolver-input-missing",
          path: bindingPath,
          message: `Obligation '${obligation.id}' does not bind required input '${input.name}' for Resolver Scenario '${scenarioReference}'`,
        });
        continue;
      }
      const expectedTypes = Array.isArray(input.types)
        ? input.types.filter((type): type is string => typeof type === "string")
        : [];
      const shape = compiledExpressionShape(bindings[input.name]);
      const expectedIdentity = input.identity;
      const providedIdentity = shape?.domainKind;
      const identityCompatible = expectedIdentity === "either" ||
        (expectedIdentity === "stable" && providedIdentity === "stable-datum") ||
        (expectedIdentity === "revision" &&
          (providedIdentity === "revision" || providedIdentity === "baseline"));
      if (!identityCompatible) {
        diagnostics.push({
          code: "resolver-input-kind",
          path: bindingPath,
          message: `Resolver input '${input.name}' for Scenario '${scenarioReference}' requires ${String(expectedIdentity)} identity, but the binding provides ${providedIdentity ?? shape?.valueType ?? "unknown"}`,
        });
      }
      const expectedMany = input.cardinality === "one-or-more" ||
        input.cardinality === "zero-or-more";
      const providedMany = shape?.valueType === "array";
      if (expectedMany !== providedMany) {
        diagnostics.push({
          code: "resolver-input-cardinality",
          path: bindingPath,
          message: `Resolver input '${input.name}' for Scenario '${scenarioReference}' requires ${String(input.cardinality)} values, but the binding provides ${providedMany ? "many" : "one"}`,
        });
      }
      const providedTypes = shape?.lifecycleTypes ?? [];
      if (
        expectedTypes.length > 0 &&
        providedTypes.length > 0 &&
        providedTypes.some((type) => !expectedTypes.includes(type))
      ) {
        diagnostics.push({
          code: "resolver-input-type",
          path: bindingPath,
          message: `Resolver input '${input.name}' for Scenario '${scenarioReference}' requires ${expectedTypes.length === 1 ? "type" : "one of types"} ${[...expectedTypes].sort().join(", ")}, but the binding can provide ${[...providedTypes].sort().join(", ")}`,
        });
      }
    }
  }
  return diagnostics;
}
