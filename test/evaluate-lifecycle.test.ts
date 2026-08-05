import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  evaluateLifecycle,
  loadProcessPackage,
  type LifecycleRecord,
  type ProcessPackage,
} from "../src/index.js";

const PSP_ID = "PSP-7K3M9Q2D8F";
const PSP_REVISION = `${PSP_ID}-r00001`;

describe("evaluateLifecycle", () => {
  let processPackage: ProcessPackage;

  beforeAll(async () => {
    const loaded = await loadProcessPackage(
      path.join(process.cwd(), ".lifecycle/process"),
    );
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
    processPackage = loaded.package;
  });

  it("explains the review work for a valid draft PSP with no review context", () => {
    const evaluation = evaluateLifecycle(processPackage, {
      processRef: "git:current",
      phaseId: "phase-0-wayfinding",
      records: [
        {
          datum: {
            id: PSP_ID,
            revision: 1,
            revision_id: PSP_REVISION,
            type: "PSP",
            payload: {
              title: "Lifecycle manager",
              rationale: "Agents need durable lifecycle truth.",
              problem: "Lifecycle intent is lost across agent sessions.",
              users: ["product owner"],
              goals: ["preserve reviewed product intent"],
              non_goals: ["formal regulatory compliance"],
              success_measures: ["all accepted intent is traceable"],
            },
            links: [],
            created_by: {
              scenario: "compile-psp@1",
              prompt_ref: "prompts/compile-psp.md@1",
              process_ref: "git:current",
              loaded_skill_refs: ["skills/product-specification.md@1"],
              policy_refs: ["review-applicability@1"],
            },
            body: "",
          },
          storage: { editable: true, frozen: false },
          integrity: {
            parseable: true,
            schema_valid: true,
            identity_valid: true,
            references_valid: true,
            hash_valid: true,
          },
        },
      ],
      dependencyComparisons: [],
    });

    expect(evaluation.diagnostics).toEqual([]);
    expect(evaluation.artifacts[PSP_REVISION]?.states).toEqual({
      maturity: "draft",
      disposition: "active",
      validity: "valid",
      "relationship-overlays": [],
      "decomposition-status": "not-applicable",
      "change-status": "not-applicable",
    });

    expect(evaluation.looseEnds.map((item) => item.status)).toEqual([
      "ready",
      "blocked",
    ]);

    const context = evaluation.looseEnds.find(
      (item) => item.obligation === "review-context-required",
    );
    expect(context).toEqual(
      expect.objectContaining({
        subject: PSP_REVISION,
        status: "ready",
        eventualResolver: "create-review-context@1",
        actionableResolver: "create-review-context@1",
        dispatchable: true,
        blockedBy: [],
        blockerChains: [],
        unresolvedBindings: [],
        resolver: {
          scenario: "create-review-context@1",
          promptRef: "prompts/create-review-context.md@1",
          expectedOutputs: [
            {
              name: "context",
              types: ["BSL"],
              cardinality: "one",
              requiredLinks: [],
            },
          ],
        },
      }),
    );
    expect(context?.explanation).toContain(
      "A deterministic exact review context can be created now.",
    );

    expect(
      evaluation.looseEnds.find(
        (item) => item.obligation === "passing-review-required",
      ),
    ).toEqual(
      expect.objectContaining({
        subject: PSP_REVISION,
        status: "blocked",
        eventualResolver: "review-datum-in-context@1",
        actionableResolver: "create-review-context@1",
        dispatchable: false,
        blockedBy: [
          `review-context-required@2:${PSP_REVISION}:git:current`,
        ],
        blockerChains: [[
          `review-context-required@2:${PSP_REVISION}:git:current`,
        ]],
        unresolvedBindings: ["review_context"],
        resolver: {
          scenario: "review-datum-in-context@1",
          promptRef: "prompts/review-datum-in-context.md@1",
          expectedOutputs: [
            {
              name: "review",
              types: ["REV"],
              cardinality: "one",
              requiredLinks: [
                { link: "reviews", target: { input: "subject" } },
                {
                  link: "contextualizes",
                  target: { input: "review_context" },
                },
              ],
            },
          ],
        },
      }),
    );
  });

  it("moves review work to awaiting-review once an exact valid context exists", () => {
    const psp: LifecycleRecord = {
      datum: {
        id: PSP_ID,
        revision: 1,
        revision_id: PSP_REVISION,
        type: "PSP",
        payload: {
          title: "Lifecycle manager",
          rationale: "Agents need durable lifecycle truth.",
          problem: "Intent is lost between sessions.",
          users: ["product owner"],
          goals: ["preserve intent"],
          non_goals: [],
          success_measures: ["traceable intent"],
        },
        links: [],
        created_by: {
          scenario: "compile-psp@1",
          prompt_ref: "prompts/compile-psp.md@1",
          process_ref: "git:current",
          loaded_skill_refs: [],
          policy_refs: ["review-applicability@1"],
        },
        body: "",
      },
      storage: { editable: true, frozen: false },
      integrity: {
        parseable: true,
        schema_valid: true,
        identity_valid: true,
        references_valid: true,
        hash_valid: true,
      },
    };
    const contextId = "BSL-X4N7AB2W6J";
    const contextRevision = `${contextId}-r00001`;

    const evaluation = evaluateLifecycle(processPackage, {
      processRef: "git:current",
      phaseId: "phase-0-wayfinding",
      records: [
        psp,
        {
          datum: {
            id: contextId,
            revision: 1,
            revision_id: contextRevision,
            type: "BSL",
            payload: {
              title: "PSP review context",
              kind: "review-context",
              role: "review-context",
              scope: "PSP review",
              group: "DEFAULT",
              definition_members: [PSP_REVISION],
              evidence: [],
            },
            links: [],
            created_by: {
              scenario: "create-review-context@1",
              prompt_ref: "prompts/create-review-context.md@1",
              process_ref: "git:current",
              loaded_skill_refs: [],
              policy_refs: ["review-applicability@1"],
            },
            body: "",
          },
          storage: { editable: false, frozen: true },
          integrity: {
            parseable: true,
            schema_valid: true,
            identity_valid: true,
            references_valid: true,
            hash_valid: true,
          },
        },
      ],
      dependencyComparisons: [],
    });

    expect(evaluation.diagnostics).toEqual([]);
    expect(evaluation.artifacts[PSP_REVISION]?.states.maturity).toBe(
      "review-frozen",
    );
    expect(
      evaluation.looseEnds.some(
        (item) => item.obligation === "review-context-required",
      ),
    ).toBe(false);
    expect(
      evaluation.looseEnds.find(
        (item) => item.obligation === "passing-review-required",
      ),
    ).toEqual(
      expect.objectContaining({
        subject: PSP_REVISION,
        status: "awaiting-review",
      }),
    );
  });
});
