import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const exampleRoot = path.join(process.cwd(), "examples/pi-operator");

async function read(relativePath: string): Promise<string> {
  return fs.readFile(path.join(exampleRoot, relativePath), "utf8");
}

describe("generic pi lifecycle operator instructions", () => {
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
