import {
  findDefinitionExpressionBindingReference,
  validateExpressionDependencyCycles,
} from "./expression.js";
import {
  authorityEvidenceContract,
  participationPolicyRequiresAuthorityEvidence,
  validateParticipationPolicy,
} from "./participation.js";
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
  aliases: Record<string, VersionedDefinition>;
  primitives: Record<string, VersionedDefinition>;
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
  const manifestRecord = typeof manifest === "object" && manifest !== null
    ? manifest as Record<string, unknown>
    : {};
  const profiles = typeof manifestRecord.profiles === "object" &&
      manifestRecord.profiles !== null
    ? manifestRecord.profiles as Record<string, unknown>
    : {};
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
  if (typeof profiles.default === "string") {
    diagnostics.push(...validateVersionedReference(
      profiles.default,
      definitions.profiles,
      "manifest.profiles.default",
      "implementation profile",
    ));
  }
  for (const [id, profile] of Object.entries(definitions.profiles)) {
    const outcomes = typeof profile.terminal_outcomes === "object" &&
        profile.terminal_outcomes !== null
      ? profile.terminal_outcomes as Record<string, Record<string, unknown>>
      : {};
    const boundary = outcomes.profile_boundary?.condition as
      | { source?: unknown }
      | undefined;
    const complete = outcomes.lifecycle_complete?.condition as
      | { source?: unknown }
      | undefined;
    if (typeof boundary?.source === "string" && boundary.source === complete?.source) {
      diagnostics.push({
        code: "ambiguous-terminal-outcomes",
        path: `profiles.${id}.terminal_outcomes`,
        message: `Implementation Profile '${id}@${profile.version}' gives Profile Boundary and Lifecycle Complete the same condition`,
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
    const statusRules = Array.isArray(definition.status_rules)
      ? definition.status_rules
      : [];
    statusRules.forEach((ruleValue, ruleIndex) => {
      if (typeof ruleValue !== "object" || ruleValue === null) return;
      const blockers = Array.isArray(
        (ruleValue as Record<string, unknown>).blocked_by,
      )
        ? (ruleValue as Record<string, unknown>).blocked_by as unknown[]
        : [];
      blockers.forEach((blockerValue, blockerIndex) => {
        if (typeof blockerValue !== "object" || blockerValue === null) return;
        const blocker = blockerValue as Record<string, unknown>;
        if (typeof blocker.obligation !== "string") return;
        diagnostics.push(
          ...validateVersionedReference(
            blocker.obligation,
            definitions.obligations,
            `obligations.${id}.status_rules[${ruleIndex}].blocked_by[${blockerIndex}].obligation`,
            "Obligation",
          ),
        );
      });
    });
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
    const reviewPolicyArguments =
      typeof definition.review_policy_arguments === "object" &&
        definition.review_policy_arguments !== null &&
        !Array.isArray(definition.review_policy_arguments)
        ? definition.review_policy_arguments as Record<string, unknown>
        : undefined;
    if (typeof definition.review_policy_ref === "string") {
      const policyId = referenceId(definition.review_policy_ref);
      const policy = policyId ? definitions.policies[policyId] : undefined;
      if (policy && reviewPolicyArguments) {
        const parameterNames = (Array.isArray(policy.parameters)
          ? policy.parameters
          : []).flatMap((value) => {
            if (typeof value !== "object" || value === null) return [];
            const name = (value as Record<string, unknown>).name;
            return typeof name === "string" ? [name] : [];
          });
        const supplied = Object.keys(reviewPolicyArguments);
        const missing = parameterNames.filter((name) => !supplied.includes(name));
        const unknown = supplied.filter((name) => !parameterNames.includes(name));
        if (missing.length > 0 || unknown.length > 0) {
          diagnostics.push({
            code: "review-policy-arguments",
            path: `scenarios.${id}.review_policy_arguments`,
            message: `Scenario '${id}' review Policy arguments must exactly match Policy '${definition.review_policy_ref}'; missing: ${missing.join(", ") || "none"}; unknown: ${unknown.join(", ") || "none"}`,
          });
        }
      }
    }
    const participation = typeof definition.participation === "object" &&
        definition.participation !== null
      ? definition.participation as Record<string, unknown>
      : undefined;
    const authorityEvidence = authorityEvidenceContract(
      definition.authority_evidence,
    );
    const standingDelegation = typeof definition.standing_delegation === "object" &&
        definition.standing_delegation !== null
      ? definition.standing_delegation as Record<string, unknown>
      : undefined;
    if (standingDelegation) {
      if (typeof standingDelegation.selector_ref === "string") {
        diagnostics.push(...validateVersionedReference(
          standingDelegation.selector_ref,
          definitions.selectors,
          `scenarios.${id}.standing_delegation.selector_ref`,
          "Standing Delegation Selector",
        ));
      }
      const scenarioInputs = Array.isArray(definition.inputs)
        ? definition.inputs
        : [];
      const inputNames = new Set(scenarioInputs.flatMap((value) =>
          typeof value === "object" && value !== null &&
              typeof (value as Record<string, unknown>).name === "string"
            ? [(value as Record<string, unknown>).name as string]
            : []
        ));
      const targetInputName = String(standingDelegation.target_input);
      const targetInput = scenarioInputs.find((value) =>
        typeof value === "object" && value !== null &&
        (value as Record<string, unknown>).name === targetInputName
      ) as Record<string, unknown> | undefined;
      if (!inputNames.has(targetInputName)) {
        diagnostics.push({
          code: "standing-delegation-target-input",
          path: `scenarios.${id}.standing_delegation.target_input`,
          message: `Scenario '${id}@${definition.version}' standing delegation must name a declared exact target input`,
        });
      } else if (
        targetInput?.cardinality !== "one" ||
        targetInput.identity !== "revision"
      ) {
        diagnostics.push({
          code: "standing-delegation-target-input",
          path: `scenarios.${id}.standing_delegation.target_input`,
          message: `Scenario '${id}@${definition.version}' standing delegation target '${targetInputName}' must be one exact Revision`,
        });
      }
    }
    if (authorityEvidence) {
      const outputs = Array.isArray(definition.outputs) ? definition.outputs : [];
      const output = outputs.find((value) =>
        typeof value === "object" && value !== null &&
        (value as Record<string, unknown>).name === authorityEvidence.output
      ) as Record<string, unknown> | undefined;
      if (!output || !Array.isArray(output.types) ||
          !output.types.includes(authorityEvidence.type)) {
        diagnostics.push({
          code: "scenario-authority-evidence-output",
          path: `scenarios.${id}.authority_evidence`,
          message: `Scenario '${id}@${definition.version}' authority evidence must name a declared output and one of its Lifecycle Data types`,
        });
      }
    }
    if (typeof participation?.policy_ref === "string") {
      const scenarioInputNames = (Array.isArray(definition.inputs)
        ? definition.inputs
        : []).flatMap((value) => {
          if (typeof value !== "object" || value === null) return [];
          const name = (value as Record<string, unknown>).name;
          return typeof name === "string" ? [name] : [];
        });
      if (scenarioInputNames.includes("execution")) {
        diagnostics.push({
          code: "participation-execution-binding-reserved",
          path: `scenarios.${id}.inputs`,
          message: `Scenario '${id}' cannot use reserved participation input name 'execution'`,
        });
      }
      const policyPath = `scenarios.${id}.participation.policy_ref`;
      const referenceDiagnostics = validateVersionedReference(
        participation.policy_ref,
        definitions.policies,
        policyPath,
        "Participation Policy",
      );
      diagnostics.push(...referenceDiagnostics);
      if (referenceDiagnostics.length === 0) {
        const policyId = referenceId(participation.policy_ref);
        const policy = policyId ? definitions.policies[policyId] : undefined;
        if (policy) {
          const requiresAuthorityEvidence =
            participationPolicyRequiresAuthorityEvidence(policy);
          if (requiresAuthorityEvidence && !authorityEvidence) {
            diagnostics.push({
              code: "scenario-authority-evidence-required",
              path: `scenarios.${id}.authority_evidence`,
              message: `Scenario '${id}@${definition.version}' must name the Lifecycle Data output that records non-autonomous authority`,
            });
          }
          diagnostics.push(
            ...validateParticipationPolicy(policy, `policies.${policy.id}`),
          );
          const executionExpression =
            findDefinitionExpressionBindingReference(
              policy,
              "execution",
              definitions,
            );
          if (executionExpression) {
            diagnostics.push({
              code: "participation-execution-binding-forbidden",
              path: executionExpression.contract?.definitionPath ??
                `scenarios.${id}.participation.policy_ref`,
              line: executionExpression.root.span.start.line,
              column: executionExpression.root.span.start.column,
              source: executionExpression.source,
              message: `Participation Policy '${participation.policy_ref}' depends on execution context that is unavailable before Scenario execution`,
            });
          }
          const policyParameters = Array.isArray(policy.parameters)
            ? policy.parameters
            : [];
          policyParameters.forEach((value, parameterIndex) => {
            if (typeof value !== "object" || value === null) return;
            const parameter = value as Record<string, unknown>;
            const types = Array.isArray(parameter.types) ? parameter.types : [];
            types.forEach((type, typeIndex) => {
              if (typeof type !== "string" || definitions.types[type]) return;
              diagnostics.push({
                code: "unknown-participation-policy-type",
                path: `policies.${policy.id}.parameters[${parameterIndex}].types[${typeIndex}]`,
                message: `Participation Policy '${participation.policy_ref}' references undeclared lifecycle type '${type}'`,
              });
            });
          });
          const parameterNames = policyParameters
              .flatMap((value) => {
                if (typeof value !== "object" || value === null) return [];
                const name = (value as Record<string, unknown>).name;
                return typeof name === "string" ? [name] : [];
              });
          const parameters = new Set(parameterNames);
          if (parameterNames.includes("execution")) {
            diagnostics.push({
              code: "participation-execution-binding-reserved",
              path: `policies.${policy.id}.parameters`,
              message: `Participation Policy '${participation.policy_ref}' cannot use reserved parameter name 'execution'`,
            });
          }
          if (parameters.size !== parameterNames.length) {
            diagnostics.push({
              code: "participation-policy-parameters",
              path: `policies.${policy.id}.parameters`,
              message: `Participation Policy '${participation.policy_ref}' has duplicate parameter names`,
            });
          }
          const argumentsValue = typeof participation.arguments === "object" &&
              participation.arguments !== null &&
              !Array.isArray(participation.arguments)
            ? participation.arguments as Record<string, unknown>
            : {};
          const supplied = new Set(Object.keys(argumentsValue));
          const missing = [...parameters].filter((name) => !supplied.has(name));
          const unknown = [...supplied].filter((name) => !parameters.has(name));
          if (missing.length > 0 || unknown.length > 0) {
            diagnostics.push({
              code: "participation-policy-arguments",
              path: `scenarios.${id}.participation.arguments`,
              message: `Scenario '${id}' participation arguments must exactly match Policy '${participation.policy_ref}'; missing: ${missing.join(", ") || "none"}; unknown: ${unknown.join(", ") || "none"}`,
            });
          }
        }
      }
    }
  }

  const coreCommands = new Set([
    "backlinks",
    "baseline",
    "doctor",
    "history",
    "init",
    "link",
    "list",
    "loose-ends",
    "new",
    "next",
    "obligation",
    "phase",
    "policy",
    "process",
    "relation",
    "revise",
    "scenario",
    "selector",
    "show",
    "state",
    "trace",
    "unlink",
  ]);
  for (const [id, definition] of Object.entries(definitions.aliases)) {
    if (coreCommands.has(id.split(".")[0] ?? "")) {
      diagnostics.push({
        code: "alias-command-conflict",
        path: `aliases.${id}.id`,
        message: `Package Command Alias '${id}' conflicts with a kernel-owned command`,
      });
    }
    if (typeof definition.scenario !== "string") continue;
    diagnostics.push(
      ...validateVersionedReference(
        definition.scenario,
        definitions.scenarios,
        `aliases.${id}.scenario`,
        "Scenario",
      ),
    );
  }

  for (const [id, definition] of Object.entries(definitions.phases)) {
    const checkpointIds = Array.isArray(definition.attention_checkpoints)
      ? definition.attention_checkpoints.flatMap((value) => {
          if (typeof value !== "object" || value === null) return [];
          const checkpoint = (value as Record<string, unknown>).id;
          return typeof checkpoint === "string" ? [checkpoint] : [];
        })
      : [];
    const duplicateCheckpoints = checkpointIds.filter(
      (checkpoint, index) => checkpointIds.indexOf(checkpoint) !== index,
    );
    for (const checkpoint of [...new Set(duplicateCheckpoints)]) {
      diagnostics.push({
        code: "duplicate-attention-checkpoint",
        path: `phases.${id}.attention_checkpoints`,
        message: `Phase '${id}' declares attention checkpoint '${checkpoint}' more than once`,
      });
    }
    const progression = typeof definition.progression === "object" &&
        definition.progression !== null
      ? definition.progression as Record<string, unknown>
      : undefined;
    const progressionAuthority = progression &&
        typeof progression.authorization === "object" &&
        progression.authorization !== null
      ? progression.authorization as Record<string, unknown>
      : undefined;
    if (progression) {
      const nextPhase = progression.next_phase;
      if (typeof nextPhase === "string" && !definitions.phases[nextPhase]) {
        diagnostics.push({
          code: "unknown-phase-reference",
          path: `phases.${id}.progression.next_phase`,
          message: `Phase '${id}' references unknown next Phase '${nextPhase}'`,
        });
      }
      for (const [field, catalog, kind] of [
        ["policy_ref", definitions.policies, "Participation Policy"],
        ["scenario", definitions.scenarios, "Scenario"],
        ["evidence_selector", definitions.selectors, "Selector"],
      ] as const) {
        const reference = progressionAuthority?.[field];
        if (typeof reference !== "string") continue;
        const referenceDiagnostics = validateVersionedReference(
          reference,
          catalog,
          `phases.${id}.progression.authorization.${field}`,
          kind,
        );
        diagnostics.push(...referenceDiagnostics);
        if (field === "policy_ref" && referenceDiagnostics.length === 0) {
          const policy = definitions.policies[referenceId(reference) ?? ""];
          if (policy) {
            diagnostics.push(
              ...validateParticipationPolicy(policy, `policies.${policy.id}`),
            );
            const parameterNames = Array.isArray(policy.parameters)
              ? policy.parameters.flatMap((value) => {
                  if (typeof value !== "object" || value === null) return [];
                  const name = (value as Record<string, unknown>).name;
                  return typeof name === "string" ? [name] : [];
                })
              : [];
            const parameters = new Set(parameterNames);
            const argumentsValue = progressionAuthority &&
                typeof progressionAuthority.arguments === "object" &&
                progressionAuthority.arguments !== null &&
                !Array.isArray(progressionAuthority.arguments)
              ? progressionAuthority.arguments as Record<string, unknown>
              : {};
            const supplied = new Set(Object.keys(argumentsValue));
            const missing = [...parameters].filter((name) => !supplied.has(name));
            const unknown = [...supplied].filter((name) => !parameters.has(name));
            if (missing.length > 0 || unknown.length > 0) {
              diagnostics.push({
                code: "phase-progression-policy-arguments",
                path: `phases.${id}.progression.authorization.arguments`,
                message: `Phase '${id}' progression arguments must exactly match Policy '${reference}'; missing: ${missing.join(", ") || "none"}; unknown: ${unknown.join(", ") || "none"}`,
              });
            }
          }
        }
        if (
          field === "scenario" &&
          referenceDiagnostics.length === 0 &&
          Array.isArray(definition.scenarios) &&
          !definition.scenarios.includes(reference)
        ) {
          diagnostics.push({
            code: "phase-progression-scenario-disabled",
            path: `phases.${id}.progression.authorization.scenario`,
            message: `Phase progression Scenario '${reference}' is not enabled in Phase '${id}'`,
          });
        }
      }
    }
    const gate = typeof definition.gate === "object" && definition.gate !== null
      ? definition.gate as Record<string, unknown>
      : undefined;
    if (typeof gate?.obligation === "string") {
      diagnostics.push(
        ...validateVersionedReference(
          gate.obligation,
          definitions.obligations,
          `phases.${id}.gate.obligation`,
          "Obligation",
        ),
      );
    }
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

  const visitedProgressionPhases = new Set<string>();
  const visitingProgressionPhases = new Set<string>();
  const visitProgression = (phaseId: string, chain: string[]): void => {
    if (visitedProgressionPhases.has(phaseId)) return;
    if (visitingProgressionPhases.has(phaseId)) return;
    visitingProgressionPhases.add(phaseId);
    const definition = definitions.phases[phaseId];
    const progression = definition && typeof definition.progression === "object" &&
        definition.progression !== null
      ? definition.progression as Record<string, unknown>
      : undefined;
    const nextPhase = progression?.next_phase;
    if (typeof nextPhase === "string" && definitions.phases[nextPhase]) {
      if (visitingProgressionPhases.has(nextPhase)) {
        diagnostics.push({
          code: "phase-progression-cycle",
          path: `phases.${phaseId}.progression.next_phase`,
          message: `Phase progression cycle: ${[...chain, phaseId, nextPhase].join(" -> ")}`,
        });
      } else {
        visitProgression(nextPhase, [...chain, phaseId]);
      }
    }
    visitingProgressionPhases.delete(phaseId);
    visitedProgressionPhases.add(phaseId);
  };
  Object.keys(definitions.phases).sort().forEach((phaseId) =>
    visitProgression(phaseId, [])
  );

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
      scenarios: definitions.scenarios,
    }),
  ];
}
