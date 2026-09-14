import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { RunJournal } from "../src/run-journal.js";

it("durably distinguishes captured input from an operation that may have started", async () => {
  const journal = new RunJournal(await mkdtemp(path.join(os.tmpdir(), "mdlm-pi-journal-")));
  const digest = `sha256:${"a".repeat(64)}` as const;
  const boundary = { package: { reference: "package@1" }, snapshot: "base", transport: { repository: "/repo", command: { program: "mdlm", arguments: [] } } };
  await journal.capture("operation-a", digest, boundary);
  await expect(journal.load()).resolves.toMatchObject({ phase: "captured" });
  await journal.beginSubmission();
  await expect(journal.load()).resolves.toEqual({ contract: "mdlm-pi-operation-journal@1", phase: "submitting", kind: "proposal", operation: "operation-a", proposalDigest: digest, ...boundary });
  await journal.clear();
  await expect(journal.load()).resolves.toBeNull();
});
