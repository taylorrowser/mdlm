import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PROCESS_REPOSITORY_TEST_TIMEOUT_MS,
} from "../scripts/root-test-observation-policy.mjs";
import { executeCommandApplication } from "../src/command-application.js";
import { withLifecycleTestRepository } from "./helpers/lifecycle-test-repository.js";

describe("clean onboarding transaction contract", () => {
  it("publishes the first transaction and binds later work to the committed state", () =>
    withLifecycleTestRepository(
      "mdlm-zero-to-assessment-",
      async (repository) => {
    expect(repository.initialization).toMatchObject({
      package: {
        reference: "mdlm-bootstrap@0.75.0",
        digest:
          "sha256:684f31653dcae04f8368e0dae8b66dc35a432f9803efdca4279866372b0171e7",
      },
      repository: { contract: "mdlm-repository@1" },
    });
    const first = await repository.nextAssignment(
      "establish-initial-wayfinding-map@2",
    );
    expect(first.outcome).toMatchObject({
      contract: "mdlm-next@1",
      outcome: "assignment",
      assignment: { id: expect.any(String) },
    });
    expect(first.packet).toMatchObject({
      contract: "mdlm-assignment-packet@3",
      package: {
        reference: "mdlm-bootstrap@0.75.0",
        digest:
          "sha256:684f31653dcae04f8368e0dae8b66dc35a432f9803efdca4279866372b0171e7",
      },
      scenario: { reference: "establish-initial-wayfinding-map@2" },
    });

    await repository.publish(first, [{
          localId: "map",
          name: "map",
          invocation: 0,
          lifecycleDatum: {
            type: "MAP",
            payload: {
              title: "Zero-to-assessment clean pilot",
              purpose: "Obtain exact product intent before autonomous compilation.",
              frontier: ["$proposal.product_intent.revision_id"],
            },
            links: [{ type: "indexes", target: "$proposal.product_intent.id" }],
            body: "One bounded Product Wayfinding frontier.\n",
          },
        }, {
          localId: "product_intent",
          name: "product_intent",
          invocation: 0,
          lifecycleDatum: {
            type: "QST",
            payload: {
              title: "Initial intended product",
              kind: "preferential",
              intent_scope: "product",
              question: "What product do you currently intend to build?",
              state: "open",
              blocking_impact: "PSP compilation requires the stakeholder's answer.",
            },
            links: [],
            body: "The initial product intent requires attended resolution.\n",
          },
        }], {
      commitMessage: "Publish clean pilot MAP",
      completionEvidence: { summary: "Established the exact pilot frontier." },
      authoritySupplies: [],
    });
    const materialized = await repository.publishMaterialization(
      "Publish source boundary",
    );
    expect(materialized.materializedExecutions).toHaveLength(1);
    const subsequent = await repository.nextAssignment();

    // This is not pilot progress. It proves that an allocated Assignment cannot
    // silently cross a tracked-state boundary after the clean commit.
    await fs.appendFile(
      path.join(repository.path, ".gitignore"),
      "# tracked drift\n",
    );
    const stale = await executeCommandApplication(
      ["scenario", "prepare", subsequent.outcome.assignment.id],
      repository.path,
    );
    expect(stale.exitCode).toBe(1);
    expect(JSON.parse(stale.output).diagnostics).toEqual([
      expect.objectContaining({ code: "assignment-stale" }),
    ]);
      },
    ), PROCESS_REPOSITORY_TEST_TIMEOUT_MS);
});
