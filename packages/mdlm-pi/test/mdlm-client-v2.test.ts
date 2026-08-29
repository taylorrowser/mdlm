import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import type { JsonObject } from "../src/mdlm-client.js";
import { MdlmClient } from "../src/mdlm-client.js";

const fixtureRoot = path.resolve(import.meta.dirname, "../../../test/fixtures/operator-contract-v2");

it("transports only next, submit with out-of-band authority, and settlement", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mdlm-pi-client-v2-"));
  const script = path.join(root, "mdlm.mjs");
  const log = path.join(root, "calls.jsonl");
  const next = await readFile(path.join(fixtureRoot, "attention-required.json"), "utf8");
  const accepted = await readFile(path.join(fixtureRoot, "submission-accepted.json"), "utf8");
  await writeFile(script, `
import { appendFileSync } from "node:fs";
const args = process.argv.slice(2);
let input = "";
for await (const chunk of process.stdin) input += chunk;
appendFileSync(${JSON.stringify(log)}, JSON.stringify({ args, input }) + "\\n");
process.stdout.write(args[0] === "next" ? ${JSON.stringify(next)} : ${JSON.stringify(accepted)});
`);
  const client = new MdlmClient({
    repository: root,
    command: { program: process.execPath, arguments: [script] },
  });

  const outcome = await client.next();
  if (outcome.outcome !== "attention-required") throw new Error("fixture changed");
  const scaffold = outcome.assignment.packet.responseScaffold;
  if (typeof scaffold !== "object" || scaffold === null || Array.isArray(scaffold)) {
    throw new Error("fixture response scaffold changed");
  }
  const response: JsonObject = scaffold;
  await client.submit(client.prepareSubmission(response), "stakeholder");
  await client.settlement("33333333-3333-4333-8333-333333333333");

  const calls = (await readFile(log, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  expect(calls.map((call) => call.args)).toEqual([
    ["next", "--json"],
    ["scenario", "submit", "-", "--authority", "stakeholder", "--json"],
    ["scenario", "settlement", "33333333-3333-4333-8333-333333333333", "--json"],
  ]);
  expect(JSON.parse(calls[1].input)).toEqual(response);
});
