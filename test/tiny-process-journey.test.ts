import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

type Json = Record<string, any>;

function run(command: string, args: string[], cwd: string, input?: string) {
  const result = spawnSync(command, args, {
    cwd, input, encoding: "utf8", timeout: 30_000,
    env: { ...process.env, NODE_OPTIONS: "" },
  });
  if (result.error) throw result.error;
  return result;
}

async function digest(directory: string): Promise<string> {
  const hash = createHash("sha256");
  async function visit(root: string): Promise<void> {
    const entries = await fs.readdir(root, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(root, entry.name);
      hash.update(path.relative(directory, file));
      if (entry.isDirectory()) await visit(file);
      else hash.update(await fs.readFile(file));
    }
  }
  await visit(directory);
  return hash.digest("hex");
}

function response(packet: Json, payloads: Record<string, Json>): Json {
  return {
    outputs: packet.outputs.map((output: Json) => {
      if (!(output.type in payloads)) throw new Error(`Unhandled output ${output.type}`);
      return { slot: output.handle, payload: payloads[output.type],
        body: `# ${output.type}\n\nTiny product integration evidence.\n` };
    }),
    completionEvidence: { summary: "The exact Assignment is complete." },
  };
}

// This uses the public executable and real product observations. It is source
// integration evidence, not release qualification or an autonomous-agent demo.
describe("tiny public CLI journey", () => {
  it.each(["happy", "wrong-code", "wrong-expectation", "review-correction"])("delivers a reviewed, executed tiny product: %s", async (mode) => {
    const started = performance.now();
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-tiny-journey-"));
    const repository = path.join(root, "lifecycle");
    const source = path.join(root, "source");
    await fs.mkdir(source);
    run("git", ["init", "--quiet"], source);
    run("git", ["config", "user.name", "MDLM integration"], source);
    run("git", ["config", "user.email", "mdlm-test@localhost"], source);
    let executable = path.join(process.cwd(), "dist/mdlm.js");
    if (process.env.MDLM_TINY_INSTALLED === "1") {
      const packedRoot = path.join(root, "packed");
      const installRoot = path.join(root, "install");
      await fs.mkdir(packedRoot);
      const packed = run("npm", ["pack", "--pack-destination", packedRoot, "--silent"], process.cwd());
      expect(packed.status, packed.stderr).toBe(0);
      const archive = path.join(packedRoot, packed.stdout.trim().split("\n").at(-1)!);
      const installed = run("npm", ["install", "--prefix", installRoot, "--ignore-scripts", "--no-audit", "--no-fund", "--offline", archive], root);
      expect(installed.status, installed.stderr).toBe(0);
      executable = path.join(installRoot, "node_modules/mdlm/dist/mdlm.js");
    }
    const trace: Json[] = [];
    let rejectedMalformed = false;
    let executions = 0;
    let publications = 0;
    let sourceCommit = "";
    let initialSourceCommit = "";
    let failedObservations = 0;
    let corrected = false;
    let failedReview = false;
    const requirement = {
      intent: "Count ASCII spaces in standard input.",
      source: "Integration stakeholder request: count ASCII spaces in standard input.",
      commitments: [mode === "review-correction" ? "Read standard input and print its ASCII space count." : "Read standard input and print its ASCII space count followed by newline."],
      cases: [
        { id: "empty", stdin: "", stdout: "0\n", stderr: "", exit_code: 0 },
        { id: "spaces", stdin: "a b  c\n", stdout: mode === "wrong-expectation" ? "30\n" : "3\n", stderr: "", exit_code: 0 },
      ],
    };
    function cli(args: string[], input?: Json) {
      const result = run(process.execPath, [executable, ...args], repository,
        input === undefined ? undefined : `${JSON.stringify(input)}\n`);
      return { status: result.status, value: JSON.parse(result.stdout), stderr: result.stderr };
    }
    try {
      const initialized = run(process.execPath, [executable, "init", repository, "--json"], root);
      expect(initialized.status, initialized.stderr).toBe(0);
      expect(JSON.parse(initialized.stdout).package.reference).toBe("mdlm-tiny@0.1.0");
      for (let step = 0; step < 30; step++) {
        const next = cli(["next", "--json"]);
        expect(next.status, JSON.stringify(next.value)).toBe(0);
        if (next.value.outcome === "lifecycle-complete") break;
        expect(["assignment", "attention-required"]).toContain(next.value.outcome);
        const packet = next.value.assignment.packet;
        const scenario = packet.scenario.reference.split("@")[0];
        if (scenario === "correct-expectations") {
          requirement.cases[1]!.stdout = "3\n";
          corrected = true;
        }
        if (scenario === "correct-product") corrected = true;
        if (scenario === "correct-requirements-after-review") {
          requirement.commitments[0] = "Read standard input and print its ASCII space count followed by newline.";
          corrected = true;
        }
        const types = packet.outputs.map((output: Json) => output.type);
        const payloads: Record<string, Json> = {
          REQ: { title: "ASCII space count", ...requirement },
          IMP: { title: "ASCII space counter", command: [process.execPath, path.join(source, "count-spaces.cjs")], product_files: [path.join(source, "count-spaces.cjs")] },
          REV: { title: "Independent tiny product judgment", outcome: "pass", findings: "The exact requirement and evidence support the tiny product claim." },
          ACC: { title: "Accepted ASCII space counter", rationale: "The reviewed implementation and fresh execution satisfy the exact requirement." },
        };
        if (mode === "review-correction" && scenario === "review-requirements" && !failedReview) {
          payloads.REV = { title: "Requirement needs one content correction", outcome: "fail",
            findings: "Specify the trailing newline in the output commitment rather than only in examples." };
          failedReview = true;
        }
        if (types.includes("IMP")) {
          const program = mode === "wrong-code" && !corrected
            ? 'console.log(0);\n'
            : 'const fs = require("node:fs");\nconst input = fs.readFileSync(0);\nconsole.log([...input].filter(byte => byte === 32).length);\n';
          const file = path.join(source, "count-spaces.cjs");
          let prior = "";
          try { prior = await fs.readFile(file, "utf8"); } catch {}
          if (prior !== program) {
            await fs.writeFile(file, program);
            expect(run("git", ["add", "count-spaces.cjs"], source).status).toBe(0);
            const committed = run("git", ["-c", "commit.gpgSign=false", "commit", "--quiet", "--no-verify", "-m", "Implement space counter"], source);
            expect(committed.status, committed.stderr).toBe(0);
          }
          sourceCommit = run("git", ["rev-parse", "HEAD"], source).stdout.trim();
          if (!initialSourceCommit) initialSourceCommit = sourceCommit;
          payloads.IMP!.source_commit = sourceCommit;
        }
        if (types.includes("RES")) {
          const observations = requirement.cases.map((testCase) => {
            const result = run(process.execPath, ["count-spaces.cjs"], source, testCase.stdin);
            executions++;
            return { id: testCase.id, stdin: testCase.stdin, stdout: result.stdout, stderr: result.stderr, exit_code: result.status };
          });
          const passed = JSON.stringify(observations) === JSON.stringify(requirement.cases);
          if (!passed) failedObservations++;
          const evidence = path.join(root, `observations-${executions}.json`);
          await fs.writeFile(evidence, JSON.stringify({ sourceCommit, observations }, null, 2));
          payloads.RES = { observations, evidence, correction_target: passed ? "none" : mode === "wrong-expectation" ? "requirements" : "implementation" };
        }
        const proposal = response(packet, payloads);
        const args = ["assignment", "submit-proposal", "-", "--json"];
        if (next.value.outcome === "attention-required") {
          args.push("--authority", next.value.authorityRequirement.authority);
        }
        if (types.includes("REQ") && !rejectedMalformed) {
          const malformed = structuredClone(proposal);
          malformed.outputs.find((output: Json) => output.slot === "requirements").payload.cases[0].exit_code = "zero";
          const before = await digest(path.join(repository, ".lifecycle/data"));
          const rejected = cli(args, malformed);
          expect(rejected.status).toBe(1);
          expect(JSON.stringify(rejected.value)).toContain("exit_code");
          expect(rejected.value.ok).toBe(false);
          expect(await digest(path.join(repository, ".lifecycle/data"))).toBe(before);
          expect(cli(["next", "--json"]).value.assignment.id).toBe(next.value.assignment.id);
          rejectedMalformed = true;
        }
        if (mode === "happy" && (types.includes("REQ") || types.includes("RES"))) {
          const malformed = structuredClone(proposal);
          if (types.includes("REQ")) {
            const cases = malformed.outputs[0].payload.cases;
            cases[1].id = cases[0].id;
          } else {
            malformed.outputs[0].payload.observations.pop();
            malformed.outputs[0].payload.correction_target = "implementation";
          }
          const before = await digest(path.join(repository, ".lifecycle/data"));
          const rejected = cli(args, malformed);
          expect(rejected.status, JSON.stringify(rejected.value)).toBe(1);
          expect(await digest(path.join(repository, ".lifecycle/data"))).toBe(before);
          expect(cli(["next", "--json"]).value.assignment.id).toBe(next.value.assignment.id);
        }
        if (mode === "happy" && types.includes("ACC")) {
          const before = await digest(path.join(repository, ".lifecycle/data"));
          const unauthorized = cli(["assignment", "submit-proposal", "-", "--json"], proposal);
          expect(unauthorized.status).toBe(1);
          expect(unauthorized.value.outcome).toBe("rejected");
          expect(await digest(path.join(repository, ".lifecycle/data"))).toBe(before);
        }
        const submitted = cli(args, proposal);
        expect(submitted.status, JSON.stringify(submitted.value)).toBe(0);
        expect(submitted.value.outcome).toBe("accepted");
        publications += submitted.value.receipt.publications.length;
        const doctor = cli(["doctor", "--json"]);
        expect(doctor.status, JSON.stringify(doctor.value)).toBe(0);
        expect(run("git", ["add", ".lifecycle/data"], repository).status).toBe(0);
        const committed = run("git", ["-c", "user.name=MDLM integration", "-c", "user.email=mdlm-test@localhost",
          "-c", "commit.gpgSign=false", "commit", "--quiet", "--no-verify", "-m", `Publish ${scenario}`], repository);
        expect(committed.status, committed.stderr).toBe(0);
        trace.push({ scenario: packet.scenario.reference, types, assignment: next.value.assignment.id });
      }
      expect(cli(["next", "--json"]).value.outcome).toBe("lifecycle-complete");
      expect(rejectedMalformed).toBe(true);
      expect(executions).toBeGreaterThan(0);
      expect(trace.some((entry) => entry.types.includes("ACC"))).toBe(true);
      expect(failedObservations).toBe(["happy", "review-correction"].includes(mode) ? 0 : 1);
      expect(corrected).toBe(mode !== "happy");
      if (mode === "wrong-expectation") expect(sourceCommit).toBe(initialSourceCommit);
      if (mode === "wrong-code") expect(sourceCommit).not.toBe(initialSourceCommit);
      const records: Json[] = [];
      const dataRoot = path.join(repository, ".lifecycle/data");
      for (const relative of await fs.readdir(dataRoot, { recursive: true })) {
        if (!relative.endsWith(".md")) continue;
        const bytes = await fs.readFile(path.join(dataRoot, relative), "utf8");
        const frontmatter = bytes.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (frontmatter) records.push(parse(frontmatter[1]!));
      }
      const ofType = (type: string) => records.filter((record) => record.type === type)
        .sort((a, b) => a.revision - b.revision);
      const requirements = ofType("REQ");
      const implementations = ofType("IMP");
      const results = ofType("RES");
      const acceptances = ofType("ACC");
      expect(requirements).toHaveLength(["wrong-expectation", "review-correction"].includes(mode) ? 2 : 1);
      expect(implementations).toHaveLength(["happy", "review-correction"].includes(mode) ? 1 : 2);
      expect(results).toHaveLength(["happy", "review-correction"].includes(mode) ? 1 : 2);
      expect(acceptances).toHaveLength(1);
      const accepted = acceptances[0]!;
      expect(accepted.links).toEqual(expect.arrayContaining([
        { type: "accepts", target: implementations.at(-1)!.revision_id },
        { type: "confirms", target: requirements.at(-1)!.revision_id },
      ]));
      if (["wrong-code", "wrong-expectation"].includes(mode)) {
        expect(implementations[0]!.id).toBe(implementations[1]!.id);
        const failure = results.find((result) => result.payload.correction_target !== "none")!;
        const success = results.find((result) => result.payload.correction_target === "none")!;
        expect(accepted.links).toContainEqual({ type: "uses-evidence", target: success.revision_id });
        expect(accepted.links).not.toContainEqual({ type: "uses-evidence", target: failure.revision_id });
        const replacement = mode === "wrong-expectation" ? requirements.at(-1)! : implementations.at(-1)!;
        expect(replacement.links).toContainEqual({ type: "corrects", target: failure.revision_id });
      }
      if (mode === "review-correction") {
        const failed = ofType("REV").find((review) => review.payload.outcome === "fail")!;
        expect(failed).toBeDefined();
        expect(requirements[0]!.id).toBe(requirements[1]!.id);
        expect(requirements[1]!.links).toContainEqual({ type: "corrects", target: failed.revision_id });
      }
      const evidence = { mode, sourceCommit, initialSourceCommit, failedObservations, elapsedMs: Math.round(performance.now() - started), assignments: trace.length,
        publications, executions, malformedRejections: mode === "happy" ? 3 : 1, installed: process.env.MDLM_TINY_INSTALLED === "1", trace };
      process.stdout.write(`TINY_JOURNEY ${JSON.stringify(evidence)}\n`);
      if (process.env.MDLM_TINY_EVIDENCE) await fs.writeFile(`${process.env.MDLM_TINY_EVIDENCE}.${mode}.json`, `${JSON.stringify(evidence, null, 2)}\n`);
    } catch (error) {
      await fs.writeFile(path.join(root, "failure.json"), JSON.stringify({ trace, error: String(error) }, null, 2));
      process.stderr.write(`TINY_JOURNEY_FAILURE ${root}\n`);
      throw error;
    }
  }, 120_000);
});
