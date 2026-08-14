import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse, stringify } from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import { loadProcessPackage } from "../src/index.js";
import { dryRunExplicitScenario } from "../src/scenario-dry-run.js";
import { lifecycleRecord } from "./helpers/lifecycle-record.js";
import { terminalProcessPackage } from "./helpers/terminal-process-package.js";

async function writeYaml(root: string, relativePath: string, value: unknown) {
  const target = path.join(root, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, stringify(value));
}

describe("package-authored review Policy evidence", () => {
  const temporaryRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true })
    ));
  });

  it("resolves declared assets without package-specific identifiers in core", async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-policy-assets-"));
    temporaryRoots.push(parent);
    const root = await terminalProcessPackage(parent);
    const manifestPath = path.join(root, "manifest.yaml");
    const manifest = parse(await fs.readFile(manifestPath, "utf8"));
    manifest.catalog.policies.push("item-judgment");
    manifest.catalog.scenarios.push("inspect-item");
    manifest.assets.prompts.push("prompts/inspect-item.md@1");
    manifest.assets.guides = ["guides/item-judgment.md@3"];
    await fs.writeFile(manifestPath, stringify(manifest));

    await writeYaml(root, "policies/item-judgment.yaml", {
      kind: "policy-definition",
      id: "item-judgment",
      version: 1,
      description: "Select exact package-owned evidence for one fixture item.",
      parameters: [{ name: "candidate", kind: "revision", types: ["ITM"] }],
      result_schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        additionalProperties: false,
        required: ["applicable", "guide"],
        properties: {
          applicable: { type: "boolean" },
          guide: { type: ["string", "null"] },
        },
      },
      default: { applicable: false, guide: null },
      rules: [{
        priority: 1,
        when: 'candidate.identity.type == "ITM"',
        result: { applicable: true, guide: "guides/item-judgment.md@3" },
      }],
    });
    await writeYaml(root, "scenarios/inspect-item.yaml", {
      kind: "scenario-definition",
      id: "inspect-item",
      version: 1,
      description: "Inspect one exact fixture item.",
      initiation: "explicit",
      phases: ["phase-0-terminal"],
      inputs: [{
        name: "item",
        types: ["ITM"],
        cardinality: "one",
        identity: "revision",
      }],
      outputs: [{
        name: "inspection",
        types: ["ITM"],
        cardinality: "one",
        required_links: [],
      }],
      prompt_ref: "prompts/inspect-item.md@1",
      review_policy_ref: "item-judgment@1",
      review_policy_arguments: { candidate: "item" },
      completion: "execution.integrity.contract_valid == true",
      resolves: [],
      prohibited_inputs: [],
      batching: "single",
    });
    await fs.writeFile(
      path.join(root, "prompts/inspect-item.md"),
      "---\nid: inspect-item\nversion: 1\nscenario: inspect-item\n---\n\n# Inspect one item\n",
    );
    await fs.mkdir(path.join(root, "guides"), { recursive: true });
    await fs.writeFile(
      path.join(root, "guides/item-judgment.md"),
      "---\nid: item-judgment\nversion: 3\n---\n\n# Item judgment guide\n",
    );
    const phasePath = path.join(root, "phases/phase-0-terminal.yaml");
    const phase = parse(await fs.readFile(phasePath, "utf8"));
    phase.scenarios.push("inspect-item@1");
    await fs.writeFile(phasePath, stringify(phase));

    const loaded = await loadProcessPackage(root);
    expect(loaded.ok, loaded.ok ? "" : JSON.stringify(loaded.diagnostics)).toBe(true);
    if (!loaded.ok) return;
    const item = lifecycleRecord("ITM", "ITM-0123456789", {}, {
      createdBy: { process_ref: "fixture@1#sha256:test" },
      storage: { editable: false, frozen: true },
    });
    const prepared = await dryRunExplicitScenario(
      loaded.package,
      {
        processRef: "fixture@1#sha256:test",
        phaseId: "phase-0-terminal",
        records: [item],
        dependencyComparisons: [],
      },
      "inspect-item@1",
      [{ name: "item", value: item.datum.revision_id }],
    );

    expect(prepared.ok, prepared.ok ? "" : JSON.stringify(prepared.diagnostics))
      .toBe(true);
    if (!prepared.ok) return;
    expect(prepared.value.policies).toContainEqual(expect.objectContaining({
      role: "review",
      reference: "item-judgment@1",
      evaluations: [{
        invocation: 0,
        arguments: { candidate: item.datum.revision_id },
        result: {
          applicable: true,
          guide: "guides/item-judgment.md@3",
        },
        assets: [expect.objectContaining({
          reference: "guides/item-judgment.md@3",
          digest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
          content: expect.stringContaining("# Item judgment guide"),
        })],
      }],
    }));

    manifest.assets.guides = ["../outside.md@1"];
    await fs.writeFile(manifestPath, stringify(manifest));
    const traversal = await loadProcessPackage(root);
    expect(traversal.ok).toBe(false);
    expect(traversal.diagnostics).toContainEqual(expect.objectContaining({
      code: "meta-schema",
      path: expect.stringContaining("manifest.yaml/assets/guides/0"),
    }));

    manifest.assets.guides = ["guides/item-judgment.md@3"];
    await fs.writeFile(manifestPath, stringify(manifest));
    const outsidePath = path.join(parent, "outside-item-judgment.md");
    await fs.writeFile(
      outsidePath,
      "---\nid: item-judgment\nversion: 3\n---\n\n# Outside guide\n",
    );
    await fs.rm(path.join(root, "guides/item-judgment.md"));
    await fs.symlink(outsidePath, path.join(root, "guides/item-judgment.md"));
    const escaped = await dryRunExplicitScenario(
      loaded.package,
      {
        processRef: "fixture@1#sha256:test",
        phaseId: "phase-0-terminal",
        records: [item],
        dependencyComparisons: [],
      },
      "inspect-item@1",
      [{ name: "item", value: item.datum.revision_id }],
    );
    expect(escaped.ok).toBe(false);
    expect(escaped.diagnostics).toContainEqual(expect.objectContaining({
      code: "policy-asset-outside-package",
      path: "guides/item-judgment.md",
    }));
  });
});
