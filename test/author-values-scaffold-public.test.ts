import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { expect, it } from "vitest";

it("fills the emitted author scaffold and submits it without structural repair", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-author-scaffold-"));
  const repository = path.join(root, "lifecycle");
  const executable = path.join(process.cwd(), "dist/mdlm.js");
  function cli(args: string[], cwd = repository, input?: unknown) {
    const result = spawnSync(process.execPath, [executable, ...args], {
      cwd, input: input === undefined ? undefined : JSON.stringify(input),
      encoding: "utf8", timeout: 30_000,
    });
    expect(result.status, result.stderr || result.stdout).toBe(0);
    return JSON.parse(result.stdout);
  }
  try {
    cli(["init", repository, "--json"], root);
    const packet = cli(["next", "--json"]).assignment.packet;
    const authored = structuredClone(packet.authorValuesScaffold);
    expect(authored).toBeDefined();
    expect(authored.outputs[0]).toEqual({
      slot: "requirements", payload: {
        title: null, intent: null, source: null, commitments: null, cases: null,
      }, body: "",
    });
    Object.assign(authored.outputs[0].payload, {
      title: "ASCII space counter",
      intent: "Count ASCII spaces in standard input.",
      source: "Stakeholder requests an ASCII space counter.",
      commitments: ["Print the ASCII space count followed by newline."],
      cases: [{ id: "empty", stdin: "", stdout: "0\n", stderr: "", exit_code: 0 }],
    });
    authored.completionEvidence = { summary: "Requirements capture the stakeholder request." };
    const validate = new Ajv2020({ strict: false }).compile(packet.authorValuesSchema);
    expect(validate(authored), JSON.stringify(validate.errors)).toBe(true);
    const withFixedPayload = structuredClone(authored);
    withFixedPayload.outputs[0].payload.publication = "recorded";
    expect(validate(withFixedPayload)).toBe(false);
    const fullResponse = packet.responseScaffold;
    expect(validate(fullResponse)).toBe(false);
    const submitted = cli(["assignment", "submit-proposal", "-", "--json"], repository, authored);
    expect(submitted.outcome).toBe("accepted");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
