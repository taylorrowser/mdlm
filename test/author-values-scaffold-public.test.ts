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
  function cli(args: string[], cwd = repository, input?: unknown, expectedStatus = 0) {
    const result = spawnSync(process.execPath, [executable, ...args], {
      cwd, input: input === undefined ? undefined : JSON.stringify(input),
      encoding: "utf8", timeout: 30_000,
    });
    expect(result.status, result.stderr || result.stdout).toBe(expectedStatus);
    return JSON.parse(result.stdout);
  }
  try {
    cli(["init", repository, "--json"], root);
    const packet = cli(["next", "--json"]).assignment.packet;
    const authored = structuredClone(packet.authorValuesScaffold);
    expect(authored).toBeDefined();
    expect(authored.outputs[0]).toEqual({
      slot: "requirements", payload: {
        title: null, intent: null, source: null, commitments: null, outcomes: null,
      }, body: "",
    });
    Object.assign(authored.outputs[0].payload, {
      title: "ASCII space counter",
      intent: "Count ASCII spaces in standard input.",
      source: "Stakeholder requests an ASCII space counter.",
      outcomes: [{ id: "O1", statement: "Count spaces." }],
      commitments: [{ id: "R1", level: "software", outcome_ids: ["O1"], parent_ids: [], ears: { pattern: "ubiquitous", system: "the counter", response: "print the ASCII space count followed by newline" } }],
    });
    authored.completionEvidence = { summary: "Requirements capture the stakeholder request." };
    const validate = new Ajv2020({ strict: false }).compile(packet.authorValuesSchema);
    expect(validate(authored), JSON.stringify(validate.errors)).toBe(true);
    const withFixedPayload = structuredClone(authored);
    withFixedPayload.outputs[0].payload.publication = "recorded";
    expect(validate(withFixedPayload)).toBe(false);
    const fullResponse = packet.responseScaffold;
    expect(validate(fullResponse)).toBe(false);
    const missingTrigger = structuredClone(authored);
    missingTrigger.outputs[0].payload.commitments[0].ears.pattern = "event";
    const malformed = cli(["assignment", "submit-proposal", "-", "--json"], repository, missingTrigger, 1);
    expect(malformed.outcome).toBe("rejected");
    expect(JSON.stringify(malformed.diagnostics)).toContain("/ears/event");
    const duplicate = structuredClone(authored);
    duplicate.outputs[0].payload.commitments.push(duplicate.outputs[0].payload.commitments[0]);
    const rejected = cli(["assignment", "submit-proposal", "-", "--json"], repository, duplicate, 1);
    expect(rejected.outcome).toBe("rejected");
    expect(JSON.stringify(rejected.diagnostics)).toContain("Duplicate local key");
    expect(cli(["list", "--json"]).data).toEqual([]);
    const submitted = cli(["assignment", "submit-proposal", "-", "--json"], repository, authored);
    expect(submitted.outcome).toBe("accepted");
    const listed = cli(["list", "--json"]);
    const revision = listed.data[0].lifecycleDatum.datum.revision_id;
    const shown = cli(["show", revision, "--json"]);
    expect(shown.projections.views[1].rows[0].at(-1)).toBe("the counter shall print the ASCII space count followed by newline.");
    expect(packet.schemas.REQ.payloadCollections).toBeDefined();
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
