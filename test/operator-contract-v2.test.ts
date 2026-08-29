import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { operatorInstructions } from "../src/operator-instructions.js";

const root = path.join(
  process.cwd(),
  "test/fixtures/operator-contract-v2",
);

async function fixture(name: string): Promise<Record<string, unknown>> {
  const source = await fs.readFile(path.join(root, `${name}.json`), "utf8");
  const value = JSON.parse(source) as Record<string, unknown>;
  expect(source).toBe(`${JSON.stringify(value)}\n`);
  return value;
}

describe("operator contract v2 fixtures", () => {
  it("freezes exactly six complete next outcomes", async () => {
    const outcomes = [
      "assignment",
      "attention-required",
      "profile-boundary-reached",
      "lifecycle-complete",
      "process-dead-end",
      "invalid",
    ];
    for (const outcome of outcomes) {
      const value = await fixture(outcome);
      expect(value).toMatchObject({ contract: "mdlm-next@2", outcome });
      expect(value).not.toHaveProperty("materializedExecutions");
    }
    for (const outcome of ["assignment", "attention-required"]) {
      const value = await fixture(outcome) as {
        assignment: { packet: Record<string, unknown> };
      };
      expect(value.assignment.packet).toMatchObject({
        contract: "mdlm-assignment-packet@3",
        responseScaffold: {
          contract: "mdlm-assignment-response@2",
        },
      });
      expect(value.assignment.packet).toHaveProperty("responseSchema");
    }
  });

  it("keeps generated identity and authority out of symbolic responses", async () => {
    const response = await fixture("assignment-response");
    const source = JSON.stringify(response);
    expect(source).toContain('"target":{"output":"context"}');
    for (const forbidden of [
      "stableId",
      "revisionId",
      "created_by",
      "loadedSkillRefs",
      "authoritySupplies",
      "standingDelegations",
    ]) expect(source).not.toContain(forbidden);
  });

  it("freezes accepted, rejected, and recoverable settlement outcomes", async () => {
    for (const outcome of ["accepted", "rejected", "settlement-required"]) {
      expect(await fixture(`submission-${outcome}`)).toMatchObject({
        contract: "mdlm-submission-outcome@1",
        outcome,
      });
    }
    expect(await fixture("submission-rejected")).toMatchObject({
      retryable: true,
      correctionConsumed: false,
    });
    expect(await fixture("submission-settlement-required")).toMatchObject({
      orchestration: { action: "inspect-settlement", replay: false },
    });
  });

  it("does not recreate ordinary preparation choreography", () => {
    const instructions = operatorInstructions({
      outcome: "assignment",
      assignment: { id: "assignment-1" },
    });
    expect(instructions.action).toBe("execute-assignment");
    expect(instructions.commands.join(" ")).not.toContain("scenario prepare");
  });
});
