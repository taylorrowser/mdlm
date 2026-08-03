import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadProcessPackage, resolveType } from "../src/index.js";

describe("resolveType", () => {
  it("flattens the kernel envelope and requirement template chain for STK", async () => {
    const loaded = await loadProcessPackage(
      path.join(process.cwd(), ".lifecycle/process"),
    );
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));

    const result = resolveType(loaded.package, "STK");

    expect(result.ok, result.diagnostics.map((item) => item.message).join("\n")).toBe(
      true,
    );
    if (!result.ok) return;

    expect(result.type.templateChain).toEqual([
      "titled-datum@1",
      "rationale-bearing@1",
      "requirement@1",
    ]);
    expect(result.type.payloadSchema.required).toEqual([
      "priority",
      "rationale",
      "stakeholder",
      "statement",
      "title",
      "verification_intent",
    ]);
    expect(Object.keys(result.type.payloadSchema.properties).sort()).toEqual([
      "priority",
      "rationale",
      "stakeholder",
      "statement",
      "title",
      "verification_intent",
    ]);
    expect(result.type.outgoingLinks).toEqual([
      expect.objectContaining({
        id: "derived-from",
        targets: [
          expect.objectContaining({ types: ["PSP"], identity: "stable" }),
        ],
      }),
    ]);
    expect(result.type.envelopeSchema.$id).toBe(
      "https://mdlm.dev/kernel/process-interface/v1/datum-envelope.schema.json",
    );
  });
});
