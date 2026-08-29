import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse, stringify } from "yaml";
import { afterEach, describe, expect, test } from "vitest";
import { loadProcessPackage } from "../src/index.js";

const source = path.join(process.cwd(), ".lifecycle", "process");
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    fs.rm(root, { recursive: true, force: true })
  ));
});

async function copiedPackage(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-package-cutover-"));
  temporaryRoots.push(root);
  await fs.cp(source, root, { recursive: true });
  return root;
}

describe("simplified Process Package contract", () => {
  test("generates catalogs and phase membership from definition files", async () => {
    const manifest = parse(await fs.readFile(path.join(source, "manifest.yaml"), "utf8"));
    expect(manifest).not.toHaveProperty("catalog");
    expect(manifest).not.toHaveProperty("assets");

    const loaded = await loadProcessPackage(source);
    expect(loaded.ok, loaded.ok ? "" : JSON.stringify(loaded.diagnostics)).toBe(true);
    if (!loaded.ok) return;

    const phase = loaded.package.phases["phase-0-wayfinding"];
    expect(phase).toBeDefined();
    if (!phase) return;
    expect(phase.scenarios).toContain("review-phase-0-foundation@1");
    expect(phase.scenarios).not.toContain("review-datum-in-context@2");
    expect(phase.obligations).toContain("phase-0-foundation-review-required@1");
    expect(phase.obligations).not.toContain("review-context-required@2");
  });

  test("rejects unknown and nondeterministic routing declarations", async () => {
    for (const statusOrder of [
      ["ready", "awaiting-review", "failed", "stale", "unknown"],
      ["ready", "awaiting-review", "failed", "stale", "stale"],
    ]) {
      const root = await copiedPackage();
      const phasePath = path.join(root, "phases", "phase-0-wayfinding.yaml");
      const phase = parse(await fs.readFile(phasePath, "utf8"));
      phase.routing.status_order = statusOrder;
      await fs.writeFile(phasePath, stringify(phase));
      const loaded = await loadProcessPackage(root);
      expect(loaded.ok).toBe(false);
      if (!loaded.ok) {
        expect(loaded.diagnostics.some((item) => item.code === "meta-schema")).toBe(true);
      }
    }
  });

  test("declares small atomic Review families with explicit packet metadata", async () => {
    const loaded = await loadProcessPackage(source);
    expect(loaded.ok, loaded.ok ? "" : JSON.stringify(loaded.diagnostics)).toBe(true);
    if (!loaded.ok) return;

    const expected = {
      "review-phase-0-foundation": ["MAP", "PSP", "STK"],
      "review-phase-0-candidate": ["BSL"],
      "review-phase-1-assurance": ["VSP", "ENV", "VER", "VAI"],
    };
    for (const [id, subjectTypes] of Object.entries(expected)) {
      const scenario = loaded.package.scenarios[id];
      expect(scenario).toBeDefined();
      if (!scenario) continue;
      const inputs = scenario.inputs as { types: string[] }[];
      const outputs = scenario.outputs as {
        name: string;
        handle?: string;
        required_links?: unknown[];
      }[];
      const reviewContract = scenario.review_contract as {
        required_evidence: string[];
      };
      expect(inputs[0]?.types).toEqual(subjectTypes);
      expect(outputs.map((output) => output.name))
        .toEqual(["review_context", "review"]);
      expect(outputs.map((output) => output.handle)).toEqual(["context", "review"]);
      expect(outputs[1]?.required_links).toContainEqual({
        link: "contextualizes",
        target: { output: "review_context" },
      });
      expect(scenario.skills).toHaveLength(1);
      expect(scenario.input_summaries).toBeTypeOf("object");
      expect(reviewContract.required_evidence)
        .toContain("review_context_members");
      expect(scenario.completion_summary).toMatch(/one transaction/);
    }
  });
});
