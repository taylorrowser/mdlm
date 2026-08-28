import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { beforeAll, describe, expect, it } from "vitest";
import { validateDefinitionGraph } from "../src/definition-graph.js";
import { loadProcessPackage, type ProcessPackage } from "../src/index.js";
import { processPackageDigest } from "../src/process-package-digest.js";
import { validateScenarioContracts } from "../src/scenario-contract.js";
import {
  canonicalProcessPackage,
  verifyCanonicalProcessPackageFixture,
} from "./helpers/canonical-process-package-fixture.js";

const CONTENDED_SETUP_HOOK_TIMEOUT_MS = 20_000;
const CANONICAL_PROCESS_ROOT = ".lifecycle/process";

async function copiedProcessPackage(): Promise<string> {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-process-"));
  const processRoot = path.join(temporaryRoot, "process");
  await fs.cp(path.join(process.cwd(), ".lifecycle/process"), processRoot, {
    recursive: true,
  });
  return processRoot;
}

describe("canonical immutable ProcessPackage fixture", () => {
  let livePackage: ProcessPackage;

  beforeAll(async () => {
    const loaded = await loadProcessPackage(CANONICAL_PROCESS_ROOT);
    expect(loaded.ok, loaded.diagnostics.map((item) => item.message).join("\n"))
      .toBe(true);
    if (!loaded.ok) throw new Error("Canonical process package did not load");
    livePackage = loaded.package;
  }, CONTENDED_SETUP_HOOK_TIMEOUT_MS);

  it("is exact, recursively frozen, and isolated from mutable clones", async () => {
    const fixturePackage = await canonicalProcessPackage();
    await expect(verifyCanonicalProcessPackageFixture(livePackage)).resolves.toEqual({
      processPackage: "mdlm-bootstrap@0.77.0",
      verified: true,
    });
    expect(fixturePackage).toStrictEqual(livePackage);

    const assertFrozen = (value: unknown): void => {
      if (typeof value !== "object" || value === null) return;
      expect(Object.isFrozen(value)).toBe(true);
      for (const nested of Object.values(value)) assertFrozen(nested);
    };
    assertFrozen(fixturePackage);

    const mutable = structuredClone(fixturePackage);
    mutable.manifest.version = "mutated-test-clone";
    expect(fixturePackage.manifest.version).toBe("0.77.0");
  });

  it("rejects artifact hash and package-digest drift", async () => {
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-canonical-fixture-"));
    try {
      const fixtureRoot = path.join(temporaryRoot, "fixture");
      await fs.cp(
        path.join(process.cwd(), "test/fixtures/canonical-process-package"),
        fixtureRoot,
        { recursive: true },
      );
      const manifestPath = path.join(fixtureRoot, "manifest.json");
      const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as {
        artifact: { archive: string };
        processPackage: { digest: string };
      };
      const archivePath = path.join(fixtureRoot, manifest.artifact.archive);
      await fs.appendFile(archivePath, "drift");
      await expect(canonicalProcessPackage({ fixtureRoot })).rejects.toThrow(
        "Compressed digest mismatch",
      );

      await fs.rm(fixtureRoot, { recursive: true, force: true });
      await fs.cp(
        path.join(process.cwd(), "test/fixtures/canonical-process-package"),
        fixtureRoot,
        { recursive: true },
      );
      const driftedManifest = JSON.parse(
        await fs.readFile(path.join(fixtureRoot, "manifest.json"), "utf8"),
      ) as { processPackage: { digest: string } };
      driftedManifest.processPackage.digest = `sha256:${"0".repeat(64)}`;
      await fs.writeFile(
        path.join(fixtureRoot, "manifest.json"),
        `${JSON.stringify(driftedManifest, null, 2)}\n`,
      );
      await expect(
        verifyCanonicalProcessPackageFixture(livePackage, { fixtureRoot }),
      ).rejects.toThrow("Source Process Package digest mismatch");
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("rejects archive bytes produced by a compressor other than the declared one", async () => {
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-canonical-fixture-"));
    try {
      const fixtureRoot = path.join(temporaryRoot, "fixture");
      await fs.cp(
        path.join(process.cwd(), "test/fixtures/canonical-process-package"),
        fixtureRoot,
        { recursive: true },
      );
      const manifestPath = path.join(fixtureRoot, "manifest.json");
      const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as {
        artifact: { archive: string; compressedSha256: string };
      };
      const archivePath = path.join(fixtureRoot, manifest.artifact.archive);
      const content = gunzipSync(await fs.readFile(archivePath));
      const differentlyCompressed = gzipSync(content, { level: 9 });
      await fs.writeFile(archivePath, differentlyCompressed);
      manifest.artifact.compressedSha256 = createHash("sha256")
        .update(differentlyCompressed)
        .digest("hex");
      await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

      await expect(
        verifyCanonicalProcessPackageFixture(livePackage, { fixtureRoot }),
      ).rejects.toThrow("Declared compression does not reproduce");
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("rejects a source commit whose Process Package differs from the capture", async () => {
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-canonical-fixture-"));
    try {
      const fixtureRoot = path.join(temporaryRoot, "fixture");
      await fs.cp(
        path.join(process.cwd(), "test/fixtures/canonical-process-package"),
        fixtureRoot,
        { recursive: true },
      );
      const manifestPath = path.join(fixtureRoot, "manifest.json");
      const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as {
        provenance: { sourceCommit: string; sourceTree: string };
      };
      manifest.provenance.sourceCommit = "c52676398bfd9d6c34a9082548c9df4a184ce57f";
      manifest.provenance.sourceTree = "3e1a56bae092479e163ca9cdba4b9cbf4eb5648b";
      await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

      await expect(
        verifyCanonicalProcessPackageFixture(livePackage, { fixtureRoot }),
      ).rejects.toThrow("Provenance Process Package digest mismatch");
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("rejects a declared source tree that does not belong to the source commit", async () => {
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-canonical-fixture-"));
    try {
      const fixtureRoot = path.join(temporaryRoot, "fixture");
      await fs.cp(
        path.join(process.cwd(), "test/fixtures/canonical-process-package"),
        fixtureRoot,
        { recursive: true },
      );
      const manifestPath = path.join(fixtureRoot, "manifest.json");
      const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as {
        provenance: { sourceTree: string };
      };
      manifest.provenance.sourceTree = "0".repeat(40);
      await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

      await expect(
        verifyCanonicalProcessPackageFixture(livePackage, { fixtureRoot }),
      ).rejects.toThrow("Source commit tree mismatch");
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});

describe("loadProcessPackage", () => {
  let validPackage: ProcessPackage;

  beforeAll(async () => {
    const result = await loadProcessPackage(
      path.join(process.cwd(), ".lifecycle/process"),
    );
    expect(result.ok, result.diagnostics.map((item) => item.message).join("\n"))
      .toBe(true);
    if (!result.ok) throw new Error("Bootstrap process package did not load");
    validPackage = result.package;
  }, CONTENDED_SETUP_HOOK_TIMEOUT_MS);

  function clonedValidPackage(): ProcessPackage {
    return structuredClone(validPackage);
  }

  function graphResult(processPackage: ProcessPackage) {
    const diagnostics = validateDefinitionGraph(
      processPackage.manifest,
      processPackage,
    );
    return { ok: diagnostics.length === 0, diagnostics };
  }

  function scenarioContractResult(processPackage: ProcessPackage) {
    const diagnostics = validateScenarioContracts(processPackage);
    return { ok: diagnostics.length === 0, diagnostics };
  }

  function record(value: unknown): Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error("Expected definition field to be a record");
    }
    return value as Record<string, unknown>;
  }

  function records(value: unknown): Record<string, unknown>[] {
    if (!Array.isArray(value)) {
      throw new Error("Expected definition field to be an array");
    }
    return value.map(record);
  }

  it("recalculates a package digest after nested package bytes change", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-package-digest-"));
    try {
      const nested = path.join(root, "definitions");
      await fs.mkdir(nested);
      const definition = path.join(nested, "example.yaml");
      await fs.writeFile(definition, "value: one\n");
      const initial = await processPackageDigest(root);

      await fs.writeFile(definition, "value: two\n");

      expect(await processPackageDigest(root)).not.toBe(initial);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("isolates parsed documents and refreshes validators after schema bytes change", async () => {
    const processRoot = await copiedProcessPackage();
    try {
      const first = await loadProcessPackage(processRoot);
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      first.package.manifest.version = "poisoned-by-caller";

      const second = await loadProcessPackage(processRoot);
      expect(second.ok).toBe(true);
      if (!second.ok) return;
      expect(second.package.manifest.version).toBe("0.77.0");

      const manifestSchemaPath = path.join(
        processRoot,
        "meta",
        "manifest.schema.json",
      );
      const manifestSchema = JSON.parse(
        await fs.readFile(manifestSchemaPath, "utf8"),
      ) as Record<string, unknown>;
      await fs.writeFile(
        manifestSchemaPath,
        `${JSON.stringify({ ...manifestSchema, not: {} }, null, 2)}\n`,
      );

      const changedSchema = await loadProcessPackage(processRoot);
      expect(changedSchema.ok).toBe(false);
      expect(changedSchema.diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: "meta-schema",
          path: expect.stringMatching(/manifest\.yaml$/),
        }),
      ]));
    } finally {
      await fs.rm(path.dirname(processRoot), { recursive: true, force: true });
    }
  });

  it("loads and validates the bootstrap process package", async () => {
    const result = {
      ok: true as const,
      package: validPackage,
      diagnostics: [] as const,
    };

    expect(result.package.manifest.version).toBe("0.77.0");
    expect(Object.keys(result.package.types)).toHaveLength(21);
    expect(Object.keys(result.package.templates)).toHaveLength(3);
    expect(Object.keys(result.package.selectors)).toHaveLength(395);
    expect(result.package.selectors).toEqual(
      expect.objectContaining({
        "accepted-baseline-promotes-candidate": expect.any(Object),
        "applicable-initial-product-intent-decisions": expect.any(Object),
        "initial-product-intent-sources-for-decision": expect.any(Object),
        "initial-product-intent-targets-for-decision": expect.any(Object),
        "structural-initial-product-intent-sources-for-decision": expect.any(Object),
        "structural-initial-product-intent-targets-for-decision": expect.any(Object),
        "initial-product-intent-boundaries-for-decision": expect.any(Object),
        "product-intent-authorities-for-foundation-subject": expect.any(Object),
        "incorporated-product-answer-decisions-for-foundation-subject":
          expect.any(Object),
        "product-answer-review-support-for-foundation-subject":
          expect.any(Object),
        "candidate-product-answer-review-support": expect.any(Object),
        "structural-passing-product-answer-reviews-for-decision":
          expect.any(Object),
        "applicable-product-answer-reviews-for-decision": expect.any(Object),
        "unincorporated-product-questions-for-foundation-subject":
          expect.any(Object),
        "applicable-product-answer-decisions-for-foundation-subject":
          expect.any(Object),
        "pending-foundation-subjects-for-product-answer": expect.any(Object),
        "answer-stale-foundation-members-for-candidate": expect.any(Object),
        "open-phase-0-gate-product-questions": expect.any(Object),
        "question-blocked-targets-for-decision": expect.any(Object),
        "current-initial-product-intent-questions": expect.any(Object),
        "product-intent-questions-from-initial-map": expect.any(Object),
        "current-open-question-sources-ready-for-resolution": expect.any(Object),
        "general-open-questions-ready-for-resolution": expect.any(Object),
        "blocking-product-simplification-reviews-for": expect.any(Object),
        "candidate-correction-decisions-for": expect.any(Object),
        "candidate-correction-candidates-for-decision": expect.any(Object),
        "candidate-correction-authority-decisions-for-review": expect.any(Object),
        "candidate-correction-decision-review-support-for": expect.any(Object),
        "failed-candidate-correction-decisions": expect.any(Object),
        "valid-candidate-correction-decision-replacements-for": expect.any(Object),
        "candidate-definition-members": expect.any(Object),
        "candidate-members-linking-question": expect.any(Object),
        "current-question-dependencies-for-candidate": expect.any(Object),
        "unresolved-question-dependencies-for-candidate": expect.any(Object),
        "failed-intent-candidates-depending-on-question": expect.any(Object),
        "applicable-question-decisions-for-candidate": expect.any(Object),
        "revision-links-question": expect.any(Object),
        "phase-0-candidate-review-context-members": expect.any(Object),
        "phase-0-candidate-correction-support-for": expect.any(Object),
        "candidate-question-resolution-support-for": expect.any(Object),
        "foundation-correction-causes-for-decision": expect.any(Object),
        "failed-foundation-correction-decisions": expect.any(Object),
        "valid-foundation-correction-decision-replacements-for": expect.any(Object),
        "phase-0-foundation-member-reviews": expect.any(Object),
        "review-context-members-for": expect.any(Object),
        "review-assignment-context-members-for": expect.any(Object),
        "current-exact-review-contexts-cited-by": expect.any(Object),
        "interaction-free-architectures-for-requirement": expect.any(Object),
        "interacting-architectures-for-requirement": expect.any(Object),
        "review-context-evidence": expect.any(Object),
        "review-context-contains-required-support": expect.any(Object),
        "composed-baselines-for-review-context": expect.any(Object),
        "environment-review-evidence-for": expect.any(Object),
        "unexpected-environment-review-context-evidence": expect.any(Object),
        "phase-2-definition-members-for-plan": expect.any(Object),
        "phase-2-definition-review-context-support-for-plan": expect.any(Object),
        "architecture-definition-set-representative-plans": expect.any(Object),
        "decomposition-plans-sharing-architecture-with": expect.any(Object),
        "stakeholder-requirements-for-review-context": expect.any(Object),
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
        "intent-gate-candidates-for-decision": expect.any(Object),
        "gate-decision-review-support-for": expect.any(Object),
        "structural-review-contexts-cited-by": expect.any(Object),
        "structural-passing-candidate-reviews-for-review": expect.any(Object),
        "gate-candidate-reviews-for-decision": expect.any(Object),
        "gate-candidate-authority-support-for-decision": expect.any(Object),
        "phase-1-assurance-correction-decisions-for": expect.any(Object),
        "failed-current-environment-qualifications": expect.any(Object),
        "failed-qualification-results-for-run-and-environment": expect.any(Object),
        "failed-qualification-results-for-environment": expect.any(Object),
        "qualification-results-corrected-by-environment": expect.any(Object),
        "matching-corrected-qualification-result": expect.any(Object),
        "unexpected-corrected-qualification-results": expect.any(Object),
        "corrected-environment-qualification-revisions-for": expect.any(Object),
        "environment-qualification-correction-history-for": expect.any(Object),
      }),
    );
    expect(Object.keys(result.package.policies)).toHaveLength(15);
    expect(Object.keys(result.package.obligations)).toHaveLength(63);
    expect(Object.keys(result.package.scenarios)).toHaveLength(66);
    expect(result.package.policies).toHaveProperty(
      "environment-qualification-correction-participation",
    );
    expect(result.package.obligations).toHaveProperty(
      "environment-qualification-correction-required",
    );
    expect(result.package.scenarios).toHaveProperty(
      "revise-environment-after-failed-qualification",
    );
    expect(
      result.package.scenarios["establish-initial-wayfinding-map"]?.outputs,
    ).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "map",
        required_links: expect.arrayContaining([
          expect.objectContaining({
            link: "indexes",
            target: { output: "product_intent" },
          }),
          expect.objectContaining({
            link: "indexes",
            target: { output: "questions" },
          }),
        ]),
      }),
    ]));
    expect(result.package.scenarios["define-system-architecture"]?.outputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "architecture",
          cardinality: "one-or-more",
          required_links: [expect.objectContaining({ distribution: "partition" })],
        }),
      ]),
    );
    expect(
      result.package.scenarios["define-decomposition-work-package"]?.outputs,
    ).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "plan",
        cardinality: "one-or-more",
        required_payload: { stage: "planning" },
        required_links: expect.arrayContaining([
          expect.objectContaining({ link: "decomposes", distribution: "cover" }),
        ]),
      }),
    ]));
    expect(
      result.package.scenarios["create-review-context"]?.kernel_materialization,
    ).toEqual({
      kind: "exact-baseline@1",
      output: "context",
      subject_input: "subject",
      support_input: "context_members",
      payload_fields: {
        title: "title",
        kind: "kind",
        role: "role",
        scope: "scope",
        group: "group",
        members: "definition_members",
        evidence: "evidence",
      },
      title_prefix: "Review context for ",
      baseline_kind: "review-context",
      baseline_role: "review-context",
      baseline_group: "DEFAULT",
      evidence_subject_types: ["ENV"],
      evidence_types: ["RES", "RUN", "VAI", "VER"],
    });
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
          scenario: "revise-pilot-verification-activity-after-review@3",
        }),
      }));
    expect(result.package.obligations["pilot-target-required"])
      .toEqual(expect.objectContaining({
        resolve_with: expect.objectContaining({
          scenario: "build-pilot-control-prototype@1",
        }),
      }));
    expect(result.package.scenarios["review-datum-in-context"])
      .toEqual(expect.objectContaining({
        prompt_ref: "prompts/review-datum-in-context.md@6",
        review_policy_arguments: {
          subject: expect.objectContaining({
            kind: "mdlm-expression",
            source: "subject",
          }),
        },
        completion: expect.objectContaining({
          source: expect.stringContaining(
            'review.payload.correction_authority in ["stakeholder", "package-evidence"]',
          ),
        }),
      }));
    expect(result.package.scenarios["register-pilot-target"]?.participation)
      .toBeUndefined();
    expect(result.package.scenarios["register-pilot-target"]?.initiation)
      .toBe("explicit");
    expect(result.package.scenarios["build-pilot-control-prototype"])
      .toEqual(expect.objectContaining({
        version: 1,
        prompt_ref: "prompts/build-pilot-control-prototype.md@1",
        resolves: ["pilot-target-required"],
      }));
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

  it("rejects review Policy argument mappings that do not cover the Policy", () => {
    const processPackage = clonedValidPackage();
    const scenario = processPackage.scenarios["review-datum-in-context"]!;
    const argumentsByName = record(scenario.review_policy_arguments);
    argumentsByName.other = argumentsByName.subject;
    delete argumentsByName.subject;

    const result = graphResult(processPackage);

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

  it("rejects Review Policies with duplicate parameter names", () => {
    const processPackage = clonedValidPackage();
    const policy = processPackage.policies["review-applicability"]!;
    const parameters = records(policy.parameters);
    policy.parameters = [...parameters, { ...parameters[0] }];

    const result = graphResult(processPackage);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "policy-parameters",
      path: "policies.review-applicability.parameters",
    }));
  });

  it("validates Review Context membership contracts for DEC and CHG callers", () => {
    const result = {
      ok: true as const,
      package: validPackage,
      diagnostics: [] as const,
    };

    expect(result.package.selectors["review-context-contains-member"]?.parameters)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          name: "required_member",
          types: expect.arrayContaining(["DEC", "CHG"]),
        }),
      ]));
    expect(result.diagnostics).toEqual([]);
  });

  it("compiles package-authored terminal outcome conditions", () => {
    const result = {
      ok: true as const,
      package: validPackage,
      diagnostics: [] as const,
    };
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

  it("rejects malformed and unresolved terminal outcome declarations", async () => {
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
    const [malformedResult, unresolvedResult] = await Promise.all([
      loadProcessPackage(malformedRoot),
      loadProcessPackage(unresolvedRoot),
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
  });

  it("rejects ambiguous terminal outcome declarations", () => {
    const processPackage = clonedValidPackage();
    const outcomes = record(
      processPackage.profiles.bootstrap!.terminal_outcomes,
    );
    const boundary = record(outcomes.profile_boundary);
    const complete = record(outcomes.lifecycle_complete);
    complete.condition = structuredClone(boundary.condition);

    const result = graphResult(processPackage);

    expect(result).toEqual({
      ok: false,
      diagnostics: [expect.objectContaining({
        code: "ambiguous-terminal-outcomes",
        path: "profiles.bootstrap.terminal_outcomes",
      })],
    });
  });

  it("rejects ambiguous explicit-initiation and Resolver semantics", () => {
    const processPackage = clonedValidPackage();
    processPackage.scenarios["chart-wayfinding-map"]!.resolves = [
      "open-question-resolution",
    ];

    const result = scenarioContractResult(processPackage);

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
    const processRoot = await copiedProcessPackage();
    try {
      const statePath = path.join(
        processRoot,
        "states/relationship-overlays.yaml",
      );
      const state = await fs.readFile(statePath, "utf8");
      const legacyRules = Object.entries(legacyForms).map(
        ([family, source], index) => `  - value: process-drift
    priority: ${90 - index}
    when:
      ${source}
    explanation: Reject the legacy ${family} expression family.`,
      ).join("\n");
      await fs.writeFile(statePath, `${state.trimEnd()}\n${legacyRules}\n`);

      const result = await loadProcessPackage(processRoot);

      expect(result.ok).toBe(false);
      const expectedRuleIndexes = Object.keys(legacyForms).map(
        (_, index) => index + 3,
      );
      expect(result.diagnostics.filter((item) =>
        item.code === "legacy-expression-authoring"
      )).toEqual(expectedRuleIndexes.map((index) => expect.objectContaining({
        path: expect.stringContaining(
          `relationship-overlays.yaml#rules[${index}].when`,
        ),
        message:
          "Expression-bearing fields require mdlm-expression@1 textual source; legacy YAML expression trees are not accepted",
      })));
      expect(result.diagnostics.filter((item) =>
        item.code === "meta-schema" &&
        item.path?.includes("relationship-overlays.yaml/rules/")
      )).toEqual(expectedRuleIndexes.map((index) => expect.objectContaining({
        path: expect.stringContaining(
          `relationship-overlays.yaml/rules/${index}/when`,
        ),
        message: "must be string",
      })));
    } finally {
      await fs.rm(path.dirname(processRoot), { recursive: true, force: true });
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
        "for_each: 'select(\"gate-authorization-candidates@1\", {})'",
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

  it("rejects disagreement between the manifest and loaded definition catalogs", () => {
    const processPackage = clonedValidPackage();
    const catalog = record(processPackage.manifest.catalog);
    catalog.policies = (catalog.policies as unknown[]).filter(
      (policy) => policy !== "review-applicability",
    );

    const result = graphResult(processPackage);

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

  it("rejects mismatched Policy and unknown Resolver references in one package", () => {
    const processPackage = clonedValidPackage();
    processPackage.scenarios["compile-psp"]!.review_policy_ref =
      "review-applicability@2";
    record(
      processPackage.obligations["review-context-required"]!.resolve_with,
    ).scenario = "missing-scenario@1";
    processPackage.scenarios["create-review-context"]!.resolves = [
      "missing-obligation",
    ];

    const result = graphResult(processPackage);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "version-mismatch",
          path: "scenarios.compile-psp.review_policy_ref",
          message:
            "Reference 'review-applicability@2' resolves to review-applicability@1",
        }),
        expect.objectContaining({
          code: "unknown-reference",
          path: "obligations.review-context-required.resolve_with.scenario",
          message: "Unknown Scenario reference 'missing-scenario@1'",
        }),
        expect.objectContaining({
          code: "unknown-reference",
          path: "scenarios.create-review-context.resolves[0]",
          message: "Unknown Obligation reference 'missing-obligation'",
        }),
      ]),
    );
  });

  it("rejects an unknown Policy reference in a Scenario", () => {
    const processPackage = clonedValidPackage();
    processPackage.scenarios["compile-psp"]!.review_policy_ref =
      "missing-policy@1";

    const result = graphResult(processPackage);

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

  it("rejects malformed Resolver inputs and Scenario contracts in one package", () => {
    const processPackage = clonedValidPackage();
    const resolver = record(
      processPackage.obligations["review-context-required"]!.resolve_with,
    );
    const resolverInputs = record(resolver.inputs);
    resolver.inputs = { surprise: resolverInputs.subject };
    const reviewInputs = records(
      processPackage.scenarios["review-datum-in-context"]!.inputs,
    );
    reviewInputs.find((input) => input.name === "subject")!.types = ["QST"];
    records(
      processPackage.scenarios["compile-psp"]!.outputs,
    )[0]!.types = ["XYZ"];

    const result = scenarioContractResult(processPackage);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "resolver-input-missing",
          path: "obligations.review-context-required.resolve_with.inputs.subject",
          message:
            "Obligation 'review-context-required' does not bind required input 'subject' for Resolver Scenario 'create-review-context@1'",
        }),
        expect.objectContaining({
          code: "resolver-input-undeclared",
          path: "obligations.review-context-required.resolve_with.inputs.surprise",
          message:
            "Obligation 'review-context-required' binds undeclared input 'surprise' for Resolver Scenario 'create-review-context@1'",
        }),
        expect.objectContaining({
          code: "impossible-required-link-target",
          path:
            "scenarios.review-datum-in-context.outputs[0].required_links[0].target.input",
          message:
            "Scenario 'review-datum-in-context' requires link 'reviews' from output type REV to input 'subject' of unsupported type QST",
        }),
        expect.objectContaining({
          code: "unknown-scenario-output-type",
          path: "scenarios.compile-psp.outputs[0].types[0]",
          message:
            "Scenario 'compile-psp' output 'product_specification' references undeclared lifecycle type 'XYZ'",
        }),
      ]),
    );
  });

  it("rejects incompatible Scenario contracts in one malformed package", () => {
    const processPackage = clonedValidPackage();
    const resolverScenario = processPackage.scenarios["create-review-context"]!;
    const resolverSubject = records(resolverScenario.inputs)
      .find((input) => input.name === "subject")!;
    resolverSubject.types = ["QST"];
    resolverSubject.identity = "stable";
    resolverSubject.cardinality = "one-or-more";
    resolverScenario.prohibited_inputs = ["subject"];
    const reviewInputs = records(
      processPackage.scenarios["review-datum-in-context"]!.inputs,
    );
    reviewInputs.find((input) => input.name === "review_context")!.cardinality =
      "zero-or-one";
    reviewInputs.find((input) => input.name === "subject")!.identity = "stable";

    const result = scenarioContractResult(processPackage);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "resolver-input-type",
          path: "obligations.review-context-required.resolve_with.inputs.subject",
          message:
            "Resolver input 'subject' for Scenario 'create-review-context@1' requires type QST, but the binding can provide ASP, BSL, CHG, DEC, DWP, ENV, ICSP, MAP, PAS, PRB, PSP, STK, SYS, VAI, VER, VSP",
        }),
        expect.objectContaining({
          code: "resolver-input-kind",
          path: "obligations.review-context-required.resolve_with.inputs.subject",
          message:
            "Resolver input 'subject' for Scenario 'create-review-context@1' requires stable identity, but the binding provides revision",
        }),
        expect.objectContaining({
          code: "resolver-input-cardinality",
          path: "obligations.review-context-required.resolve_with.inputs.subject",
          message:
            "Resolver input 'subject' for Scenario 'create-review-context@1' requires one-or-more values, but the binding provides one",
        }),
        expect.objectContaining({
          code: "impossible-required-link-cardinality",
          path:
            "scenarios.review-datum-in-context.outputs[0].required_links[1].target.input",
          message:
            "Scenario 'review-datum-in-context' requires link 'contextualizes' with at least one target, but input 'review_context' may provide zero",
        }),
        expect.objectContaining({
          code: "impossible-required-link-identity",
          path:
            "scenarios.review-datum-in-context.outputs[0].required_links[0].target.input",
          message:
            "Scenario 'review-datum-in-context' requires link 'reviews' from output type REV to revision identity, but input 'subject' provides stable",
        }),
        expect.objectContaining({
          code: "prohibited-scenario-input",
          path: "scenarios.create-review-context.prohibited_inputs[0]",
          message:
            "Scenario 'create-review-context' declares input 'subject' as prohibited",
        }),
      ]),
    );
  });

  it("rejects a required link unavailable on the declared output type", () => {
    const processPackage = clonedValidPackage();
    records(
      processPackage.scenarios["review-datum-in-context"]!.outputs,
    )[0]!.types = ["DEC"];

    const result = scenarioContractResult(processPackage);

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

  it("rejects a required output link to an undeclared Scenario value", () => {
    const processPackage = clonedValidPackage();
    const reviewOutput = records(
      processPackage.scenarios["review-datum-in-context"]!.outputs,
    )[0]!;
    const reviewsLink = records(reviewOutput.required_links)[0]!;
    record(reviewsLink.target).input = "missing";

    const result = scenarioContractResult(processPackage);

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

  it("rejects an enabled Obligation whose Resolver Scenario is disabled", () => {
    const processPackage = clonedValidPackage();
    const phase = processPackage.phases["phase-0-wayfinding"]!;
    phase.scenarios = (phase.scenarios as unknown[]).filter(
      (scenario) => scenario !== "create-review-context@1",
    );

    const result = scenarioContractResult(processPackage);

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

  it("rejects an unknown readiness Selector in a Phase checkpoint", async () => {
    const processRoot = await copiedProcessPackage();
    const phasePath = path.join(processRoot, "phases/phase-0-wayfinding.yaml");
    const phase = await fs.readFile(phasePath, "utf8");
    await fs.writeFile(
      phasePath,
      phase.replace(
        '      exists("candidate-baselines-of-kind@1", {baseline_kind: "intent-level-candidate"})',
        '      exists("missing-checkpoint-selector@1", {})',
      ),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "expression-unknown-selector",
          path: expect.stringContaining("#attention_checkpoints[0].readiness"),
        }),
      ]),
    );
  });

  it("rejects malformed Phase and Obligation graph references", () => {
    const processPackage = clonedValidPackage();
    const phase = processPackage.phases["phase-0-wayfinding"]!;
    const obligations = [...(phase.obligations as unknown[])];
    obligations[8] = "missing-obligation@2";
    phase.obligations = obligations;
    const checkpoints = records(phase.attention_checkpoints);
    phase.attention_checkpoints = [
      ...checkpoints,
      { ...checkpoints[0], readiness: { source: "true" } },
    ];
    record(phase.gate).obligation = "missing-gate-obligation@2";
    const progression = record(phase.progression);
    progression.next_phase = "phase-9-missing";
    record(progression.authorization).evidence_selector =
      "missing-progression-evidence@1";

    const statusRules = records(
      processPackage.obligations["passing-review-required"]!.status_rules,
    );
    records(statusRules[1]!.blocked_by)[0]!.obligation =
      "missing-obligation@2";
    processPackage.obligations["review-context-required"]!.phases = [
      "phase-9-missing",
    ];

    const result = graphResult(processPackage);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unknown-reference",
          path: "phases.phase-0-wayfinding.obligations[8]",
          message: "Unknown Obligation reference 'missing-obligation@2'",
        }),
        expect.objectContaining({
          code: "unknown-reference",
          path:
            "obligations.passing-review-required.status_rules[1].blocked_by[0].obligation",
          message: "Unknown Obligation reference 'missing-obligation@2'",
        }),
        expect.objectContaining({ code: "duplicate-attention-checkpoint" }),
        expect.objectContaining({
          code: "unknown-reference",
          path: "phases.phase-0-wayfinding.gate.obligation",
          message: "Unknown Obligation reference 'missing-gate-obligation@2'",
        }),
        expect.objectContaining({
          code: "unknown-phase-reference",
          path: "phases.phase-0-wayfinding.progression.next_phase",
        }),
        expect.objectContaining({
          code: "unknown-reference",
          path:
            "phases.phase-0-wayfinding.progression.authorization.evidence_selector",
        }),
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

  it("rejects malformed inheritance and Selector dependencies in one package", async () => {
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
          code: "duplicate-inherited-link",
          path: "types.STK.outgoing_links",
          message:
            "Lifecycle type 'STK' redeclares inherited outgoing link 'derived-from'",
        }),
        expect.objectContaining({
          code: "incompatible-inherited-property",
          path:
            "templates.rationale-bearing.payload_schema.properties.title.type",
          message:
            "Payload Template 'rationale-bearing' changes inherited property 'title' from type string to number",
        }),
        expect.objectContaining({
          code: "expression-dependency-cycle",
          path: "selector:newer-accepted-revisions-for",
          message:
            "Expression dependency cycle: Selector 'newer-accepted-revisions-for@1' -> Selector 'newer-editable-revisions-for@1' -> Selector 'newer-accepted-revisions-for@1'",
        }),
      ]),
    );
  });

  it("rejects inherited payload widening and unknown template extension", async () => {
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
          code: "unsafe-schema-widening",
          path:
            "templates.rationale-bearing.payload_schema.properties.title.minLength",
          message:
            "Payload Template 'rationale-bearing' widens inherited constraint 'title.minLength' from 5 to 2",
        }),
        expect.objectContaining({
          code: "unknown-reference",
          message: expect.stringContaining("missing-template@1"),
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

  it("rejects malformed prompt and skill declarations in one package", async () => {
    const processRoot = await copiedProcessPackage();
    const declarationPromptPath = path.join(
      processRoot,
      "prompts/escalate-foundation-review-correction.md",
    );
    await fs.writeFile(
      declarationPromptPath,
      (await fs.readFile(declarationPromptPath, "utf8")).replace(
        "skills/requirement-writing.md@1",
        "skills/not-declared.md@1",
      ),
    );
    const promptPath = path.join(
      processRoot,
      "prompts/chart-wayfinding-map.md",
    );
    const outsidePath = path.join(path.dirname(processRoot), "outside-prompt.md");
    await fs.writeFile(
      outsidePath,
      await fs.readFile(promptPath, "utf8"),
    );
    await fs.rm(promptPath);
    await fs.symlink(outsidePath, promptPath);
    const skillPath = path.join(processRoot, "skills/lifecycle-data.md");
    await fs.writeFile(
      skillPath,
      (await fs.readFile(skillPath, "utf8")).replace("version: 1", "version: 2"),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "prompt-skill-not-declared",
      path: declarationPromptPath,
      message: expect.stringContaining("skills/not-declared.md@1"),
    }));
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "prompt-outside-package",
      path: promptPath,
    }));
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "skill-version-mismatch",
      path: skillPath,
    }));
  });

  it("rejects undeclared legacy body skill references during package loading", async () => {
    const processRoot = await copiedProcessPackage();
    const promptPath = path.join(processRoot, "prompts/chart-wayfinding-map.md");
    await fs.appendFile(promptPath, "\nLoad `skills/not-declared.md@1`.\n");

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "prompt-skill-not-declared",
      path: promptPath,
      message: expect.stringContaining("skills/not-declared.md@1"),
    }));
  });

  it("rejects duplicate legacy body skill references during package loading", async () => {
    const processRoot = await copiedProcessPackage();
    const promptPath = path.join(processRoot, "prompts/chart-wayfinding-map.md");
    await fs.appendFile(promptPath, "\nLoad `skills/lifecycle-data.md@1` again.\n");

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "prompt-skills-invalid",
      path: promptPath,
    }));
  });

  it("rejects malformed legacy body skill references during package loading", async () => {
    const processRoot = await copiedProcessPackage();
    const promptPath = path.join(processRoot, "prompts/chart-wayfinding-map.md");
    await fs.appendFile(promptPath, "\nLoad malformed `skills/lifecycle-data.md@0`.\n");

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "prompt-skills-invalid",
      path: promptPath,
    }));
  });

  it("loads immutable historical authoring packages without retroactive prompt-skill conformance", async () => {
    const processRoot = await copiedProcessPackage();
    const promptPath = path.join(
      processRoot,
      "prompts/revise-stakeholder-change-after-review.md",
    );
    await fs.writeFile(
      promptPath,
      (await fs.readFile(promptPath, "utf8")).replace(
        "skills/contextual-artifact-review.md@2",
        "skills/review-model.md@1",
      ),
    );
    const strict = await loadProcessPackage(processRoot);
    expect(strict.ok).toBe(false);
    expect(strict.diagnostics).toContainEqual(expect.objectContaining({
      code: "prompt-skill-not-declared",
    }));

    const historical = await loadProcessPackage(processRoot, {
      compatibility: "historical-authoring",
    });
    expect(historical.ok, JSON.stringify(historical.diagnostics)).toBe(true);
  });

  it("rejects Scenario prompts outside the manifest catalog", async () => {
    const processRoot = await copiedProcessPackage();
    const manifestPath = path.join(processRoot, "manifest.yaml");
    await fs.writeFile(
      manifestPath,
      (await fs.readFile(manifestPath, "utf8")).replace(
        "    - prompts/chart-wayfinding-map.md@1\n",
        "",
      ),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "scenario-prompt-not-declared",
      path: "scenarios.chart-wayfinding-map.prompt_ref",
    }));

    const historical = await loadProcessPackage(processRoot, {
      compatibility: "historical-authoring",
    });
    expect(historical.ok, JSON.stringify(historical.diagnostics)).toBe(true);
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
