import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const exampleRoot = path.join(process.cwd(), "examples/pi-operator");

async function read(relativePath: string): Promise<string> {
  return fs.readFile(path.join(exampleRoot, relativePath), "utf8");
}

describe("generic pi lifecycle operator instructions", () => {
  it("declare one continuous public-interface loop with exact stop boundaries", async () => {
    const prompt = await read(".pi/prompts/mdlm.md");
    const agentContext = await read("AGENTS.md");
    const combined = `${prompt}\n${agentContext}`;
    const normalizedPrompt = prompt.replace(/\s+/g, " ");

    expect(normalizedPrompt).toContain("./bin/req next --json");
    expect(normalizedPrompt).toContain("scenario dry-run");
    expect(normalizedPrompt).toContain("scenario execute");
    expect(normalizedPrompt).toContain("./bin/req doctor --json");
    expect(normalizedPrompt).toContain("git status --porcelain");
    expect(normalizedPrompt).toContain("git add -A");
    expect(normalizedPrompt).toContain("git diff --cached --check");
    expect(normalizedPrompt).toContain("git commit -m");
    expect(normalizedPrompt).toContain("one atomic transaction");
    expect(normalizedPrompt).toContain("not one assistant turn");
    expect(normalizedPrompt).toContain("standingDelegation");
    expect(normalizedPrompt).toContain("--delegation");
    expect(normalizedPrompt).toContain("fresh read-only pi session");
    expect(normalizedPrompt).toContain("pi -p --no-session --no-tools");
    expect(normalizedPrompt).toContain("currently reached checkpoint");
    expect(normalizedPrompt).toContain("consolidationGroup");
    expect(normalizedPrompt).toContain("./bin/req loose-ends --json");
    expect(normalizedPrompt).toContain("nondelegable Authority Requirement");
    expect(normalizedPrompt).toContain("Resume the loop immediately");
    expect(normalizedPrompt).toContain("completed profile boundary");
    expect(normalizedPrompt).toContain("genuine ambiguity or command failure");
    expect(agentContext).toContain("public `req` commands");
    expect(agentContext).toContain("Never inspect raw Process Package YAML");

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
