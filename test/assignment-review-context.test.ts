import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { executeCommandApplication } from "../src/command-application.js";
import { canonicalReviewPacket } from "../src/assignment-review-context.js";

// Test the review export, not Docker. Source authentication remains real.
vi.mock("../src/docker-verification.js", async importOriginal => {
  const actual = await importOriginal<typeof import("../src/docker-verification.js")>();
  return {...actual, executeDockerVerification: vi.fn(async input => ({
    ...await actual.authenticateVerificationSource(input), image: input.image,
    imageDigest: input.image.split("@")[1], imageId: "sha256:test-image", command: input.command,
    scriptPath: input.scriptPath, stdoutBase64: Buffer.from("PASS\n").toString("base64"),
    stderrBase64: "", exitCode: 0, outcome: "pass", started: true, phase: "execution",
    startedAt: "2026-09-10T00:00:00.000Z", finishedAt: "2026-09-10T00:00:01.000Z",
  }))};
});

type Json = Record<string, any>;
const measurements: Record<string, string | number>[] = [];
function measure(label: string, packet: Json, context: Json) {
  const {sources, verificationReceipts, ...semanticContext} = context;
  const size = (value: unknown) => Buffer.byteLength(JSON.stringify(value));
  measurements.push({review: label, fullPacket: size(packet), semanticContext: size(semanticContext), sources: size(sources), receipts: size(verificationReceipts), completeContext: size(context)});
}
async function bytes(root: string): Promise<string> {
  const files: [string, string][] = [];
  async function visit(relative: string) {
    for (const entry of await fs.readdir(path.join(root, relative), {withFileTypes: true})) {
      const file = path.join(relative, entry.name);
      if (entry.isDirectory()) await visit(file);
      else files.push([file, createHash("sha256").update(await fs.readFile(path.join(root, file))).digest("hex")]);
    }
  }
  await visit(""); return JSON.stringify(files.sort(([a], [b]) => a.localeCompare(b)));
}

it("exports complete current review inputs, exact source and selected receipt without writes", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-review-context-"));
  const lifecycle = path.join(root, "lifecycle"), product = path.join(root, "product");
  const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-C", cwd, ...args], {encoding: "utf8"}).trim();
  async function cli(args: string[], input?: Json, success = true) {
    const result = await executeCommandApplication(args, lifecycle, input === undefined ? undefined : JSON.stringify(input));
    expect(result.exitCode, result.output).toBe(success ? 0 : 1);
    return JSON.parse(result.output) as Json;
  }
  async function publish(next: Json, edit: (proposal: Json) => void) {
    const proposal = structuredClone(next.assignment.packet.authorValuesScaffold);
    proposal.completionEvidence = {summary: "Exact review export fixture."}; edit(proposal);
    const args = ["assignment", "submit-proposal", "-", "--json"];
    if (next.authorityRequirement) args.push("--authority", next.authorityRequirement.authority);
    const result = await cli(args, proposal);
    expect(result.outcome).toBe("accepted");
    git(lifecycle, "add", ".lifecycle/data");
    git(lifecycle, "-c", "user.name=Test", "-c", "user.email=test@localhost", "-c", "commit.gpgSign=false", "commit", "--quiet", "--no-verify", "-m", "Fixture publication");
  }
  try {
    await fs.mkdir(lifecycle); await fs.mkdir(product);
    await cli(["init", ".", "--json"]);
    const requirements = await cli(["next", "--json"]);
    await publish(requirements, proposal => { proposal.outputs = [
      {slot: "requirements", handle: "need", payload: {title: "Greeting", kind: "stakeholder", statement: "Print a greeting."}, body: "Stakeholder intent body."},
      {slot: "requirements", handle: "greeting", payload: {title: "Output", kind: "software", ears: {pattern: "ubiquitous", system: "the greeter", response: "print hello followed by a newline"}}, links: [{type: "decomposes", target: {output: "need"}}], body: "Software detail body."},
    ]; });
    const review = await cli(["next", "--json"]);
    const beforeRequirements = await bytes(root);
    const reqContext = (await cli(["assignment", "review-context", review.assignment.id, "--json"])).reviewContext;
    expect(reqContext.verificationReceipts).toEqual([]);
    expect(reqContext.requirementGraphs).toMatchObject(review.assignment.packet.requirementGraphs);
    expect(reqContext.requirementGraphs[0].requirements.map((r: Json) => r.body)).toContain("Software detail body.");
    expect(reqContext.scenario).toEqual(review.assignment.packet.scenario);
    expect(reqContext.exactInputs).toEqual(review.assignment.packet.exactInputs);
    expect(await bytes(root)).toBe(beforeRequirements);
    measure("requirements", review.assignment.packet, reqContext);
    await publish(review, proposal => { proposal.outputs[0].payload = {title: "Review", outcome: "pass", findings: "Exact fixture requirements are clear."}; });
    const implement = await cli(["next", "--json"]);
    const leaf = implement.assignment.packet.requirementGraphs[0].requirements.find((r: Json) => r.leaf).id;
    git(product, "init", "--quiet");
    await fs.writeFile(path.join(product, "main.py"), `# mdlm:begin greeting implements ${leaf}\nprint('hello')\n# mdlm:end greeting\n`);
    await fs.writeFile(path.join(product, "verify.py"), `# mdlm:begin check verifies ${leaf}\nprint('PASS')\n# mdlm:end check\n`);
    await fs.writeFile(path.join(product, "README.md"), "Run python3 main.py.\n");
    git(product, "add", "."); git(product, "-c", "user.name=Test", "-c", "user.email=test@localhost", "-c", "commit.gpgSign=false", "commit", "--quiet", "--no-verify", "-m", "Product fixture");
    const commit = git(product, "rev-parse", "HEAD");
    await publish(implement, proposal => { proposal.outputs[0].payload = {title: "Greeting", repository_path: product, source_commit: commit, command: ["python3", "main.py"], file_roles: {"main.py": "production", "verify.py": "verification", "README.md": "documentation"}, verification_image: `python@sha256:${"a".repeat(64)}`, verification_command: ["python3", "verify.py"], verification_script: "verify.py"}; });
    const run = await cli(["next", "--json"]);
    const captured = (await cli(["assignment", "run", "--json"])).value;
    await publish(run, proposal => { proposal.outputs[0].payload = {assessment: "The fixture execution returned its captured outcome.", correction_target: "none"}; });
    const impReview = await cli(["next", "--json"]);
    // A different latest receipt and a dirty product checkout must not change exact evidence.
    const unrelated = execFileSync("git", ["-C", lifecycle, "hash-object", "-w", "--stdin"], {input: "unrelated receipt", encoding: "utf8"}).trim();
    git(lifecycle, "update-ref", `refs/mdlm/verification/${run.assignment.id}/latest`, unrelated);
    await fs.writeFile(path.join(product, "main.py"), "uncommitted wrong code\n");
    const before = await bytes(root);
    const exported = await cli(["assignment", "review-context", impReview.assignment.id, "--json"]);
    const context = exported.reviewContext;
    expect(context.contract).toBe("mdlm-assignment-review-context@1");
    const {contract: _contract, schemas: _schemas, responseSchema: _responseSchema, responseScaffold: _responseScaffold, ...semantic} = impReview.assignment.packet;
    expect(context).toMatchObject(semantic);
    expect(context).not.toHaveProperty("schemas"); expect(context).not.toHaveProperty("responseSchema"); expect(context).not.toHaveProperty("responseScaffold");
    expect(context.fullPacket.sha256).toBe(createHash("sha256").update(canonicalReviewPacket(impReview.assignment.packet)).digest("hex"));
    expect(context.sources[0].files.find((f: Json) => f.path === "main.py").content).toContain("print('hello')");
    expect(context.sources[0].files.find((f: Json) => f.path === "README.md")).toMatchObject({role: "documentation", content: "Run python3 main.py.\n"});
    expect(context.verificationReceipts[0]).toMatchObject({binding: "validated", locator: `git-blob:${captured.oid}`, receipt: captured.receipt});
    expect(await bytes(root)).toBe(before);
    measure("implementation", impReview.assignment.packet, context);
    const receiptFile = path.join(lifecycle, ".git/objects", captured.oid.slice(0, 2), captured.oid.slice(2));
    const receiptBytes = await fs.readFile(receiptFile);
    await fs.unlink(receiptFile);
    const missingBefore = await bytes(root);
    const missing = await cli(["assignment", "review-context", impReview.assignment.id, "--json"], undefined, false);
    expect(missing.diagnostics[0].code).toBe("assignment-review-context-invalid");
    expect(missing).not.toHaveProperty("reviewContext"); expect(await bytes(root)).toBe(missingBefore);
    await fs.writeFile(receiptFile, receiptBytes);
    const wrong = await cli(["assignment", "review-context", review.assignment.id, "--json"], undefined, false);
    expect(wrong.diagnostics[0].code).toBe("assignment-unavailable"); expect(await bytes(root)).toBe(before);
    await fs.writeFile(path.join(lifecycle, "README.md"), "tracked state changed\n");
    git(lifecycle, "add", "README.md");
    const staleBefore = await bytes(root);
    const stale = await cli(["assignment", "review-context", impReview.assignment.id, "--json"], undefined, false);
    expect(stale.diagnostics[0].code).toBe("assignment-stale"); expect(await bytes(root)).toBe(staleBefore);
  } finally {
    if (process.env.MDLM_REVIEW_CONTEXT_MEASUREMENTS) await fs.writeFile(process.env.MDLM_REVIEW_CONTEXT_MEASUREMENTS, JSON.stringify(measurements, null, 2) + "\n");
    await fs.rm(root, {recursive: true, force: true});
  }
});
