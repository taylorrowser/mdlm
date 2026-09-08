import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
import { requireVerificationReceipt, runVerificationReceipt } from "../src/verification-receipt.js";

it("preserves an unexecuted source error for correction and retries only explicitly", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-receipt-"));
  try {
    execFileSync("git", ["init", "--quiet", root]);
    const binding = {assignment: "source-error", package: "test@1", inputs: ["IMP-exact", "REQ-exact"], repositoryPath: root, sourceCommit: "0".repeat(40), image: `python@sha256:${"a".repeat(64)}`, command: ["python3", "verify.py"], scriptPath: "verify.py"};
    const first = await runVerificationReceipt(root, binding, false);
    expect(first.receipt.result).toMatchObject({outcome: "error", started: false, phase: "source", sourceTree: null, scriptSha256: null});
    expect((await requireVerificationReceipt(root, binding)).outcome).toBe("error");
    expect(await runVerificationReceipt(root, binding, false)).toEqual(first);
    const retry = await runVerificationReceipt(root, binding, true);
    expect(retry.receipt.attempt).toBe(2);
    expect(retry.oid).not.toBe(first.oid);
    expect(JSON.parse(execFileSync("git", ["-C", root, "cat-file", "blob", first.oid], {encoding: "utf8"}))).toEqual(first.receipt);
  } finally { await fs.rm(root, {recursive: true, force: true}); }
});
