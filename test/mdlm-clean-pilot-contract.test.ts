import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PROCESS_REPOSITORY_TEST_TIMEOUT_MS } from "../scripts/root-test-observation-policy.mjs";
import { LifecycleTransactionDriver } from "./helpers/assignment-submission.js";

const executable = path.join(process.cwd(), "dist/mdlm.js");

function mdlm(repository: string, args: string[]) {
  return spawnSync(process.execPath, [executable, ...args], {
    cwd: repository,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
}

describe("clean pilot public-process contract", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true })
    ));
  });

  it("binds each subsequent Assignment to the doctor-checked ordinary Git commit", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-clean-pilot-"));
    roots.push(root);
    const repository = path.join(root, "repository");
    const { driver } = await LifecycleTransactionDriver.initialize(repository);
    const assignment = await driver.assignment(
      "establish-initial-wayfinding-map@2",
    );

    const lease = JSON.parse(await fs.readFile(path.join(
      repository,
      ".lifecycle/work/active-assignment.json",
    ), "utf8"));
    expect(lease.scenario).toBe("establish-initial-wayfinding-map@2");

    await driver.commit(assignment, [{
      localId: "map",
      name: "map",
      invocation: 0,
      lifecycleDatum: {
        type: "MAP",
        payload: {
          title: "Complete-profile clean pilot",
          purpose: "Prove the public operator loop against exact committed state.",
          frontier: ["$proposal.product-intent.revision_id"],
        },
        links: [{
          type: "indexes",
          target: "$proposal.product-intent.id",
        }],
        body: "The pilot begins from one bounded Product Wayfinding frontier.\n",
      },
    }, {
      localId: "product-intent",
      name: "product_intent",
      invocation: 0,
      lifecycleDatum: {
        type: "QST",
        payload: {
          title: "Initial intended product",
          kind: "preferential",
          intent_scope: "product",
          question: "Which exact product should this pilot build?",
          state: "open",
          blocking_impact: "PSP compilation waits for the attended answer.",
        },
        links: [],
        body: "The pilot records its mandatory initial product-intent Question.\n",
      },
    }], {
      authoritySupplies: [],
      commitMessage: "Publish clean pilot MAP",
      completionEvidence: { summary: "Established the exact pilot frontier." },
    });

    const materialized = await driver.materialize("Publish source boundary");
    expect(materialized.materializedExecutions).toHaveLength(1);
    const subsequent = await driver.assignment();

    // This adversarial edit is not pilot progress. It proves through the public
    // interface that the allocated Assignment is exact to the clean commit.
    await fs.appendFile(path.join(repository, ".gitignore"), "# tracked drift\n");
    const stale = mdlm(repository, [
      "scenario",
      "prepare",
      subsequent.outcome.assignment.id,
    ]);
    expect(stale.status).toBe(1);
    expect(JSON.parse(stale.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "assignment-stale" }),
    ]);
  }, PROCESS_REPOSITORY_TEST_TIMEOUT_MS);
});
