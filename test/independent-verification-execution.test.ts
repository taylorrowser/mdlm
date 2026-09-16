import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, mkdir, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { captureVerificationReport, verificationReportOutcome, type IndependentVerification } from "../src/independent-verification-execution.js";
import { runVerificationReceipt, validateVerificationReceipt, type VerificationBinding } from "../src/verification-receipt.js";

const definition: IndependentVerification = {activityRevision: "VFY-test-r00001", repositoryPath: "/unused", sourceCommit: "a".repeat(40), scriptPath: "verify.py", command: ["python3", "verify.py"], caseIds: ["first", "second"], resultsPath: "results.json"};
const row = (id: string, outcome = "pass", refs: string[] = []) => ({case_id: id, outcome, actual_results: ["Observed output"], evidence_refs: refs});

it("requires exact complete case results and preserves incomplete observations", async () => {
  const root = await mkdtemp(join(tmpdir(), "mdlm-case-report-"));
  const capture = async (cases: unknown[]) => {
    await writeFile(join(root, "results.json"), JSON.stringify({contract: "mdlm-verification-results@1", cases}));
    return captureVerificationReport(root, definition);
  };
  const pass = await capture([row("first"), row("second")]);
  expect(verificationReportOutcome(pass, 0)).toEqual({outcome: "pass"});
  expect(verificationReportOutcome(pass, 1).outcome).toBe("error");
  expect(verificationReportOutcome(await capture([row("first", "fail"), row("second")]), 1)).toEqual({outcome: "fail"});
  for (const outcome of ["error", "skipped"]) {
    const incomplete = await capture([row("first", outcome), row("second")]);
    expect(verificationReportOutcome(incomplete, 2).outcome).toBe("error");
    expect(incomplete.caseResults[0]!.outcome).toBe(outcome);
  }
  for (const cases of [[row("first")], [row("first"), row("first"), row("second")], [row("first"), row("second"), row("unknown")]]) {
    const invalid = await capture(cases);
    expect(verificationReportOutcome(invalid, 0).outcome).toBe("error");
    expect(invalid.rawReportBase64).toBeTruthy();
  }
  await writeFile(join(root, "results.json"), "not JSON");
  expect((await captureVerificationReport(root, definition)).rawReportBase64).toBe(Buffer.from("not JSON").toString("base64"));
});

it("captures exact artifact bytes and rejects unavailable or escaping evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "mdlm-case-artifact-"));
  await writeFile(join(root, "actual.txt"), "actual observation\n");
  const capture = async (ref: string) => {
    await writeFile(join(root, "results.json"), JSON.stringify({contract: "mdlm-verification-results@1", cases: [row("first", "pass", [ref]), row("second")]}));
    return captureVerificationReport(root, definition);
  };
  const report = await capture("actual.txt");
  expect(report.artifacts).toEqual([{path: "actual.txt", bytes: 19, sha256: createHash("sha256").update("actual observation\n").digest("hex"), contentBase64: Buffer.from("actual observation\n").toString("base64")}]);
  await symlink("actual.txt", join(root, "link.txt"));
  for (const ref of ["missing.txt", "../actual.txt", "link.txt"]) expect(verificationReportOutcome(await capture(ref), 0).outcome).toBe("error");
  await writeFile(join(root, "large.bin"), Buffer.alloc(8 * 1024 * 1024));
  expect((await capture("large.bin")).diagnostic).toContain("8 MiB");
});

it("executes two immutable repositories, captures cases/artifact and settles without replay", async () => {
  const root = await mkdtemp(join(tmpdir(), "mdlm-independent-docker-"));
  const product = join(root, "product"), verifier = join(root, "verifier"), lifecycle = join(root, "lifecycle");
  for (const path of [product, verifier, lifecycle]) { await mkdir(path); execFileSync("git", ["-C", path, "init", "-q"]); }
  const git = (path: string, ...args: string[]) => execFileSync("git", ["-C", path, ...args], {encoding: "utf8"}).trim();
  const commit = (path: string) => { git(path, "add", "."); git(path, "-c", "user.name=MDLM fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture"); return git(path, "rev-parse", "HEAD"); };
  await writeFile(join(product, "app.py"), "print(30)\n");
  const sourceCommit = commit(product);
  await writeFile(join(verifier, "verify.py"), `import json, os, pathlib, subprocess, sys
actual = subprocess.check_output([sys.executable, os.environ["MDLM_PRODUCT_DIR"] + "/app.py"], text=True)
evidence = pathlib.Path(os.environ["MDLM_EVIDENCE_DIR"])
(evidence / "actual.txt").write_text(actual)
passed = actual == "30\\n"
rows = [{"case_id": "first", "outcome": "pass" if passed else "fail", "actual_results": [actual], "evidence_refs": ["actual.txt"]}, {"case_id": "second", "outcome": "pass", "actual_results": ["Process completed"], "evidence_refs": []}]
(evidence / "results.json").write_text(json.dumps({"contract": "mdlm-verification-results@1", "cases": rows}))
print("Independent verification executed")
sys.exit(0 if passed else 1)
`);
  const verifierCommit = commit(verifier);
  const independentVerification = {...definition, repositoryPath: verifier, sourceCommit: verifierCommit};
  const binding: VerificationBinding = {operation: "independent-proof", package: {reference: "fixture@1"}, inputs: ["IMP-test-r00001", definition.activityRevision], repositoryPath: product, sourceCommit,
    image: "python@sha256:7415fbc3c9e4979cc717d92377ab2bc7b2b4a2af1ac03cc52b5f3f88efedaf3a", independentVerification};
  await writeFile(join(product, "app.py"), "raise Exception('mutable product must not execute')\n");
  await writeFile(join(verifier, "verify.py"), "raise Exception('mutable verifier must not execute')\n");
  const saved = await runVerificationReceipt(lifecycle, binding, false);
  const result = saved.receipt.result!;
  await writeFile(join(root, "pass-evidence.json"), JSON.stringify(saved, null, 2));
  console.log(`Independent verification evidence: ${root}`);
  expect(result, JSON.stringify(result)).toMatchObject({outcome: "pass", sourceCommit, independentVerification: {sourceCommit: verifierCommit}, caseResults: [{case_id: "first", outcome: "pass"}, {case_id: "second", outcome: "pass"}]});
  expect(Buffer.from(result.artifacts![0]!.contentBase64, "base64").toString()).toBe("30\n");
  expect((await runVerificationReceipt(lifecycle, binding, false)).oid).toBe(saved.oid);
  expect((await validateVerificationReceipt(binding, saved)).caseResults).toEqual(result.caseResults);
  await expect(runVerificationReceipt(lifecycle, {...binding, independentVerification: {...independentVerification, caseIds: ["first"]}}, false)).rejects.toThrow("do not match");
  await writeFile(join(product, "app.py"), "print(31)\n");
  const failingCommit = commit(product);
  const failed = await runVerificationReceipt(lifecycle, {...binding, operation: "independent-mismatch", sourceCommit: failingCommit}, false);
  await writeFile(join(root, "fail-evidence.json"), JSON.stringify(failed, null, 2));
  expect(failed.receipt.result, JSON.stringify(failed)).toMatchObject({outcome: "fail", caseResults: [{case_id: "first", outcome: "fail"}, {case_id: "second", outcome: "pass"}]});
}, 60_000);
