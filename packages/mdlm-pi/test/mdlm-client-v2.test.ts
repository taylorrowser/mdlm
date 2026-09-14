import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { MdlmClient } from "../src/mdlm-client.js";

it("transports direct commands and exact proposal bytes with explicit authority", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mdlm-client-direct-"));
  const script = path.join(root, "cli.mjs");
  const log = path.join(root, "calls.jsonl");
  await writeFile(script, `import { appendFileSync } from 'node:fs';
let input=''; for await (const chunk of process.stdin) input+=chunk;
appendFileSync(${JSON.stringify(log)},JSON.stringify({args:process.argv.slice(2),input})+'\\n');
process.stdout.write(JSON.stringify({ok:true}));`);
  const client = new MdlmClient({ repository: root, command: { program: process.execPath, arguments: [script] } });
  await client.discover(); await client.guidance("review", "REQ-A-r00001");
  const proposal = client.prepareSubmission({ operation: "op", candidates: [] });
  await client.submit(proposal, "stakeholder"); await client.settlement("op");
  await client.execute("IMP-A-r00001", "run"); await client.executionSettlement("run");
  const calls = (await readFile(log, "utf8")).trim().split("\n").map(line => JSON.parse(line));
  expect(calls.map(call => call.args)).toEqual([
    ["expectations", "--json"], ["expectations", "show", "review", "REQ-A-r00001", "--json"],
    ["proposal", "submit", "-", "--authority", "stakeholder", "--json"], ["proposal", "settlement", "op", "--json"],
    ["execution", "run", "IMP-A-r00001", "run", "--json"], ["execution", "settlement", "run", "--json"],
  ]);
  expect(calls[2].input).toBe(proposal.source);
  await expect(client.submit({ ...proposal, source: "{}" })).rejects.toThrow("digest");
});
