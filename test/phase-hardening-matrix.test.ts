import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

type CoverageSection = {
  section: string;
  routes: string[];
  evidence: string[];
};

type CoverageManifest = {
  contract: "mdlm-phase-hardening-coverage@1";
  matrix: string;
  publicProcessSeam: string;
  sections: CoverageSection[];
  cleanPilot: {
    report: string;
    executableEvidence: string[];
    requiredObservations: Record<string, string[]>;
  };
};

const projectRoot = process.cwd();
const matrixPath = path.join(projectRoot, "docs/phase-hardening-matrix.md");
const coveragePath = path.join(projectRoot, "docs/phase-hardening-coverage.yaml");
const suitesPath = path.join(projectRoot, "vitest.suites.mjs");

function matrixRoutes(markdown: string) {
  const routes = new Map<string, string[]>();
  let section: string | undefined;
  for (const line of markdown.split("\n")) {
    if (line.startsWith("## ")) {
      section = line.slice(3);
      continue;
    }
    if (!section || !line.startsWith("| ") || line.startsWith("| ---")) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells[0] === "Route" || cells[0] === "Expected result") continue;
    if (cells.length >= 3) {
      const sectionRoutes = routes.get(section) ?? [];
      sectionRoutes.push(cells[0]!);
      routes.set(section, sectionRoutes);
    }
  }
  return routes;
}

describe("reusable Phase-hardening proof matrix", () => {
  it("binds every distinct route to registered executable evidence", async () => {
    const [markdown, source, suites] = await Promise.all([
      fs.readFile(matrixPath, "utf8"),
      fs.readFile(coveragePath, "utf8"),
      fs.readFile(suitesPath, "utf8"),
    ]);
    const manifest = parse(source) as CoverageManifest;
    expect(manifest.contract).toBe("mdlm-phase-hardening-coverage@1");
    expect(manifest.matrix).toBe("docs/phase-hardening-matrix.md");
    expect(manifest.publicProcessSeam).toBe(
      "mdlm init -> mdlm next -> mdlm scenario prepare -> mdlm scenario submit",
    );

    const routes = matrixRoutes(markdown);
    const coverage = new Map(manifest.sections.map((entry) => [entry.section, entry]));
    expect([...coverage.keys()].sort()).toEqual([...routes.keys()].sort());

    for (const [section, sectionRoutes] of routes) {
      expect(sectionRoutes.length, section).toBeGreaterThan(0);
      expect(coverage.get(section)!.routes, section).toEqual(sectionRoutes);
      expect(new Set(sectionRoutes).size, section).toBe(sectionRoutes.length);
      const evidence = coverage.get(section)!.evidence;
      expect(evidence.length, section).toBeGreaterThan(0);
      for (const testPath of evidence) {
        expect(suites, `${section}: ${testPath}`).toContain(`"${testPath}"`);
        const testSource = await fs.readFile(path.join(projectRoot, testPath), "utf8");
        expect(testSource, testPath).toMatch(/\b(?:it|test)(?:\.each)?\s*\(/);
      }
    }
  });

  it("keeps the clean pilot acceptance observations auditable", async () => {
    const [coverageSource, suites] = await Promise.all([
      fs.readFile(coveragePath, "utf8"),
      fs.readFile(suitesPath, "utf8"),
    ]);
    const manifest = parse(coverageSource) as CoverageManifest;
    expect(manifest.cleanPilot.report).toBe("docs/clean-pilot-103.md");
    await expect(fs.access(path.join(projectRoot, manifest.cleanPilot.report))).resolves
      .toBeUndefined();

    const required = [
      "attended-product-wayfinding",
      "fresh-delegated-review",
      "lifecycle-correction",
      "correction-escalation",
      "consolidated-checkpoint",
      "gate-rejection-return",
      "shared-requirement-impact",
      "formal-change",
      "doctor-commit-clean-state",
      "explicit-terminal-outcome",
    ];
    expect(Object.keys(manifest.cleanPilot.requiredObservations).sort()).toEqual(
      required.sort(),
    );
    for (const [observation, evidence] of Object.entries(
      manifest.cleanPilot.requiredObservations,
    )) {
      expect(evidence.length, observation).toBeGreaterThan(0);
      for (const testPath of evidence) {
        expect(manifest.cleanPilot.executableEvidence, observation).toContain(testPath);
        expect(suites, `${observation}: ${testPath}`).toContain(`"${testPath}"`);
      }
    }
  });
});
