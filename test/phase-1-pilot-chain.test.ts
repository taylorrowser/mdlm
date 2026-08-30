import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { stringify } from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import { executeCommandApplication } from "../src/command-application.js";
import type { LifecycleRecord, LifecycleSnapshot } from "../src/index.js";
import { lifecycleRecord } from "./helpers/lifecycle-record.js";

const processRef = "mdlm-bootstrap@0.123.0#sha256:pilot-chain-regression";

function record(
  type: string,
  id: string,
  payload: Record<string, unknown>,
  scenario: string,
  links: { type: string; target: string }[] = [],
): LifecycleRecord {
  const value = lifecycleRecord(type, id, payload, {
    links,
    createdBy: { process_ref: processRef, scenario },
    storage: { editable: false, frozen: true },
  });
  value.integrity.scenario_execution_valid = true;
  return value;
}

describe("Phase 1 pilot chain", () => {
  let repository: string | undefined;

  afterEach(async () => {
    if (repository) await fs.rm(repository, { recursive: true, force: true });
  });

  it("uses one pilot activity and target for a strategy's complete requirement set", async () => {
    repository = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-pilot-chain-"));
    const initialized = await executeCommandApplication(
      ["init", ".", "--json"],
      repository,
    );
    expect(initialized.exitCode, initialized.output).toBe(0);

    const product = record("PSP", "PSP-4460000001", { title: "Product" }, "compile-psp@3");
    const requirements = [1, 2, 3, 4].map((number) =>
      record(
        "STK",
        `STK-446000000${number}`,
        { title: `Requirement ${number}` },
        "draft-stakeholder-requirements@2",
        [{ type: "derived-from", target: product.datum.id }],
      )
    );
    const acceptedIntent = record(
      "BSL",
      "BSL-4460000001",
      {
        title: "Accepted product intent",
        kind: "intent-approved",
        role: "accepted",
        scope: "product",
        group: "DEFAULT",
        definition_members: [
          product.datum.revision_id,
          ...requirements.map((requirement) => requirement.datum.revision_id),
        ],
        evidence: [],
      },
      "accept-phase-0-intent@1",
    );
    const strategy = record(
      "VSP",
      "VSP-4460000001",
      {
        title: "Shared pilot strategy",
        level: "stakeholder",
        independence: { boundary: "black-box" },
      },
      "define-verification-strategy@1",
      requirements.flatMap((requirement) => [
        { type: "governs", target: requirement.datum.id },
        { type: "governs-revision", target: requirement.datum.revision_id },
      ]),
    );
    const activity = record(
      "VER",
      "VER-4460000001",
      {
        title: "Shared pilot activity",
        kind: "pilot",
        claim: {
          kind: "pilot",
          scope: "verification-design",
          formal_evidence_eligible: false,
        },
        expected_success_activity: "Run the good control.",
        expected_discrimination_activity: "Run the bad control.",
      },
      "write-verification-activity@2",
      [
        ...requirements.flatMap((requirement) => [
          { type: "verifies", target: requirement.datum.id },
          { type: "verifies-revision", target: requirement.datum.revision_id },
        ]),
        { type: "governed-by", target: strategy.datum.revision_id },
        { type: "derived-from", target: product.datum.revision_id },
      ],
    );
    const target = record(
      "ART",
      "ART-4460000001",
      {
        title: "Shared good and bad controls",
        kind: "prototype",
        prototype_controls: {
          activity_ref: activity.datum.revision_id,
          known_good: { expected_verification_outcome: "pass" },
          known_bad: { expected_verification_outcome: "fail" },
        },
      },
      "build-representative-level-pilot-control-prototype@1",
      requirements.map((requirement) => ({
        type: "derived-from",
        target: requirement.datum.revision_id,
      })),
    );

    async function looseEnds(name: string, records: LifecycleRecord[]) {
      const snapshot: LifecycleSnapshot = {
        processRef,
        phaseId: "phase-1-product-assurance",
        records,
        dependencyComparisons: [],
      };
      const snapshotPath = path.join(repository!, `${name}.yaml`);
      await fs.writeFile(snapshotPath, stringify(snapshot));
      const execution = await executeCommandApplication(
        ["loose-ends", "--snapshot", snapshotPath, "--json"],
        repository!,
      );
      expect(execution.exitCode, execution.output).toBe(0);
      return JSON.parse(execution.output).looseEnds.items as Array<{
        obligation: string;
        subject: string;
      }>;
    }

    const planning = await looseEnds(
      "planning",
      [product, ...requirements, acceptedIntent, strategy],
    );
    expect(planning.filter((item) =>
      item.obligation === "pilot-verification-activity-required"
    ), JSON.stringify(planning, null, 2)).toEqual([
      expect.objectContaining({ subject: strategy.datum.revision_id }),
    ]);

    const prototyped = await looseEnds(
      "prototyped",
      [product, ...requirements, acceptedIntent, strategy, activity, target],
    );
    expect(prototyped.filter((item) =>
      item.obligation === "pilot-verification-activity-required" ||
      item.obligation === "representative-level-pilot-target-required"
    )).toEqual([]);
  });
});
