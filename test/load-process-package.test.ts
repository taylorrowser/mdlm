import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadProcessPackage } from "../src/index.js";

async function copiedProcessPackage(): Promise<string> {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-process-"));
  const processRoot = path.join(temporaryRoot, "process");
  await fs.cp(path.join(process.cwd(), ".lifecycle/process"), processRoot, {
    recursive: true,
  });
  return processRoot;
}

describe("loadProcessPackage", () => {
  it("loads and validates the bootstrap process package", async () => {
    const result = await loadProcessPackage(
      path.join(process.cwd(), ".lifecycle/process"),
    );

    expect(result.ok, result.diagnostics.map((item) => item.message).join("\n")).toBe(
      true,
    );
    if (!result.ok) return;

    expect(result.package.manifest.version).toBe("0.59.0");
    expect(Object.keys(result.package.types)).toHaveLength(21);
    expect(Object.keys(result.package.templates)).toHaveLength(3);
    expect(Object.keys(result.package.selectors)).toHaveLength(287);
    expect(result.package.selectors).toEqual(expect.objectContaining({
      "accepted-baseline-promotes-candidate": expect.any(Object),
      "blocking-product-simplification-reviews-for": expect.any(Object),
      "candidate-correction-decisions-for": expect.any(Object),
      "candidate-definition-members": expect.any(Object),
      "phase-0-candidate-review-context-members": expect.any(Object),
      "review-context-members-for": expect.any(Object),
      "phase-2-definition-members-for-plan": expect.any(Object),
      "valid-phase-2-simplification-review": expect.any(Object),
      "failed-phase-2-simplification-reviews-by-scope": expect.any(Object),
      "review-context-contains-member": expect.any(Object),
      "intent-candidates-matching-subject": expect.any(Object),
      "accepted-intent-candidates-for-change": expect.any(Object),
      "revisions-tracing-subject": expect.any(Object),
      "changes-changed-under-subject": expect.any(Object),
      "invalid-product-simplification-blockers-for-review": expect.any(Object),
      "matching-product-simplification-review": expect.any(Object),
      "product-simplification-blockers-for-candidate": expect.any(Object),
      "product-simplification-blockers-for-review": expect.any(Object),
      "product-simplification-reviews-blocking-subject": expect.any(Object),
      "valid-product-simplification-reviews": expect.any(Object),
      "product-simplification-reviews-for": expect.any(Object),
      "review-correction-history-for": expect.any(Object),
      "phase-0-intent-approvals-for": expect.any(Object),
      "failed-question-decisions": expect.any(Object),
      "valid-question-decision-replacements-for": expect.any(Object),
      "question-targets-for-decision": expect.any(Object),
      "cited-failing-reviews-by-correction": expect.any(Object),
      "foundation-correction-history": expect.any(Object),
      "foundation-correction-decisions-for": expect.any(Object),
      "foundation-review-failures-at-stage": expect.any(Object),
      "reviewed-gate-rejections-for-candidate": expect.any(Object),
      "matching-cited-gate-rejection-by-correction": expect.any(Object),
      "gate-rejection-corrections-for-subject": expect.any(Object),
      "phase-1-assurance-correction-decisions-for": expect.any(Object),
    }));
    expect(Object.keys(result.package.policies)).toHaveLength(14);
    expect(Object.keys(result.package.obligations)).toHaveLength(59);
    expect(Object.keys(result.package.scenarios)).toHaveLength(61);
    expect(result.package.phases["phase-0-wayfinding"]?.attention_checkpoints)
      .toEqual([expect.objectContaining({
        id: "phase-0-gate",
        readiness: expect.objectContaining({
          source: expect.stringContaining("candidate-baselines-of-kind@1"),
        }),
      })]);
    expect(result.package.phases["phase-2-system-definition"]
      ?.attention_checkpoints).toEqual([expect.objectContaining({
        id: "phase-2-system-gate",
        readiness: expect.objectContaining({
          source: expect.stringContaining("complete-phase-2-level-candidates@1"),
        }),
      })]);
    expect(result.package.obligations["verification-strategy-review-correction-required"])
      .toEqual(expect.objectContaining({
        resolve_with: expect.objectContaining({
          scenario: "revise-verification-strategy-after-review@2",
        }),
      }));
    expect(result.package.obligations["environment-review-correction-required"])
      .toEqual(expect.objectContaining({
        resolve_with: expect.objectContaining({
          scenario: "revise-environment-assurance-after-review@2",
        }),
      }));
    expect(result.package.obligations["pilot-verification-activity-review-correction-required"])
      .toEqual(expect.objectContaining({
        resolve_with: expect.objectContaining({
          scenario: "revise-pilot-verification-activity-after-review@2",
        }),
      }));
    expect(result.package.obligations["pilot-target-required"])
      .toEqual(expect.objectContaining({
        resolve_with: expect.objectContaining({
          scenario: "register-pilot-target@1",
        }),
      }));
    expect(result.package.scenarios["review-datum-in-context"]
      ?.review_policy_arguments).toEqual({
        subject: expect.objectContaining({
          kind: "mdlm-expression",
          source: "subject",
        }),
      });
    expect(result.package.scenarios["register-pilot-target"]?.participation)
      .toBeUndefined();
    for (const scenario of [
      "revise-verification-strategy-after-review",
      "revise-environment-assurance-after-review",
      "revise-pilot-verification-activity-after-review",
    ]) {
      expect(result.package.scenarios[scenario]?.participation).toEqual({
        policy_ref: "phase-1-assurance-correction-participation@1",
        arguments: { subject: expect.any(Object) },
      });
      expect(result.package.scenarios[scenario]?.authority_evidence).toEqual({
        output: "decision",
        type: "DEC",
      });
      const prompt = await fs.readFile(
        path.join(
          result.package.root,
          `prompts/${scenario}.md`,
        ),
        "utf8",
      );
      expect(prompt).toContain("`decision`");
      expect(prompt).toContain("`kind: scope`");
      expect(prompt).toContain("`effective_scope`");
      expect(prompt).toContain("$proposal.<replacement-local-id>.revision_id");
      expect(prompt).toContain("`justifies`");
    }
    expect(result.diagnostics).toEqual([]);
  });

  it("rejects review Policy argument mappings that do not cover the Policy", async () => {
    const processRoot = await copiedProcessPackage();
    const scenarioPath = path.join(
      processRoot,
      "scenarios/review-datum-in-context.yaml",
    );
    const scenario = await fs.readFile(scenarioPath, "utf8");
    await fs.writeFile(
      scenarioPath,
      scenario.replace("  subject: subject", "  other: subject"),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "review-policy-arguments",
      path: "scenarios.review-datum-in-context.review_policy_arguments",
      message: expect.stringContaining("missing: subject; unknown: other"),
    }));
  });

  it("rejects review Policy arguments bound to a missing Scenario input", async () => {
    const processRoot = await copiedProcessPackage();
    const scenarioPath = path.join(
      processRoot,
      "scenarios/review-datum-in-context.yaml",
    );
    const scenario = await fs.readFile(scenarioPath, "utf8");
    await fs.writeFile(
      scenarioPath,
      scenario.replace("  subject: subject", "  subject: absent"),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "expression-unknown-binding",
      path: expect.stringContaining(
        "review-datum-in-context.yaml#review_policy_arguments.subject",
      ),
    }));
  });

  it("rejects Review Policy arguments with incompatible parameter kinds", async () => {
    const processRoot = await copiedProcessPackage();
    const policyPath = path.join(
      processRoot,
      "policies/review-applicability.yaml",
    );
    const policy = await fs.readFile(policyPath, "utf8");
    await fs.writeFile(
      policyPath,
      policy.replace("kind: revision", "kind: stable-datum"),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "review-policy-argument-type",
      path: expect.stringContaining(
        "review-datum-in-context.yaml#review_policy_arguments.subject",
      ),
    }));
  });

  it("rejects Review Policies with duplicate parameter names", async () => {
    const processRoot = await copiedProcessPackage();
    const policyPath = path.join(
      processRoot,
      "policies/review-applicability.yaml",
    );
    const policy = await fs.readFile(policyPath, "utf8");
    await fs.writeFile(
      policyPath,
      policy.replace(
        "  - {name: subject, kind: revision}",
        "  - {name: subject, kind: revision}\n  - {name: subject, kind: stable-datum}",
      ),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "policy-parameters",
      path: "policies.review-applicability.parameters",
    }));
  });

  it("validates Review Context membership contracts for DEC and CHG callers", async () => {
    const result = await loadProcessPackage(
      path.join(process.cwd(), ".lifecycle/process"),
    );

    expect(result.ok, result.diagnostics.map((item) => item.message).join("\n")).toBe(
      true,
    );
    if (!result.ok) return;

    expect(result.package.selectors["review-context-contains-member"]?.parameters)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          name: "required_member",
          types: expect.arrayContaining(["DEC", "CHG"]),
        }),
      ]));
    expect(result.diagnostics).toEqual([]);
  });

  it("compiles package-authored terminal outcome conditions", async () => {
    const result = await loadProcessPackage(
      path.join(process.cwd(), ".lifecycle/process"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.package.profiles.bootstrap?.terminal_outcomes).toEqual({
      profile_boundary: {
        condition: expect.objectContaining({
          source: expect.stringContaining('decision.payload.decision == "proceed"'),
        }),
        explanation: expect.stringContaining("Phase 3–6 boundary"),
      },
      lifecycle_complete: {
        condition: expect.objectContaining({
          source: expect.stringContaining('decision.payload.decision == "stop"'),
        }),
        explanation: expect.stringContaining("intentionally complete"),
      },
    });
  });

  it("rejects malformed, unresolved, and ambiguous terminal outcome declarations", async () => {
    const malformedRoot = await copiedProcessPackage();
    const malformedPath = path.join(malformedRoot, "profiles/bootstrap.yaml");
    const malformed = await fs.readFile(malformedPath, "utf8");
    await fs.writeFile(
      malformedPath,
      malformed.replace(
        /    explanation: The selected profile[^\n]+/,
        "    explanation: ''",
      ),
    );
    const unresolvedRoot = await copiedProcessPackage();
    const unresolvedPath = path.join(unresolvedRoot, "profiles/bootstrap.yaml");
    const unresolved = await fs.readFile(unresolvedPath, "utf8");
    await fs.writeFile(
      unresolvedPath,
      unresolved.replace(
        'exists("all-pilot-assessments@1", {})',
        'exists("unknown-terminal-evidence@1", {})',
      ),
    );
    const ambiguousRoot = await copiedProcessPackage();
    const ambiguousPath = path.join(ambiguousRoot, "profiles/bootstrap.yaml");
    const ambiguous = await fs.readFile(ambiguousPath, "utf8");
    await fs.writeFile(
      ambiguousPath,
      ambiguous.replace(
        /    condition: >-[\s\S]*?    explanation: The selected profile/,
        "    condition: 'true'\n    explanation: The selected profile",
      ).replace(
        /    condition: >-[\s\S]*?    explanation: Every current/,
        "    condition: 'true'\n    explanation: Every current",
      ),
    );

    const [malformedResult, unresolvedResult, ambiguousResult] = await Promise.all([
      loadProcessPackage(malformedRoot),
      loadProcessPackage(unresolvedRoot),
      loadProcessPackage(ambiguousRoot),
    ]);

    expect(malformedResult).toEqual(expect.objectContaining({
      ok: false,
      diagnostics: expect.arrayContaining([expect.objectContaining({
        code: "meta-schema",
        path: expect.stringContaining(
          "bootstrap.yaml/terminal_outcomes/profile_boundary/explanation",
        ),
      })]),
    }));
    expect(unresolvedResult).toEqual(expect.objectContaining({
      ok: false,
      diagnostics: expect.arrayContaining([expect.objectContaining({
        code: "expression-unknown-selector",
        path: expect.stringContaining(
          "terminal_outcomes.profile_boundary.condition",
        ),
      })]),
    }));
    expect(ambiguousResult).toEqual({
      ok: false,
      diagnostics: [expect.objectContaining({
        code: "ambiguous-terminal-outcomes",
        path: "profiles.bootstrap.terminal_outcomes",
      })],
    });
  });

  it("rejects ambiguous explicit-initiation and Resolver semantics", async () => {
    const processRoot = await copiedProcessPackage();
    const scenarioPath = path.join(
      processRoot,
      "scenarios/chart-wayfinding-map.yaml",
    );
    const source = await fs.readFile(scenarioPath, "utf8");
    await fs.writeFile(
      scenarioPath,
      source.replace("resolves: []", "resolves: [open-question-resolution]"),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result).toEqual({
      ok: false,
      diagnostics: [expect.objectContaining({
        code: "scenario-authorization-ambiguous",
        path: "scenarios.chart-wayfinding-map.initiation",
      })],
    });
  });

  it("rejects every legacy YAML expression-tree family", async () => {
    const legacyForms = {
      literal: "literal: true",
      var: "var: subject",
      path: "path: {var: subject, field: identity.type}",
      state: "state: {dimension: validity, subject: {var: subject}}",
      policy:
        "policy: {ref: review-applicability@1, arguments: {subject: {var: subject}}, field: required}",
      count:
        "count: {selector: review-required-revisions@1, arguments: {}}",
      compare:
        "compare: {left: {literal: true}, operator: eq, right: {literal: true}}",
      all: "all: [{present: {var: subject}}]",
      any: "any: [{present: {var: subject}}]",
      not: "not: {present: {var: subject}}",
      exists:
        "exists: {selector: review-required-revisions@1, arguments: {}}",
      none: "none: {selector: review-required-revisions@1, arguments: {}}",
      every:
        "every: {selector: review-required-revisions@1, arguments: {}, as: item, satisfies: {present: {var: item}}}",
      present: "present: {var: subject}",
    };

    const results = await Promise.all(
      Object.values(legacyForms).map(async (legacySource) => {
        const processRoot = await copiedProcessPackage();
        const statePath = path.join(
          processRoot,
          "states/relationship-overlays.yaml",
        );
        const state = await fs.readFile(statePath, "utf8");
        await fs.writeFile(
          statePath,
          state.replace(
            "    when: 'subject.provenance.process_ref != process.current_ref'",
            `    when:\n      ${legacySource}`,
          ),
        );
        return loadProcessPackage(processRoot);
      }),
    );

    for (const result of results) {
      expect(result.ok).toBe(false);
      expect(result.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "legacy-expression-authoring",
            path: expect.stringContaining(
              "relationship-overlays.yaml#rules[2].when",
            ),
            message:
              "Expression-bearing fields require mdlm-expression@1 textual source; legacy YAML expression trees are not accepted",
          }),
          expect.objectContaining({
            code: "meta-schema",
            path: expect.stringContaining(
              "relationship-overlays.yaml/rules/2/when",
            ),
            message: "must be string",
          }),
        ]),
      );
    }
  }, 20_000);

  it("rejects a legacy structural Selector invocation", async () => {
    const processRoot = await copiedProcessPackage();
    const obligationPath = path.join(
      processRoot,
      "obligations/candidate-gate-signoff.yaml",
    );
    const obligation = await fs.readFile(obligationPath, "utf8");
    await fs.writeFile(
      obligationPath,
      obligation.replace(
        'for_each: \'select("gate-authorization-candidates@1", {})\'',
        "for_each: {selector: gate-authorization-candidates@1, arguments: {}}",
      ),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "legacy-expression-authoring",
          path: expect.stringContaining(
            "candidate-gate-signoff.yaml#for_each",
          ),
        }),
      ]),
    );
  });

  it("rejects disagreement between the manifest and loaded definition catalogs", async () => {
    const processRoot = await copiedProcessPackage();
    const manifestPath = path.join(processRoot, "manifest.yaml");
    const manifest = await fs.readFile(manifestPath, "utf8");
    await fs.writeFile(
      manifestPath,
      manifest.replace(
        "  policies: [dependency-reassessment, review-applicability, waiver-applicability, contextual-review-participation, verification-implementation-participation, question-participation, gate-signoff-participation, consequential-decision-participation, phase-progression-participation, intent-candidate-correction-participation, phase-1-assurance-correction-participation, phase-2-correction-participation, stakeholder-change-correction-participation, pilot-assessment-correction-participation]",
        "  policies: [dependency-reassessment, waiver-applicability, contextual-review-participation, verification-implementation-participation, question-participation, gate-signoff-participation, consequential-decision-participation, phase-progression-participation, intent-candidate-correction-participation, phase-1-assurance-correction-participation, phase-2-correction-participation, stakeholder-change-correction-participation, pilot-assessment-correction-participation]",
      ),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "manifest-catalog-disagreement",
          path: "manifest.catalog.policies",
          message:
            "Manifest catalog 'policies' does not match loaded definitions; missing from manifest: review-applicability",
        }),
      ]),
    );
  });

  it("rejects a package that does not pin mdlm-expression@1", async () => {
    const processRoot = await copiedProcessPackage();
    const manifestPath = path.join(processRoot, "manifest.yaml");
    const manifest = await fs.readFile(manifestPath, "utf8");
    await fs.writeFile(
      manifestPath,
      manifest.replace("mdlm-expression@1", "mdlm-expression@2"),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "meta-schema",
          path: expect.stringContaining("manifest.yaml/language/expressions"),
          message: "must be equal to constant",
        }),
      ]),
    );
  });

  it("rejects a version-mismatched Policy reference", async () => {
    const processRoot = await copiedProcessPackage();
    const scenarioPath = path.join(processRoot, "scenarios/compile-psp.yaml");
    const scenario = await fs.readFile(scenarioPath, "utf8");
    await fs.writeFile(
      scenarioPath,
      scenario.replace("review-applicability@1", "review-applicability@2"),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "version-mismatch",
          path: "scenarios.compile-psp.review_policy_ref",
          message:
            "Reference 'review-applicability@2' resolves to review-applicability@1",
        }),
      ]),
    );
  });

  it("rejects an unknown Policy reference in a Scenario", async () => {
    const processRoot = await copiedProcessPackage();
    const scenarioPath = path.join(processRoot, "scenarios/compile-psp.yaml");
    const scenario = await fs.readFile(scenarioPath, "utf8");
    await fs.writeFile(
      scenarioPath,
      scenario.replace("review-applicability@1", "missing-policy@1"),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unknown-reference",
          path: "scenarios.compile-psp.review_policy_ref",
          message: "Unknown Policy reference 'missing-policy@1'",
        }),
      ]),
    );
  });

  it("rejects a Resolver Scenario with a missing required input binding", async () => {
    const processRoot = await copiedProcessPackage();
    const obligationPath = path.join(
      processRoot,
      "obligations/review-context-required.yaml",
    );
    const obligation = await fs.readFile(obligationPath, "utf8");
    await fs.writeFile(
      obligationPath,
      obligation.replace(
        "  inputs:\n    subject: subject\n    context_members: 'select(\"review-context-members-for@1\", {subject: subject})'",
        "  inputs: {}",
      ),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "resolver-input-missing",
          path: "obligations.review-context-required.resolve_with.inputs.subject",
          message:
            "Obligation 'review-context-required' does not bind required input 'subject' for Resolver Scenario 'create-review-context@1'",
        }),
      ]),
    );
  });

  it("rejects a Resolver binding with incompatible lifecycle types", async () => {
    const processRoot = await copiedProcessPackage();
    const scenarioPath = path.join(
      processRoot,
      "scenarios/create-review-context.yaml",
    );
    const scenario = await fs.readFile(scenarioPath, "utf8");
    await fs.writeFile(
      scenarioPath,
      scenario.replace(
        "types: [MAP, PSP, STK, SYS, ASP, ICSP, DWP, VSP, ENV, VER, VAI, BSL, DEC, PRB, CHG, PAS]",
        "types: [QST]",
      ),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "resolver-input-type",
          path: "obligations.review-context-required.resolve_with.inputs.subject",
          message:
            "Resolver input 'subject' for Scenario 'create-review-context@1' requires type QST, but the binding can provide ASP, BSL, CHG, DEC, DWP, ENV, ICSP, MAP, PAS, PRB, PSP, STK, SYS, VAI, VER, VSP",
        }),
      ]),
    );
  });

  it("rejects a Resolver binding with an incompatible identity kind", async () => {
    const processRoot = await copiedProcessPackage();
    const scenarioPath = path.join(
      processRoot,
      "scenarios/create-review-context.yaml",
    );
    const scenario = await fs.readFile(scenarioPath, "utf8");
    await fs.writeFile(
      scenarioPath,
      scenario.replace("identity: revision", "identity: stable"),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "resolver-input-kind",
          path: "obligations.review-context-required.resolve_with.inputs.subject",
          message:
            "Resolver input 'subject' for Scenario 'create-review-context@1' requires stable identity, but the binding provides revision",
        }),
      ]),
    );
  });

  it("rejects a Resolver binding with incompatible cardinality", async () => {
    const processRoot = await copiedProcessPackage();
    const scenarioPath = path.join(
      processRoot,
      "scenarios/create-review-context.yaml",
    );
    const scenario = await fs.readFile(scenarioPath, "utf8");
    await fs.writeFile(
      scenarioPath,
      scenario.replace("cardinality: one, identity", "cardinality: one-or-more, identity"),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "resolver-input-cardinality",
          path: "obligations.review-context-required.resolve_with.inputs.subject",
          message:
            "Resolver input 'subject' for Scenario 'create-review-context@1' requires one-or-more values, but the binding provides one",
        }),
      ]),
    );
  });

  it("rejects a Resolver binding for an undeclared Scenario input", async () => {
    const processRoot = await copiedProcessPackage();
    const obligationPath = path.join(
      processRoot,
      "obligations/review-context-required.yaml",
    );
    const obligation = await fs.readFile(obligationPath, "utf8");
    await fs.writeFile(
      obligationPath,
      obligation.replace("    subject: subject", "    subject: subject\n    surprise: subject"),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "resolver-input-undeclared",
          path: "obligations.review-context-required.resolve_with.inputs.surprise",
          message:
            "Obligation 'review-context-required' binds undeclared input 'surprise' for Resolver Scenario 'create-review-context@1'",
        }),
      ]),
    );
  });

  it("rejects a required link to an optional target when the link requires one", async () => {
    const processRoot = await copiedProcessPackage();
    const scenarioPath = path.join(
      processRoot,
      "scenarios/review-datum-in-context.yaml",
    );
    const scenario = await fs.readFile(scenarioPath, "utf8");
    await fs.writeFile(
      scenarioPath,
      scenario.replace(
        "  - {name: review_context, types: [BSL], cardinality: one, identity: revision}",
        "  - {name: review_context, types: [BSL], cardinality: zero-or-one, identity: revision}",
      ),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "impossible-required-link-cardinality",
          path:
            "scenarios.review-datum-in-context.outputs[0].required_links[1].target.input",
          message:
            "Scenario 'review-datum-in-context' requires link 'contextualizes' with at least one target, but input 'review_context' may provide zero",
        }),
      ]),
    );
  });

  it("rejects a required link whose target identity violates its source contract", async () => {
    const processRoot = await copiedProcessPackage();
    const scenarioPath = path.join(
      processRoot,
      "scenarios/review-datum-in-context.yaml",
    );
    const scenario = await fs.readFile(scenarioPath, "utf8");
    await fs.writeFile(
      scenarioPath,
      scenario.replace(
        "types: [MAP, PSP, STK, SYS, ASP, ICSP, DWP, VSP, ENV, VER, VAI, BSL, DEC, PRB, CHG, PAS], cardinality: one, identity: revision",
        "types: [MAP, PSP, STK, SYS, ASP, ICSP, DWP, VSP, ENV, VER, VAI, BSL, DEC, PRB, CHG, PAS], cardinality: one, identity: stable",
      ),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "impossible-required-link-identity",
          path:
            "scenarios.review-datum-in-context.outputs[0].required_links[0].target.input",
          message:
            "Scenario 'review-datum-in-context' requires link 'reviews' from output type REV to revision identity, but input 'subject' provides stable",
        }),
      ]),
    );
  });

  it("rejects a required link whose target types violate its source contract", async () => {
    const processRoot = await copiedProcessPackage();
    const scenarioPath = path.join(
      processRoot,
      "scenarios/review-datum-in-context.yaml",
    );
    const scenario = await fs.readFile(scenarioPath, "utf8");
    await fs.writeFile(
      scenarioPath,
      scenario.replace(
        "types: [MAP, PSP, STK, SYS, ASP, ICSP, DWP, VSP, ENV, VER, VAI, BSL, DEC, PRB, CHG, PAS]",
        "types: [QST]",
      ),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "impossible-required-link-target",
          path:
            "scenarios.review-datum-in-context.outputs[0].required_links[0].target.input",
          message:
            "Scenario 'review-datum-in-context' requires link 'reviews' from output type REV to input 'subject' of unsupported type QST",
        }),
      ]),
    );
  });

  it("rejects a required link unavailable on the declared output type", async () => {
    const processRoot = await copiedProcessPackage();
    const scenarioPath = path.join(
      processRoot,
      "scenarios/review-datum-in-context.yaml",
    );
    const scenario = await fs.readFile(scenarioPath, "utf8");
    await fs.writeFile(
      scenarioPath,
      scenario.replace("types: [REV]", "types: [DEC]"),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "impossible-required-link",
          path:
            "scenarios.review-datum-in-context.outputs[0].required_links[0].link",
          message:
            "Scenario 'review-datum-in-context' output 'review' requires link 'reviews', but output type DEC does not declare it",
        }),
      ]),
    );
  });

  it("rejects a required output link to an undeclared Scenario value", async () => {
    const processRoot = await copiedProcessPackage();
    const scenarioPath = path.join(
      processRoot,
      "scenarios/review-datum-in-context.yaml",
    );
    const scenario = await fs.readFile(scenarioPath, "utf8");
    await fs.writeFile(
      scenarioPath,
      scenario.replace("target: {input: subject}", "target: {input: missing}"),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unknown-required-link-target",
          path:
            "scenarios.review-datum-in-context.outputs[0].required_links[0].target.input",
          message:
            "Scenario 'review-datum-in-context' output 'review' requires link 'reviews' to undeclared input 'missing'",
        }),
      ]),
    );
  });

  it("rejects a Scenario that also prohibits one of its declared inputs", async () => {
    const processRoot = await copiedProcessPackage();
    const scenarioPath = path.join(
      processRoot,
      "scenarios/create-review-context.yaml",
    );
    const scenario = await fs.readFile(scenarioPath, "utf8");
    await fs.writeFile(
      scenarioPath,
      scenario.replace(
        "prohibited_inputs: [mutable latest aliases, generated indexes as lifecycle truth]",
        "prohibited_inputs: [subject]",
      ),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "prohibited-scenario-input",
          path: "scenarios.create-review-context.prohibited_inputs[0]",
          message:
            "Scenario 'create-review-context' declares input 'subject' as prohibited",
        }),
      ]),
    );
  });

  it("rejects a Scenario output with an undeclared lifecycle type", async () => {
    const processRoot = await copiedProcessPackage();
    const scenarioPath = path.join(processRoot, "scenarios/compile-psp.yaml");
    const scenario = await fs.readFile(scenarioPath, "utf8");
    await fs.writeFile(
      scenarioPath,
      scenario.replace("types: [PSP]", "types: [XYZ]"),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unknown-scenario-output-type",
          path: "scenarios.compile-psp.outputs[0].types[0]",
          message:
            "Scenario 'compile-psp' output 'product_specification' references undeclared lifecycle type 'XYZ'",
        }),
      ]),
    );
  });

  it("rejects an enabled Obligation whose Resolver Scenario is disabled", async () => {
    const processRoot = await copiedProcessPackage();
    const phasePath = path.join(processRoot, "phases/phase-0-wayfinding.yaml");
    const phase = await fs.readFile(phasePath, "utf8");
    await fs.writeFile(
      phasePath,
      phase.replace("  - create-review-context@1\n", ""),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "resolver-scenario-disabled",
          path: "phases.phase-0-wayfinding.scenarios",
          message:
            "Obligation 'review-context-required@2' is enabled in Phase 'phase-0-wayfinding' without Resolver Scenario 'create-review-context@1'",
        }),
      ]),
    );
  });

  it("rejects an unknown Scenario reference in an Obligation", async () => {
    const processRoot = await copiedProcessPackage();
    const obligationPath = path.join(
      processRoot,
      "obligations/review-context-required.yaml",
    );
    const obligation = await fs.readFile(obligationPath, "utf8");
    await fs.writeFile(
      obligationPath,
      obligation.replace("create-review-context@1", "missing-scenario@1"),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unknown-reference",
          path: "obligations.review-context-required.resolve_with.scenario",
          message: "Unknown Scenario reference 'missing-scenario@1'",
        }),
      ]),
    );
  });

  it("rejects an unknown Obligation named by a resolving Scenario", async () => {
    const processRoot = await copiedProcessPackage();
    const scenarioPath = path.join(
      processRoot,
      "scenarios/create-review-context.yaml",
    );
    const scenario = await fs.readFile(scenarioPath, "utf8");
    await fs.writeFile(
      scenarioPath,
      scenario.replace("review-context-required", "missing-obligation"),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unknown-reference",
          path: "scenarios.create-review-context.resolves[0]",
          message: "Unknown Obligation reference 'missing-obligation'",
        }),
      ]),
    );
  });

  it("rejects an unknown Obligation reference in a Phase", async () => {
    const processRoot = await copiedProcessPackage();
    const phasePath = path.join(processRoot, "phases/phase-0-wayfinding.yaml");
    const phase = await fs.readFile(phasePath, "utf8");
    await fs.writeFile(
      phasePath,
      phase.replace("review-context-required@2", "missing-obligation@2"),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unknown-reference",
          path: "phases.phase-0-wayfinding.obligations[8]",
          message: "Unknown Obligation reference 'missing-obligation@2'",
        }),
      ]),
    );
  });

  it("rejects an unknown blocking Obligation reference", async () => {
    const processRoot = await copiedProcessPackage();
    const obligationPath = path.join(
      processRoot,
      "obligations/passing-review-required.yaml",
    );
    const obligation = await fs.readFile(obligationPath, "utf8");
    await fs.writeFile(
      obligationPath,
      obligation.replace(
        "review-context-required@2",
        "missing-obligation@2",
      ),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unknown-reference",
          path:
            "obligations.passing-review-required.status_rules[1].blocked_by[0].obligation",
          message: "Unknown Obligation reference 'missing-obligation@2'",
        }),
      ]),
    );
  });

  it("rejects duplicate and malformed Phase attention checkpoint declarations", async () => {
    const duplicateRoot = await copiedProcessPackage();
    const duplicatePath = path.join(
      duplicateRoot,
      "phases/phase-0-wayfinding.yaml",
    );
    const duplicate = await fs.readFile(duplicatePath, "utf8");
    await fs.writeFile(
      duplicatePath,
      duplicate.replace(
        "scenarios:",
        "  - id: phase-0-gate\n    readiness: 'true'\nscenarios:",
      ),
    );
    const malformedRoot = await copiedProcessPackage();
    const malformedPath = path.join(
      malformedRoot,
      "phases/phase-0-wayfinding.yaml",
    );
    const malformed = await fs.readFile(malformedPath, "utf8");
    await fs.writeFile(
      malformedPath,
      malformed.replace(
        "      exists(\"candidate-baselines-of-kind@1\", {baseline_kind: \"intent-level-candidate\"})",
        "      exists(\"missing-checkpoint-selector@1\", {})",
      ),
    );

    const duplicateResult = await loadProcessPackage(duplicateRoot);
    const malformedResult = await loadProcessPackage(malformedRoot);

    expect(duplicateResult.ok).toBe(false);
    expect(duplicateResult.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "duplicate-attention-checkpoint" }),
    ]));
    expect(malformedResult.ok).toBe(false);
    expect(malformedResult.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "expression-unknown-selector",
        path: expect.stringContaining("#attention_checkpoints[0].readiness"),
      }),
    ]));
  });

  it("rejects an unknown gate Obligation reference in a Phase", async () => {
    const processRoot = await copiedProcessPackage();
    const phasePath = path.join(processRoot, "phases/phase-0-wayfinding.yaml");
    const phase = await fs.readFile(phasePath, "utf8");
    await fs.writeFile(
      phasePath,
      phase.replace(
        "  obligation: candidate-gate-signoff@3",
        "  obligation: missing-gate-obligation@2",
      ),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unknown-reference",
          path: "phases.phase-0-wayfinding.gate.obligation",
          message: "Unknown Obligation reference 'missing-gate-obligation@2'",
        }),
      ]),
    );
  });

  it("rejects unknown declarative Phase progression references", async () => {
    const processRoot = await copiedProcessPackage();
    const phasePath = path.join(processRoot, "phases/phase-0-wayfinding.yaml");
    const phase = await fs.readFile(phasePath, "utf8");
    await fs.writeFile(
      phasePath,
      phase
        .replace(
          "  next_phase: phase-1-product-assurance",
          "  next_phase: phase-9-missing",
        )
        .replace(
          "    evidence_selector: applicable-gate-signoffs-for@1",
          "    evidence_selector: missing-progression-evidence@1",
        ),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "unknown-phase-reference",
        path: "phases.phase-0-wayfinding.progression.next_phase",
      }),
      expect.objectContaining({
        code: "unknown-reference",
        path:
          "phases.phase-0-wayfinding.progression.authorization.evidence_selector",
      }),
    ]));
  });

  it("rejects an unknown Phase reference in an Obligation", async () => {
    const processRoot = await copiedProcessPackage();
    const obligationPath = path.join(
      processRoot,
      "obligations/review-context-required.yaml",
    );
    const obligation = await fs.readFile(obligationPath, "utf8");
    await fs.writeFile(
      obligationPath,
      obligation.replace("phase-0-wayfinding", "phase-9-missing"),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unknown-reference",
          path: "obligations.review-context-required.phases[0]",
          message: "Unknown Phase reference 'phase-9-missing'",
        }),
      ]),
    );
  });

  it("rejects an obligation that references an unknown selector", async () => {
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-process-"));
    const processRoot = path.join(temporaryRoot, "process");
    await fs.cp(path.join(process.cwd(), ".lifecycle/process"), processRoot, {
      recursive: true,
    });
    const obligationPath = path.join(
      processRoot,
      "obligations/review-context-required.yaml",
    );
    const obligation = await fs.readFile(obligationPath, "utf8");
    await fs.writeFile(
      obligationPath,
      obligation.replace("review-required-revisions@1", "missing-selector@1"),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "expression-unknown-selector",
          path: expect.stringContaining(
            "review-context-required.yaml#for_each",
          ),
          line: 1,
          column: 8,
          message: "Unknown Selector 'missing-selector@1'",
        }),
      ]),
    );
  });

  it("rejects a duplicate inherited outgoing-link ID", async () => {
    const processRoot = await copiedProcessPackage();
    const templatePath = path.join(
      processRoot,
      "templates/requirement.yaml",
    );
    const template = await fs.readFile(templatePath, "utf8");
    const duplicateLink = `outgoing_links:
  - id: derived-from
    description: Generic inherited provenance.
    targets:
      - {kind: datum, types: [PSP], identity: stable}
    cardinality: {minimum: 1, maximum: 1}
    freeze_resolution: exact-revision
    inverse_label: derives
`;
    await fs.writeFile(
      templatePath,
      template.replace("outgoing_links:\n", duplicateLink),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "duplicate-inherited-link",
          path: "types.STK.outgoing_links",
          message:
            "Lifecycle type 'STK' redeclares inherited outgoing link 'derived-from'",
        }),
      ]),
    );
  });

  it("rejects changing an inherited property to an incompatible type", async () => {
    const processRoot = await copiedProcessPackage();
    const childPath = path.join(
      processRoot,
      "templates/rationale-bearing.yaml",
    );
    const child = await fs.readFile(childPath, "utf8");
    await fs.writeFile(
      childPath,
      child.replace(
        "    rationale: {type: string, minLength: 1}",
        "    rationale: {type: string, minLength: 1}\n    title: {type: number, minimum: 1}",
      ),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "incompatible-inherited-property",
          path:
            "templates.rationale-bearing.payload_schema.properties.title.type",
          message:
            "Payload Template 'rationale-bearing' changes inherited property 'title' from type string to number",
        }),
      ]),
    );
  });

  it("rejects widening an inherited payload constraint", async () => {
    const processRoot = await copiedProcessPackage();
    const parentPath = path.join(
      processRoot,
      "templates/titled-datum.yaml",
    );
    const parent = await fs.readFile(parentPath, "utf8");
    await fs.writeFile(
      parentPath,
      parent.replace("minLength: 1", "minLength: 5"),
    );
    const childPath = path.join(
      processRoot,
      "templates/rationale-bearing.yaml",
    );
    const child = await fs.readFile(childPath, "utf8");
    await fs.writeFile(
      childPath,
      child.replace(
        "    rationale: {type: string, minLength: 1}",
        "    rationale: {type: string, minLength: 1}\n    title: {type: string, minLength: 2}",
      ),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unsafe-schema-widening",
          path:
            "templates.rationale-bearing.payload_schema.properties.title.minLength",
          message:
            "Payload Template 'rationale-bearing' widens inherited constraint 'title.minLength' from 5 to 2",
        }),
      ]),
    );
  });

  it("rejects removal of a required field from an inherited property schema", async () => {
    const processRoot = await copiedProcessPackage();
    const parentPath = path.join(
      processRoot,
      "templates/titled-datum.yaml",
    );
    const parent = await fs.readFile(parentPath, "utf8");
    await fs.writeFile(
      parentPath,
      parent.replace(
        "    title: {type: string, minLength: 1}",
        "    title:\n      type: object\n      required: [text]\n      properties:\n        text: {type: string, minLength: 1}",
      ),
    );
    const childPath = path.join(
      processRoot,
      "templates/rationale-bearing.yaml",
    );
    const child = await fs.readFile(childPath, "utf8");
    await fs.writeFile(
      childPath,
      child.replace(
        "    rationale: {type: string, minLength: 1}",
        "    rationale: {type: string, minLength: 1}\n    title:\n      type: object\n      required: []\n      properties:\n        text: {type: string, minLength: 1}",
      ),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "inherited-required-field-removed",
          path:
            "templates.rationale-bearing.payload_schema.properties.title.required",
          message:
            "Payload Template 'rationale-bearing' removes inherited required fields from 'title': text",
        }),
      ]),
    );
  });

  it("rejects a type that extends an unknown template", async () => {
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-process-"));
    const processRoot = path.join(temporaryRoot, "process");
    await fs.cp(path.join(process.cwd(), ".lifecycle/process"), processRoot, {
      recursive: true,
    });
    const typePath = path.join(processRoot, "types/STK.yaml");
    const typeDefinition = await fs.readFile(typePath, "utf8");
    await fs.writeFile(
      typePath,
      typeDefinition.replace("requirement@2", "missing-template@1"),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unknown-reference",
          message: expect.stringContaining("missing-template@1"),
        }),
      ]),
    );
  });

  it("rejects a Selector dependency cycle with its complete path", async () => {
    const processRoot = await copiedProcessPackage();
    const acceptedPath = path.join(
      processRoot,
      "selectors/newer-accepted-revisions-for.yaml",
    );
    const accepted = await fs.readFile(acceptedPath, "utf8");
    await fs.writeFile(
      acceptedPath,
      accepted.replace(
        "selector: newer-revisions-for@1",
        "selector: newer-editable-revisions-for@1",
      ),
    );
    const editablePath = path.join(
      processRoot,
      "selectors/newer-editable-revisions-for.yaml",
    );
    const editable = await fs.readFile(editablePath, "utf8");
    await fs.writeFile(
      editablePath,
      editable.replace(
        "selector: newer-revisions-for@1",
        "selector: newer-accepted-revisions-for@1",
      ),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "expression-dependency-cycle",
          path: "selector:newer-accepted-revisions-for",
          message:
            "Expression dependency cycle: Selector 'newer-accepted-revisions-for@1' -> Selector 'newer-editable-revisions-for@1' -> Selector 'newer-accepted-revisions-for@1'",
        }),
      ]),
    );
  });

  it("rejects a template inheritance cycle before any type is resolved", async () => {
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-process-"));
    const processRoot = path.join(temporaryRoot, "process");
    await fs.cp(path.join(process.cwd(), ".lifecycle/process"), processRoot, {
      recursive: true,
    });
    const templatePath = path.join(processRoot, "templates/titled-datum.yaml");
    const templateDefinition = await fs.readFile(templatePath, "utf8");
    await fs.writeFile(
      templatePath,
      templateDefinition.replace(
        "description: Payload fields",
        "extends: requirement@2\ndescription: Payload fields",
      ),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "reference-cycle",
          path: "templates.rationale-bearing.extends",
          message:
            "The template inheritance graph contains a cycle: rationale-bearing -> titled-datum -> requirement -> rationale-bearing",
        }),
      ]),
    );
  });
});
