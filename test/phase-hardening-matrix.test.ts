import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

type MatrixRow = {
  section: string;
  route: string;
  evidence: string;
  processRoute: string;
  outcome: string;
  reuse: string;
};

const projectRoot = process.cwd();
const matrixPath = path.join(projectRoot, "docs/phase-hardening-matrix.md");

function rows(markdown: string): MatrixRow[] {
  const result: MatrixRow[] = [];
  let section: string | undefined;
  for (const line of markdown.split("\n")) {
    if (line.startsWith("## ")) {
      section = line.slice(3);
      continue;
    }
    if (!section || !line.startsWith("| ") || line.startsWith("| ---")) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells[0] === "Route" || cells[0] === "Expected result") continue;
    if (cells.length === 5) {
      result.push({
        section,
        route: cells[0]!,
        evidence: cells[1]!,
        processRoute: cells[2]!,
        outcome: cells[3]!,
        reuse: cells[4]!,
      });
    }
  }
  return result;
}

describe("Phase-hardening matrix", () => {
  it("names exact package definitions for every implemented route", async () => {
    const markdown = await fs.readFile(matrixPath, "utf8");
    const matrixRows = rows(markdown);
    expect(matrixRows.length).toBeGreaterThan(0);

    const definitions = new Set<string>();
    for (const directory of [
      "obligations",
      "phases",
      "policies",
      "profiles",
      "scenarios",
      "selectors",
      "states",
    ]) {
      const root = path.join(projectRoot, ".lifecycle/process", directory);
      for (const file of await fs.readdir(root)) {
        if (!file.endsWith(".yaml")) continue;
        const definition = parse(await fs.readFile(path.join(root, file), "utf8")) as {
          id?: string;
          version?: number;
        };
        if (definition.id && definition.version) {
          definitions.add(`${definition.id}@${definition.version}`);
        }
      }
    }

    for (const row of matrixRows) {
      expect(row.evidence, `${row.section}: ${row.route}: evidence`).not.toBe("");
      expect(row.outcome, `${row.section}: ${row.route}: outcome`).not.toBe("");
      expect(row.reuse, `${row.section}: ${row.route}: reuse`).not.toBe("");
      if (row.section === "Transport and liveness invariants") continue;

      const references = [...row.processRoute.matchAll(
        /`([a-z][a-z0-9-]*@[1-9][0-9]*)`/g,
      )].map((match) => match[1]!);
      expect(references.length, `${row.section}: ${row.route}`).toBeGreaterThan(0);
      for (const reference of references) {
        expect(definitions, `${row.section}: ${row.route}: ${reference}`)
          .toContain(reference);
      }
    }
  });

  it("keeps executable evidence at the public seam without runtime consumers", async () => {
    const markdown = await fs.readFile(matrixPath, "utf8");
    expect(markdown).toContain("## Executable evidence");
    expect(markdown).toContain("`test/mdlm-review-correction.test.ts`");
    expect(markdown).toContain("`test/mdlm-phase-1-assurance-correction.test.ts`");
    expect(markdown).toContain("`test/mdlm-phase-2-simplification.test.ts`");
    expect(markdown).toContain("`test/mdlm-pilot-assessment.test.ts`");

    const runtimeReferences = await Promise.all(
      (await fs.readdir(path.join(projectRoot, "src")))
        .filter((file) => file.endsWith(".ts"))
        .map((file) => fs.readFile(path.join(projectRoot, "src", file), "utf8")),
    );
    expect(runtimeReferences.join("\n")).not.toContain("phase-hardening-matrix");
  });
});
