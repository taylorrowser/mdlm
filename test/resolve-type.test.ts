import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { loadProcessPackage, resolveType } from "../src/index.js";

async function copiedProcessPackage(): Promise<string> {
  const temporaryRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "mdlm-type-resolution-"),
  );
  const processRoot = path.join(temporaryRoot, "process");
  await fs.cp(path.join(process.cwd(), ".lifecycle/process"), processRoot, {
    recursive: true,
  });
  return processRoot;
}

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

  it("preserves package-authored conditional payload constraints", async () => {
    const loaded = await loadProcessPackage(
      path.join(process.cwd(), ".lifecycle/process"),
    );
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));

    const result = resolveType(loaded.package, "QST");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const validate = new Ajv2020({ allErrors: true, strict: false }).compile(
      result.type.payloadSchema,
    );
    const payload = {
      title: "Deferred choice",
      kind: "preferential",
      question: "Which boundary should be selected?",
      state: "deferred",
      blocking_impact: "The boundary remains unresolved.",
    };

    expect(validate(payload)).toBe(false);
    expect(validate.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        keyword: "required",
        params: { missingProperty: "reactivation_condition" },
      }),
    ]));
    expect(validate({
      ...payload,
      reactivation_condition: "Reopen when the boundary evidence changes.",
    })).toBe(true);
  });

  it("preserves additive fields while applying a supported constraint narrowing", async () => {
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
        "    title: {type: string, minLength: 1, enum: [alpha, beta, gamma]}",
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
        "    rationale: {type: string, minLength: 1}\n    title: {type: string, minLength: 5, maxLength: 80, enum: [alpha, beta]}",
      ),
    );
    const loaded = await loadProcessPackage(processRoot);
    expect(loaded.ok, loaded.diagnostics.map((item) => item.message).join("\n")).toBe(
      true,
    );
    if (!loaded.ok) return;

    const result = resolveType(loaded.package, "STK");

    expect(result.ok, result.diagnostics.map((item) => item.message).join("\n")).toBe(
      true,
    );
    if (!result.ok) return;
    expect(result.type.payloadSchema.properties.title).toEqual({
      type: "string",
      minLength: 5,
      maxLength: 80,
      enum: ["alpha", "beta"],
    });
    expect(result.type.payloadSchema.required).toEqual([
      "priority",
      "rationale",
      "stakeholder",
      "statement",
      "title",
      "verification_intent",
    ]);
  });
});
