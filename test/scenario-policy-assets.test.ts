import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse, stringify } from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import { evaluateLifecycle, loadProcessPackage } from "../src/index.js";
import {
  markdownAssetFrontmatter,
  promptSkillReferences,
} from "../src/markdown-asset.js";
import {
  dryRunExplicitScenario,
  dryRunResolverScenario,
} from "../src/scenario-dry-run.js";
import { canonicalProcessPackage } from "./helpers/canonical-process-package-fixture.js";
import { lifecycleRecord } from "./helpers/lifecycle-record.js";
import { terminalProcessPackage } from "./helpers/terminal-process-package.js";

async function writeYaml(root: string, relativePath: string, value: unknown) {
  const target = path.join(root, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, stringify(value));
}

describe("package-authored review Policy evidence", () => {
  const temporaryRoots: string[] = [];

  it("accepts exact declared skill references using the envelope grammar", () => {
    const reference = "skills/Review_Guide.md@1";
    expect(promptSkillReferences(
      `Load \`${reference}\`.`,
    )).toEqual({ ok: true, references: [reference] });
  });

  it("ignores non-skill versioned assets in legacy prompt bodies", () => {
    expect(
      promptSkillReferences("Use `policies/rubrics/bootstrap-review.md@3`."),
    ).toEqual({ ok: true, references: [] });
  });

  afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true })
    ));
  });

  it("keeps topology preflight mandatory, ephemeral, and outside reviewer input", async () => {
    const root = path.join(process.cwd(), ".lifecycle/process");
    const architecturePrompt = await fs.readFile(
      path.join(root, "prompts/define-system-architecture.md"),
      "utf8",
    );
    expect(promptSkillReferences(architecturePrompt)).toEqual({
      ok: true,
      references: expect.arrayContaining([
        "skills/information-allocation.md@1",
        "skills/author-preflight.md@2",
      ]),
    });
    expect(architecturePrompt).toMatch(
      /early whole-topology simplification\s+checkpoint/,
    );
    const preflight = await fs.readFile(
      path.join(root, "skills/author-preflight.md"),
      "utf8",
    );
    expect(preflight).toContain("Publish no REV");
    expect(preflight).toMatch(/do not supply it to the independent\s+reviewer/);
    const lateSimplification = await fs.readFile(
      path.join(root, "prompts/simplify-architecture-and-interfaces.md"),
      "utf8",
    );
    expect(lateSimplification).toMatch(/complete\s+SYS set/);
    expect(lateSimplification).toContain("duplicate or mergeable statements");
  });

  it("applies ephemeral author preflight to every authored Lifecycle Data route", async () => {
    const root = path.join(process.cwd(), ".lifecycle/process");
    const processPackage = await canonicalProcessPackage();
    const nonAuthorRoutes = new Set([
      "create-review-context",
      "execute-verification-run",
      "review-datum-in-context",
      "simplify-architecture-and-interfaces",
    ]);
    const missing: string[] = [];
    for (const scenario of Object.values(processPackage.scenarios)) {
      const authored = (scenario.outputs as { types?: string[] }[]).some((output) =>
        (output.types ?? []).some((type) =>
          processPackage.types[type]?.lifecycle &&
          (processPackage.types[type].lifecycle as { authorship?: string }).authorship ===
            "authored"
        )
      );
      if (
        !authored || nonAuthorRoutes.has(scenario.id) ||
        typeof scenario.prompt_ref !== "string"
      ) continue;
      const promptPath = scenario.prompt_ref.replace(/@[1-9][0-9]*$/, "");
      const references = promptSkillReferences(
        await fs.readFile(path.join(root, promptPath), "utf8"),
      );
      if (!references.ok || !references.references.includes("skills/author-preflight.md@2")) {
        missing.push(`${scenario.id}@${scenario.version}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("keeps every bootstrap prompt skill declaration exact and resolvable", async () => {
    const root = path.join(process.cwd(), ".lifecycle/process");
    const manifest = parse(
      await fs.readFile(path.join(root, "manifest.yaml"), "utf8"),
    ) as { assets: { prompts: string[]; skills: string[] } };
    const declaredSkills = new Set(manifest.assets.skills);
    const diagnostics: string[] = [];

    for (const promptReference of manifest.assets.prompts) {
      const promptPath = promptReference.replace(/@[1-9][0-9]*$/, "");
      const frontmatter = markdownAssetFrontmatter(
        await fs.readFile(path.join(root, promptPath), "utf8"),
      )!;
      if (frontmatter.skills === undefined) continue;
      if (
        !Array.isArray(frontmatter.skills) ||
        frontmatter.skills.some((skill) => typeof skill !== "string")
      ) {
        diagnostics.push(`${promptReference}: skills must be an array of strings`);
        continue;
      }
      if (new Set(frontmatter.skills).size !== frontmatter.skills.length) {
        diagnostics.push(`${promptReference}: duplicate skill references`);
      }
      for (const skill of frontmatter.skills) {
        if (!declaredSkills.has(skill)) {
          diagnostics.push(`${promptReference}: undeclared ${skill}`);
        }
      }
    }

    expect(diagnostics).toEqual([]);
  });

  it("resolves ordered prompt-frontmatter skills as exact Assignment assets", async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-prompt-skills-"));
    temporaryRoots.push(parent);
    const root = await terminalProcessPackage(parent);
    const manifestPath = path.join(root, "manifest.yaml");
    const manifest = parse(await fs.readFile(manifestPath, "utf8"));
    manifest.assets.skills = [
      "skills/first.md@1",
      "skills/second.md@2",
    ];
    await fs.writeFile(manifestPath, stringify(manifest));
    const obligationPath = path.join(root, "obligations/terminal-check.yaml");
    const obligation = parse(await fs.readFile(obligationPath, "utf8"));
    obligation.satisfied_when = "false";
    await fs.writeFile(obligationPath, stringify(obligation));
    await fs.writeFile(
      path.join(root, "skills/first.md"),
      "---\nid: first\nversion: 1\n---\n\n# First skill\n",
    );
    await fs.writeFile(
      path.join(root, "skills/second.md"),
      "---\nid: second\nversion: 2\n---\n\n# Second skill\n",
    );
    await fs.writeFile(
      path.join(root, "prompts/record-terminal-item.md"),
      "---\nid: record-terminal-item\nversion: 1\nscenario: record-terminal-item\nskills: [skills/second.md@2, skills/first.md@1]\n---\n\n# Record item without body skill references\n",
    );

    const loaded = await loadProcessPackage(root);
    expect(loaded.ok, loaded.ok ? "" : JSON.stringify(loaded.diagnostics)).toBe(true);
    if (!loaded.ok) return;
    const snapshot = {
      processRef: "terminal-fixture@1.0.0#sha256:test",
      phaseId: "phase-0-terminal",
      records: [],
      dependencyComparisons: [],
    };
    const route = evaluateLifecycle(loaded.package, snapshot).obligations.find(
      (item) => item.obligation === "terminal-check",
    );
    expect(route).toBeDefined();
    const prepared = await dryRunResolverScenario(
      loaded.package,
      snapshot,
      "record-terminal-item@1",
      route!.id,
      [],
    );

    expect(prepared.ok, prepared.ok ? "" : JSON.stringify(prepared.diagnostics))
      .toBe(true);
    if (!prepared.ok) return;
    expect(prepared.value.prompt.skills).toEqual([
      expect.objectContaining({
        reference: "skills/second.md@2",
        content: expect.stringContaining("# Second skill"),
      }),
      expect.objectContaining({
        reference: "skills/first.md@1",
        content: expect.stringContaining("# First skill"),
      }),
    ]);

    await fs.writeFile(
      path.join(root, "prompts/record-terminal-item.md"),
      "---\nid: record-terminal-item\nversion: 1\nscenario: record-terminal-item\nskills: [skills/first.md@1, 42]\n---\n\n# Invalid skill declaration\n",
    );
    const malformed = await dryRunResolverScenario(
      loaded.package,
      snapshot,
      "record-terminal-item@1",
      route!.id,
      [],
    );
    expect(malformed.ok).toBe(false);
    expect(malformed.diagnostics).toContainEqual(expect.objectContaining({
      code: "prompt-skills-invalid",
      path: "prompts/record-terminal-item.md",
    }));

    await fs.writeFile(
      path.join(root, "prompts/record-terminal-item.md"),
      "---\nid: record-terminal-item\nversion: 1\nscenario: record-terminal-item\nnotes: 'Do not infer `skills/first.md@1` from metadata'\n---\n\nLoad `skills/second.md@2` from the body.\n",
    );
    const legacy = await dryRunResolverScenario(
      loaded.package,
      snapshot,
      "record-terminal-item@1",
      route!.id,
      [],
    );
    expect(legacy.ok, legacy.ok ? "" : JSON.stringify(legacy.diagnostics)).toBe(true);
    if (!legacy.ok) return;
    expect(legacy.value.prompt.skills.map((skill) => skill.reference)).toEqual([
      "skills/second.md@2",
    ]);
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
        name: "candidate",
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
      [{ name: "candidate", value: item.datum.revision_id }],
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
      [{ name: "candidate", value: item.datum.revision_id }],
    );
    expect(escaped.ok).toBe(false);
    expect(escaped.diagnostics).toContainEqual(expect.objectContaining({
      code: "policy-asset-outside-package",
      path: "guides/item-judgment.md",
    }));
  });
});
