import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { RunJournal } from "../src/run-journal.js";

it("records only the pre-submit, submitting, and settlement-required states", async () => {
  const journal = new RunJournal(await mkdtemp(path.join(os.tmpdir(), "mdlm-pi-journal-")));
  const digest = `sha256:${"a".repeat(64)}` as const;
  await journal.capture("assignment-a", digest);
  await expect(journal.load()).resolves.toMatchObject({ phase: "captured" });
  await journal.beginSubmission();
  await expect(journal.load()).resolves.toMatchObject({ phase: "submitting" });
  await journal.requireSettlement("execution-a");
  await expect(journal.load()).resolves.toEqual({
    contract: "mdlm-pi-submission-journal@1",
    phase: "settlement-required",
    assignmentId: "assignment-a",
    responseDigest: digest,
    settlementIdentity: "execution-a",
  });
  await journal.clear();
  await expect(journal.load()).resolves.toBeNull();
});
