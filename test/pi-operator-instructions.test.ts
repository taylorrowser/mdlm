import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { executeCommandApplication } from "../src/command-application.js";

const exampleRoot = path.join(process.cwd(), "examples/pi-operator");
const processRoot = path.join(process.cwd(), ".lifecycle/process/prompts");

async function read(relativePath: string): Promise<string> {
  return fs.readFile(path.join(exampleRoot, relativePath), "utf8");
}

async function promptSources(directory = processRoot): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const sources = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory()
      ? promptSources(target)
      : entry.name.endsWith(".md")
      ? [await fs.readFile(target, "utf8")]
      : [];
  }));
  return sources.flat();
}

describe("generic pi lifecycle operator instructions", () => {
  it("keeps bundled attended prompts on the public submission contract", async () => {
    const rejected = await executeCommandApplication(
      ["scenario", "submit", "--authorize", "stakeholder", "--json"],
      process.cwd(),
    );

    expect(rejected.exitCode).toBe(1);
    expect(JSON.parse(rejected.output)).toEqual(expect.objectContaining({
      command: "scenario.submit",
      diagnostics: [expect.objectContaining({
        code: "scenario-submit-arguments-invalid",
      })],
    }));

    const prompts = await promptSources();

    expect(prompts.join("\n")).not.toContain("--authorize");
    for (const prompt of [
      "approve-change-request.md",
      "decide-pilot-expansion.md",
      "record-consequential-decision.md",
      "record-gate-signoff.md",
    ]) {
      const source = await fs.readFile(path.join(processRoot, prompt), "utf8");
      expect(source).toContain("`authoritySupplies`");
      expect(source).toContain("`mdlm scenario submit [response-file|-] --json`");
    }
  });

  it("declare one continuous clean-interface loop with exact stop boundaries", async () => {
    const prompt = await read(".pi/prompts/mdlm.md");
    const agentContext = await read("AGENTS.md");
    const combined = `${prompt}\n${agentContext}`;
    const normalized = combined.replace(/\s+/g, " ");

    for (const instruction of [
      "git status --porcelain",
      "mdlm status --json",
      "mdlm next --json",
      "mdlm scenario prepare",
      "mdlm scenario submit",
      "mdlm-assignment-response@1",
      "mdlm doctor",
      "git diff --cached --check",
      "one atomic publication transaction",
      "fresh read-only session",
      "Attention Required",
      "Profile Boundary Reached",
      "Lifecycle Complete",
      "Process Dead End",
      "typed inability",
      "genuine ambiguity",
    ]) {
      expect(normalized).toContain(instruction);
    }
    expect(agentContext).toContain("public `mdlm` executable");
    expect(agentContext.replace(/\s+/g, " ")).toContain(
      "Never inspect or edit Lifecycle Data directly",
    );
    expect(agentContext).toContain("inspect raw Process Package definitions");

    for (const prohibited of [
      "./bin/req",
      "scenario dry-run",
      "scenario execute",
      "--adapter",
      "process install",
      "process use",
      "public `req` commands",
    ]) {
      expect(combined).not.toContain(prohibited);
    }

    for (const packageSpecificTerm of [
      "mdlm-bootstrap",
      "phase-0-wayfinding",
      "chart-wayfinding-map",
      ".mdlm-phase",
      "PILOT.md",
      "temperature",
    ]) {
      expect(combined).not.toContain(packageSpecificTerm);
    }
  });
});
