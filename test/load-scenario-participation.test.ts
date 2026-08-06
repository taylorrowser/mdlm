import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadProcessPackage } from "../src/index.js";
import { participationProcessPackage } from "./helpers/participation-process.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true })
    ),
  );
});

describe("Scenario participation Policy validation", () => {
  it("accepts a versioned Policy with exact Scenario input arguments and the standard result", async () => {
    const processRoot = await participationProcessPackage();
    temporaryRoots.push(path.dirname(processRoot));

    const loaded = await loadProcessPackage(processRoot);

    expect(
      loaded.ok,
      loaded.diagnostics.map((item) => `${item.code}: ${item.message}`).join("\n"),
    ).toBe(true);
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
    expect(loaded.package.scenarios["resolve-question"]?.participation)
      .toEqual(expect.objectContaining({
        policy_ref: "question-participation@1",
        arguments: expect.objectContaining({
          question: expect.any(Object),
          selected_phase: expect.any(Object),
        }),
      }));
  });

  it("keeps authority mode, delegation allowance, and attention timing independent", async () => {
    const processRoot = await participationProcessPackage();
    temporaryRoots.push(path.dirname(processRoot));
    const policyPath = path.join(processRoot, "policies/process-participation.yaml");
    await fs.writeFile(
      policyPath,
      (await fs.readFile(policyPath, "utf8")).replace(
        "  delegation_allowed: false",
        "  delegation_allowed: true",
      ),
    );

    const loaded = await loadProcessPackage(processRoot);

    expect(
      loaded.ok,
      loaded.diagnostics.map((item) => item.message).join("\n"),
    ).toBe(true);
  });

  it.each([
    {
      name: "an unknown Policy reference",
      mutate: (source: string) =>
        source.replace("question-participation@1", "missing-participation@1"),
      code: "unknown-reference",
    },
    {
      name: "missing Policy parameters",
      mutate: (source: string) =>
        source.replace("    question: question", "    unexpected: question"),
      code: "participation-policy-arguments",
    },
    {
      name: "an argument with the wrong typed expression",
      mutate: (source: string) =>
        source.replace(
          "    question: question",
          `    question: '\"not-an-entity\"'`,
        ),
      code: "expression-result-type",
    },
    {
      name: "a many-valued input bound to a singular parameter",
      mutate: (source: string) =>
        source.replace("    cardinality: one", "    cardinality: one-or-more"),
      code: "expression-result-type",
    },
    {
      name: "an optional input bound to a required parameter",
      mutate: (source: string) =>
        source.replace("    cardinality: one", "    cardinality: zero-or-one"),
      code: "participation-policy-argument-type",
    },
    {
      name: "an input whose identity kind is not exact enough",
      mutate: (source: string) =>
        source.replace("    identity: revision", "    identity: either"),
      code: "participation-policy-argument-type",
    },
  ])("rejects $name", async ({ mutate, code }) => {
    const processRoot = await participationProcessPackage();
    temporaryRoots.push(path.dirname(processRoot));
    const scenarioPath = path.join(
      processRoot,
      "scenarios/resolve-question.yaml",
    );
    await fs.writeFile(
      scenarioPath,
      mutate(await fs.readFile(scenarioPath, "utf8")),
    );

    const loaded = await loadProcessPackage(processRoot);

    expect(loaded.ok).toBe(false);
    expect(loaded.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code }),
    ]));
  });

  it("rejects participation that depends on execution context", async () => {
    const processRoot = await participationProcessPackage();
    temporaryRoots.push(path.dirname(processRoot));
    const policyPath = path.join(processRoot, "policies/process-participation.yaml");
    await fs.writeFile(
      policyPath,
      (await fs.readFile(policyPath, "utf8")).replace(
        "{name: selected_process, kind: process}",
        "{name: selected_process, kind: execution}",
      ),
    );
    const scenarioPath = path.join(
      processRoot,
      "scenarios/chart-wayfinding-map.yaml",
    );
    await fs.writeFile(
      scenarioPath,
      (await fs.readFile(scenarioPath, "utf8")).replace(
        "    selected_process: process",
        "    selected_process: execution",
      ),
    );

    const loaded = await loadProcessPackage(processRoot);

    expect(loaded.ok).toBe(false);
    expect(loaded.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "participation-execution-binding-forbidden",
      }),
    ]));
  });

  it("rejects undeclared lifecycle types in participation parameters", async () => {
    const processRoot = await participationProcessPackage();
    temporaryRoots.push(path.dirname(processRoot));
    const policyPath = path.join(
      processRoot,
      "policies/question-participation.yaml",
    );
    await fs.writeFile(
      policyPath,
      (await fs.readFile(policyPath, "utf8")).replace(
        "types: [QST]",
        "types: [ZZZ]",
      ),
    );

    const loaded = await loadProcessPackage(processRoot);

    expect(loaded.ok).toBe(false);
    expect(loaded.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "unknown-participation-policy-type",
      }),
    ]));
  });

  it("rejects duplicate participation Policy parameter names", async () => {
    const processRoot = await participationProcessPackage();
    temporaryRoots.push(path.dirname(processRoot));
    const policyPath = path.join(
      processRoot,
      "policies/question-participation.yaml",
    );
    await fs.writeFile(
      policyPath,
      (await fs.readFile(policyPath, "utf8")).replace(
        "  - {name: question, kind: revision, types: [QST]}",
        "  - {name: question, kind: revision, types: [QST]}\n  - {name: question, kind: scalar, scalar_type: string}",
      ),
    );

    const loaded = await loadProcessPackage(processRoot);

    expect(loaded.ok).toBe(false);
    expect(loaded.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "participation-policy-parameters",
      }),
    ]));
  });

  it("rejects an unknown payload path on a typed Policy parameter", async () => {
    const processRoot = await participationProcessPackage();
    temporaryRoots.push(path.dirname(processRoot));
    const policyPath = path.join(
      processRoot,
      "policies/question-participation.yaml",
    );
    await fs.writeFile(
      policyPath,
      (await fs.readFile(policyPath, "utf8")).replace(
        "question.payload.kind",
        "question.payload.knd",
      ),
    );

    const loaded = await loadProcessPackage(processRoot);

    expect(loaded.ok).toBe(false);
    expect(loaded.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "expression-unknown-path" }),
    ]));
  });

  it("rejects lifecycle types on a contextual Policy parameter", async () => {
    const processRoot = await participationProcessPackage();
    temporaryRoots.push(path.dirname(processRoot));
    const policyPath = path.join(processRoot, "policies/process-participation.yaml");
    await fs.writeFile(
      policyPath,
      (await fs.readFile(policyPath, "utf8")).replace(
        "{name: selected_process, kind: process}",
        "{name: selected_process, kind: process, types: [QST]}",
      ),
    );

    const loaded = await loadProcessPackage(processRoot);

    expect(loaded.ok).toBe(false);
    expect(loaded.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "meta-schema" }),
    ]));
  });

  it("rejects lifecycle types on a scalar Policy parameter", async () => {
    const processRoot = await participationProcessPackage();
    temporaryRoots.push(path.dirname(processRoot));
    const policyPath = path.join(processRoot, "policies/process-participation.yaml");
    await fs.writeFile(
      policyPath,
      (await fs.readFile(policyPath, "utf8")).replace(
        "{name: selected_process, kind: process}",
        "{name: selected_process, kind: scalar, scalar_type: string, types: [QST]}",
      ),
    );

    const loaded = await loadProcessPackage(processRoot);

    expect(loaded.ok).toBe(false);
    expect(loaded.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "meta-schema" }),
    ]));
  });

  it("rejects a non-integer expression for an integer Policy parameter", async () => {
    const processRoot = await participationProcessPackage();
    temporaryRoots.push(path.dirname(processRoot));
    const policyPath = path.join(processRoot, "policies/process-participation.yaml");
    await fs.writeFile(
      policyPath,
      (await fs.readFile(policyPath, "utf8"))
        .replace(
          "{name: selected_process, kind: process}",
          "{name: selected_process, kind: scalar, scalar_type: integer}",
        )
        .replace(
          "selected_process.integrity.package_valid == true",
          "selected_process == 1",
        ),
    );
    const scenarioPath = path.join(
      processRoot,
      "scenarios/chart-wayfinding-map.yaml",
    );
    await fs.writeFile(
      scenarioPath,
      (await fs.readFile(scenarioPath, "utf8")).replace(
        "    selected_process: process",
        "    selected_process: '1.5'",
      ),
    );

    const loaded = await loadProcessPackage(processRoot);

    expect(loaded.ok).toBe(false);
    expect(loaded.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "expression-result-type" }),
    ]));
  });

  it("rejects a participation argument with an indirect execution dependency", async () => {
    const processRoot = await participationProcessPackage();
    temporaryRoots.push(path.dirname(processRoot));
    const manifestPath = path.join(processRoot, "manifest.yaml");
    await fs.writeFile(
      manifestPath,
      (await fs.readFile(manifestPath, "utf8")).replace(
        "baseline-participation]",
        "baseline-participation, execution-helper]",
      ),
    );
    await fs.writeFile(
      path.join(processRoot, "policies/execution-helper.yaml"),
      `kind: policy-definition
id: execution-helper
version: 1
description: Invalid helper whose answer is unavailable before execution.
parameters:
  - {name: selected_process, kind: process}
result_schema:
  $schema: https://json-schema.org/draft/2020-12/schema
  type: object
  additionalProperties: false
  required: [allowed]
  properties:
    allowed: {type: boolean}
default: {allowed: false}
rules:
  - priority: 100
    when: 'execution.integrity.contract_valid == true'
    result: {allowed: true}
`,
    );
    const policyPath = path.join(processRoot, "policies/process-participation.yaml");
    await fs.writeFile(
      policyPath,
      (await fs.readFile(policyPath, "utf8"))
        .replace(
          "{name: selected_process, kind: process}",
          "{name: selected_process, kind: scalar, scalar_type: boolean}",
        )
        .replace(
          "selected_process.integrity.package_valid == true",
          "selected_process == true",
        ),
    );
    const scenarioPath = path.join(
      processRoot,
      "scenarios/chart-wayfinding-map.yaml",
    );
    await fs.writeFile(
      scenarioPath,
      (await fs.readFile(scenarioPath, "utf8")).replace(
        "    selected_process: process",
        `    selected_process: 'policy("execution-helper@1", {selected_process: process}).allowed'`,
      ),
    );

    const loaded = await loadProcessPackage(processRoot);

    expect(loaded.ok).toBe(false);
    expect(loaded.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "participation-execution-binding-forbidden",
      }),
    ]));
  });

  it("rejects a participation Policy that transitively depends on execution", async () => {
    const processRoot = await participationProcessPackage();
    temporaryRoots.push(path.dirname(processRoot));
    const policyPath = path.join(processRoot, "policies/process-participation.yaml");
    await fs.writeFile(
      policyPath,
      (await fs.readFile(policyPath, "utf8")).replace(
        "selected_process.integrity.package_valid == true",
        "execution.integrity.contract_valid == true",
      ),
    );

    const loaded = await loadProcessPackage(processRoot);

    expect(loaded.ok).toBe(false);
    expect(loaded.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "participation-execution-binding-forbidden",
      }),
    ]));
  });

  it("rejects a Revision argument for a baseline-only Policy parameter", async () => {
    const processRoot = await participationProcessPackage();
    temporaryRoots.push(path.dirname(processRoot));
    const policyPath = path.join(
      processRoot,
      "policies/question-participation.yaml",
    );
    const source = await fs.readFile(policyPath, "utf8");
    await fs.writeFile(
      policyPath,
      source.replace(
        "{name: question, kind: revision, types: [QST]}",
        "{name: question, kind: baseline, types: [QST]}",
      ),
    );

    const loaded = await loadProcessPackage(processRoot);

    expect(loaded.ok).toBe(false);
    expect(loaded.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "participation-policy-argument-type",
      }),
    ]));
  });

  it("rejects an invalid Authority Requirement or Attention Schedule result", async () => {
    const processRoot = await participationProcessPackage();
    temporaryRoots.push(path.dirname(processRoot));
    const policyPath = path.join(
      processRoot,
      "policies/question-participation.yaml",
    );
    const source = await fs.readFile(policyPath, "utf8");
    await fs.writeFile(
      policyPath,
      source.replace(
        "  attention_checkpoint: phase-0-gate",
        "  attention_checkpoint: null",
      ),
    );

    const loaded = await loadProcessPackage(processRoot);

    expect(loaded.ok).toBe(false);
    expect(loaded.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "participation-policy-result" }),
    ]));
  });

  it("rejects results that violate additional declared Policy constraints", async () => {
    const processRoot = await participationProcessPackage();
    temporaryRoots.push(path.dirname(processRoot));
    const policyPath = path.join(
      processRoot,
      "policies/question-participation.yaml",
    );
    const source = await fs.readFile(policyPath, "utf8");
    await fs.writeFile(
      policyPath,
      source.replace(
        "authority: {type: string, minLength: 1}",
        "authority: {type: string, minLength: 1, enum: [stakeholder]}",
      ),
    );

    const loaded = await loadProcessPackage(processRoot);

    expect(loaded.ok).toBe(false);
    expect(loaded.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "participation-policy-result" }),
    ]));
  });

  it("rejects a Policy without the standardized participation result", async () => {
    const processRoot = await participationProcessPackage();
    temporaryRoots.push(path.dirname(processRoot));
    const policyPath = path.join(
      processRoot,
      "policies/question-participation.yaml",
    );
    const source = await fs.readFile(policyPath, "utf8");
    await fs.writeFile(
      policyPath,
      source.replace(
        "    consolidation_group: {type: [string, 'null']}",
        "    consolidation_group: {type: string}",
      ),
    );

    const loaded = await loadProcessPackage(processRoot);

    expect(loaded.ok).toBe(false);
    expect(loaded.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "participation-policy-result-schema" }),
    ]));
  });
});
