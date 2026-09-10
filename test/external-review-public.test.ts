import { spawnSync, execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { expect, it } from "vitest";

const executable = process.env.MDLM_EXTERNAL_REVIEW_TEST_EXECUTABLE ?? path.resolve("dist/mdlm.js");
it("requires a registered exact external FAIL verdict before review publication", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-external-review-"));
  const lifecycle = path.join(root, "lifecycle"), registry = path.join(root, "manager");
  await fs.mkdir(lifecycle); await fs.mkdir(registry);
  const environment: NodeJS.ProcessEnv = {...process.env, MDLM_REVIEW_REGISTRY: registry};
  delete environment.MDLM_REVIEW_REGISTRAR;
  const trace: unknown[] = [];
  function cli(args: string[], input?: string, manager = false, registryEnabled = true) {
    const env: NodeJS.ProcessEnv = {...environment, ...(manager ? {MDLM_REVIEW_REGISTRAR: "1"} : {})};
    if (!registryEnabled) delete env.MDLM_REVIEW_REGISTRY;
    const result = spawnSync(process.execPath, [executable, ...args, "--json"], {cwd: lifecycle, input, env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024});
    expect(result.error).toBeUndefined(); expect(result.stderr).toBe("");
    const value = JSON.parse(result.stdout);
    trace.push({args, status: result.status, value});
    return {status: result.status, value};
  }
  function commit() {
    execFileSync("git", ["-C", lifecycle, "add", ".lifecycle/data"]);
    execFileSync("git", ["-C", lifecycle, "-c", "user.name=Test", "-c", "user.email=test@localhost", "-c", "commit.gpgSign=false", "commit", "--quiet", "--no-verify", "-m", "Fixture publication"]);
  }
  const transactions = () => fs.readdir(path.join(lifecycle, ".lifecycle/data/.transactions"));
  try {
    expect(cli(["init", "."]).status).toBe(0);
    const initial = cli(["next"]).value;
    const authored = {outputs: [
      {slot: "requirements", handle: "need", payload: {title: "Greeting", kind: "stakeholder", statement: "Print a greeting."}, body: ""},
      {slot: "requirements", handle: "greeting", payload: {title: "Output", kind: "software", ears: {pattern: "ubiquitous", system: "the greeter", response: "print hello"}}, body: ""},
      {slot: "decompositions", handle: "group", payload: {title: "Greeting allocation"}, links: [{type: "parent", target: {output: "need"}}, {type: "child", target: {output: "greeting"}}], body: ""},
    ], completionEvidence: null};
    expect(initial.assignment).toBeDefined();
    expect(cli(["assignment", "submit-proposal", "-"], JSON.stringify(authored)).value.outcome).toBe("accepted");
    commit();
    const next = cli(["next"]).value;
    const id = next.assignment.id;
    const verdict = structuredClone(next.assignment.packet.authorValuesScaffold);
    const payload = verdict.outputs[0].payload;
    Object.assign(payload, {title: "Review", outcome: "fail", findings: "The greeting requirement omits the required newline."});
    for (const row of payload.requirement_assessments) Object.assign(row, {disposition: "needs-change", rationale: "The greeting contract needs a newline."});
    for (const group of payload.decomposition_assessments) {
      Object.assign(group, {disposition: "needs-change", membership_action: "none", rationale: "Clarify the existing output child."});
      for (const row of group.children) Object.assign(row, {disposition: "needs-change", rationale: "Specify the newline."});
    }
    verdict.completionEvidence = null;
    const source = JSON.stringify(verdict) + "\n";
    const before = await transactions();
    const leasePath = path.join(lifecycle, ".lifecycle/work/active-assignment.json");
    const lease = await fs.readFile(leasePath, "utf8");
    const rejected = cli(["assignment", "submit-proposal", "-"], source);
    expect(rejected.value.diagnostics?.[0]?.code, JSON.stringify(rejected)).toBe("external-review-required");
    expect(await transactions()).toEqual(before);
    expect(await fs.readFile(leasePath, "utf8")).toBe(lease);
    expect(cli(["assignment", "submit-proposal", "-"], source, false, false).value.diagnostics[0].code).toBe("external-review-required");
    const selfClaim = structuredClone(verdict); selfClaim.completionEvidence = {reviewer: "independent", sha256: "a".repeat(64)};
    expect(cli(["assignment", "submit-proposal", "-"], JSON.stringify(selfClaim)).value.diagnostics[0].code).toBe("external-review-required");
    const context = cli(["assignment", "review-context", id]).value;
    const contextFile = path.join(registry, "context.json"), verdictFile = path.join(registry, "verdict.json");
    await fs.writeFile(contextFile, JSON.stringify(context)); await fs.writeFile(verdictFile, source);
    const register = ["assignment", "register-review", id, contextFile, verdictFile];
    expect(cli(register).value.diagnostics[0].code).toBe("external-review-registration-invalid");
    const wrong = structuredClone(context); wrong.reviewContext.fullPacket.sha256 = "a".repeat(64);
    await fs.writeFile(contextFile, JSON.stringify(wrong));
    expect(cli(register, undefined, true).value.diagnostics[0].code).toBe("external-review-registration-invalid");
    await fs.writeFile(contextFile, JSON.stringify(context));
    expect(cli(register, undefined, true).status).toBe(0);
    expect(await fs.readFile(leasePath, "utf8")).toBe(lease);
    const firstVerdict = structuredClone(verdict); firstVerdict.outputs[0].payload.findings = "Earlier reviewer wording";
    await fs.writeFile(verdictFile, JSON.stringify(firstVerdict));
    expect(cli(register, undefined, true).status).toBe(0);
    expect(cli(["assignment", "submit-proposal", "-"], source).value.diagnostics[0].code).toBe("external-review-required");
    await fs.writeFile(verdictFile, source);
    expect(cli(register, undefined, true).status).toBe(0);
    expect((await fs.readdir(path.join(registry, "artifacts"))).length).toBe(2);
    const recordFile = path.join(registry, `${id}.json`);
    const recordBytes = await fs.readFile(recordFile, "utf8");
    const record = JSON.parse(recordBytes);
    record.contextSha256 = "a".repeat(64); await fs.writeFile(recordFile, JSON.stringify(record));
    expect(cli(["assignment", "submit-proposal", "-"], source).value.diagnostics[0].code).toBe("external-review-required");
    await fs.writeFile(recordFile, recordBytes);
    expect(cli(["assignment", "submit-proposal", "-"], source + " ").value.diagnostics[0].code).toBe("external-review-required");
    const changed = structuredClone(verdict); changed.outputs[0].payload.findings = "Different judgment";
    expect(cli(["assignment", "submit-proposal", "-"], JSON.stringify(changed)).value.diagnostics[0].code).toBe("external-review-required");
    const diagnostic = await fs.readFile(path.join(lifecycle, ".lifecycle/work/assignment-response.json"), "utf8");
    expect(cli(["scenario", "submit", "-"], diagnostic).value.diagnostics[0].code).toBe("external-review-required");
    expect(await transactions()).toEqual(before); expect(await fs.readFile(leasePath, "utf8")).toBe(lease);
    const accepted = cli(["assignment", "submit-proposal", "-"], source);
    expect(accepted.value.outcome, JSON.stringify(accepted)).toBe("accepted");
    const after = await transactions();
    const execution = JSON.parse(await fs.readFile(path.join(lifecycle, ".lifecycle/data/.transactions", after.find(value => !before.includes(value))!, "execution.json"), "utf8"));
    expect(execution.externalReview).toMatchObject({contract: "mdlm-registered-review@1", assignment: id, verdictSha256: JSON.parse(recordBytes).verdictSha256});
    expect(execution.outputs[0].data.payload.outcome).toBe("fail");
    expect(await fs.readFile(recordFile, "utf8")).toBe(recordBytes);
    expect(cli(["assignment", "submit-proposal", "-"], source).status).not.toBe(0);
    expect(await transactions()).toEqual(after);
    commit();
    expect(cli(["next"]).value.assignment.packet.scenario.reference).toBe("correct-requirements-after-review@1");
    expect(cli(register, undefined, true).value.diagnostics[0].code).toBe("assignment-unavailable");
  } finally {
    // Preserve both successful and failing public transaction evidence for audit.
    await fs.writeFile(path.join(root, "command-trace.json"), JSON.stringify({executable, trace}, null, 2));
    console.log(`External review transaction evidence: ${root}`);
  }
}, 120_000);
