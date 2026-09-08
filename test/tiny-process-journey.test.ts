import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { parse } from "yaml";

type Json = Record<string, any>;
const image = "python@sha256:7415fbc3c9e4979cc717d92377ab2bc7b2b4a2af1ac03cc52b5f3f88efedaf3a";

// Requires Docker and the pinned image. This is the public execution boundary,
// including real assertion failure and correction, rather than a Docker mock.
it("captures Docker script failure, error and corrected success without authored outcomes", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-docker-public-"));
  const lifecycle = path.join(root, "lifecycle");
  const source = path.join(root, "product");
  let executable = path.join(process.cwd(), "dist/mdlm.js");
  const evidenceFile = path.join(os.tmpdir(), "mdlm-docker-public-evidence", `${path.basename(root)}.json`);
  const acceptedTrace: Json[] = [];
  let terminal: Json | undefined;
  let boundary: Json | undefined;
  let packageIdentity: Json | undefined;
  let failure: string | undefined;
  function command(file: string, args: string[], cwd: string, input?: string) {
    const result = spawnSync(file, args, { cwd, input, encoding: "utf8", timeout: 90_000 });
    if (result.error) throw result.error;
    return result;
  }
  function git(args: string[], cwd = source) {
    const result = command("git", args, cwd);
    expect(result.status, result.stderr).toBe(0);
    return result.stdout.trim();
  }
  function cli(args: string[], input?: Json, expectedStatus = 0, cwd = lifecycle): Json {
    const result = command(process.execPath, [executable, ...args], cwd,
      input === undefined ? undefined : JSON.stringify(input));
    terminal = JSON.parse(result.stdout);
    expect(result.status, result.stdout || result.stderr).toBe(expectedStatus);
    return terminal!;
  }
  const receipts: Json[] = [];
  const commits: string[] = [];
  const installedMode = process.env.MDLM_TINY_INSTALLED === "1";
  let implementation = installedMode ? 2 : 0;
  try {
    await fs.mkdir(source);
    git(["init", "--quiet"]);
    git(["config", "user.name", "MDLM verification test"]);
    git(["config", "user.email", "mdlm-test@localhost"]);
    await fs.writeFile(path.join(source, "count.py"), [
      "import sys",
      "if len(sys.argv) != 1:",
      "    print('usage: count.py', file=sys.stderr)",
      "    sys.exit(2)",
      "print(sys.stdin.read().count(','))", "",
    ].join("\n"));
    if (process.env.MDLM_TINY_INSTALLED === "1") {
      const packedRoot = path.join(root, "packed");
      const installRoot = path.join(root, "install");
      await fs.mkdir(packedRoot);
      const packed = command("npm", ["pack", "--pack-destination", packedRoot, "--silent"], process.cwd());
      expect(packed.status, packed.stderr).toBe(0);
      const archive = path.join(packedRoot, packed.stdout.trim().split("\n").at(-1)!);
      const installed = command("npm", ["install", "--prefix", installRoot, "--ignore-scripts", "--no-audit", "--no-fund", "--offline", archive], root);
      expect(installed.status, installed.stderr).toBe(0);
      executable = path.join(installRoot, "node_modules/mdlm/dist/mdlm.js");
    }
    packageIdentity = cli(["init", lifecycle, "--json"], undefined, 0, root).package;
    for (let step = 0; step < 16; step++) {
      const next = cli(["next", "--json"]);
      if (next.outcome === "lifecycle-complete") break;
      boundary = next;
      const packet = next.assignment.packet;
      const proposal = structuredClone(packet.authorValuesScaffold);
      proposal.completionEvidence = { summary: "Reviewed the exact assignment inputs and captured results." };
      const output = proposal.outputs[0];
      const type = packet.outputs[0].type;
      output.body = "Public Docker verification regression.\n";
      if (type === "REQ") {
        output.payload = {
          title: "Comma counter", intent: "Count ASCII commas from stdin.",
          source: "Stakeholder requests a comma count and rejects arguments.",
          commitments: ["Print the ASCII comma count and a newline.", "Reject arguments with exit 2, no stdout and usage on stderr."],
        };
      } else if (type === "IMP") {
        // Stage zero reproduces the real demo's literal-backslash transcription.
        // Stage one is an execution error; stage two checks stdin and argv.
        const expected = implementation === 0 ? "b'2\\\\n'" : "b'2\\n'";
        const script = implementation === 1 ? "import sys\nsys.exit(2)\n" : [
          "import subprocess, sys",
          "try:",
          "    result = subprocess.run([sys.executable, 'count.py'], input=b'a,b,c', capture_output=True)",
          `    assert (result.returncode, result.stdout, result.stderr) == (0, ${expected}, b''), repr(result.stdout)`,
          "    result = subprocess.run([sys.executable, 'count.py', 'unexpected'], capture_output=True)",
          "    assert (result.returncode, result.stdout, result.stderr) == (2, b'', b'usage: count.py\\n')",
          "except AssertionError as error:",
          "    print('FAIL:', error)",
          "    sys.exit(1)",
          "except Exception as error:",
          "    print('ERROR:', error, file=sys.stderr)",
          "    sys.exit(2)",
          "print('PASS: stdin and argv assertions')", "",
        ].join("\n");
        await fs.writeFile(path.join(source, "verify.py"), script);
        git(["add", "count.py", "verify.py"]);
        git(["-c", "commit.gpgSign=false", "commit", "--quiet", "--no-verify", "-m", `Verification stage ${implementation}`]);
        const sourceCommit = git(["rev-parse", "HEAD"]);
        commits.push(sourceCommit);
        output.payload = { title: "Comma counter and verification script", repository_path: source,
          source_commit: sourceCommit, command: ["python3", "count.py"], product_files: ["count.py"],
          verification_image: image, verification_command: ["python3", "verify.py"], verification_script: "verify.py" };
        implementation++;
      } else if (type === "RES") {
        output.payload = { assessment: "The intended committed script ran; inspected its captured streams and exit status.",
          correction_target: implementation === 3 ? "none" : "implementation" };
        expect(proposal.outputs[0].payload).not.toHaveProperty("outcome");
        if (!installedMode && receipts.length === 0) {
          const missing = cli(["assignment", "submit-proposal", "-", "--json"], proposal, 1);
          expect(missing.outcome).toBe("rejected");
        }
        const execution = cli(["assignment", "run", "--json"]).value;
        receipts.push(execution);
        const result = execution.receipt.result;
        expect(result.started).toBe(true);
        expect(result.sourceCommit).toBe(commits.at(-1));
        expect(result.outcome).toBe((installedMode ? ["pass"] : ["fail", "error", "pass"])[receipts.length - 1]);
        expect(result.exitCode).toBe((installedMode ? [0] : [1, 2, 0])[receipts.length - 1]);
        expect(execution.receipt.attempt).toBe(1);
        if (!installedMode) {
          expect(cli(["assignment", "run", "--json"]).value).toEqual(execution);
          const bypass = structuredClone(proposal);
          bypass.outputs[0].payload.outcome = "pass";
          const authoredOutcome = cli(["assignment", "submit-proposal", "-", "--json"], bypass, 1);
          expect(authoredOutcome.ok).toBe(false);
          expect(JSON.stringify(authoredOutcome)).toMatch(/outcome|kernel.managed/i);
          if (receipts.length === 1) {
            const forged = structuredClone(packet.responseScaffold);
            Object.assign(forged.proposal.outputs[0].payload, output.payload, {
              outcome: "pass", receipt: `git-blob:${execution.oid}`,
            });
            forged.proposal.outputs[0].body = output.body;
            forged.proposal.completionEvidence = proposal.completionEvidence;
            const rejected = cli(["scenario", "submit", "-", "--json"], forged, 1);
            expect(rejected.ok).toBe(false);
            expect(JSON.stringify(rejected)).toMatch(/outcome|verification|managed/i);
          }
        }
        if (result.outcome !== "pass") {
          const noCorrection = structuredClone(proposal);
          noCorrection.outputs[0].payload.correction_target = "none";
          expect(cli(["assignment", "submit-proposal", "-", "--json"], noCorrection, 1).outcome).toBe("rejected");
        } else {
          expect(Buffer.from(result.stdoutBase64, "base64").toString()).toBe("PASS: stdin and argv assertions\n");
          expect(result.stderrBase64).toBe("");
        }
      } else if (type === "REV") {
        output.payload = { title: "Review", outcome: "pass", findings: "The exact requirements, script assertions and evidence support the claim." };
      } else if (type === "ACC") {
        output.payload = { title: "Accepted comma counter", rationale: "The corrected script passes stdin and argument assertions." };
      } else throw new Error(`Unexpected output ${type}`);
      const args = ["assignment", "submit-proposal", "-", "--json"];
      if (next.outcome === "attention-required") args.push("--authority", next.authorityRequirement.authority);
      const submitted = cli(args, proposal);
      expect(submitted.outcome).toBe("accepted");
      acceptedTrace.push({ assignment: next.assignment.id, scenario: packet.scenario.reference, submitted });
      git(["add", ".lifecycle/data"], lifecycle);
      git(["-c", "user.name=MDLM test", "-c", "user.email=mdlm-test@localhost", "-c", "commit.gpgSign=false",
        "commit", "--quiet", "--no-verify", "-m", `Publish ${packet.scenario.reference}`], lifecycle);
    }
    expect(cli(["next", "--json"]).outcome).toBe("lifecycle-complete");
    expect(receipts).toHaveLength(installedMode ? 1 : 3);
    const records: Json[] = [];
    const data = path.join(lifecycle, ".lifecycle/data");
    for (const file of await fs.readdir(data, { recursive: true })) {
      if (!file.endsWith(".md")) continue;
      const bytes = await fs.readFile(path.join(data, file), "utf8");
      const frontmatter = bytes.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (frontmatter) records.push(parse(frontmatter[1]!));
    }
    const results = records.filter(record => record.type === "RES");
    expect(results.map(record => record.payload.outcome).sort()).toEqual(installedMode ? ["pass"] : ["error", "fail", "pass"]);
    for (const receipt of receipts) {
      const retained = JSON.parse(git(["cat-file", "blob", receipt.oid], lifecycle));
      expect(retained).toEqual(receipt.receipt);
      expect(results.some(record => record.payload.receipt === `git-blob:${receipt.oid}`)).toBe(true);
    }
    const accepted = records.find(record => record.type === "ACC")!;
    const passed = results.find(record => record.payload.outcome === "pass")!;
    expect(accepted.links).toContainEqual({ type: "uses-evidence", target: passed.revision_id });
  } catch (error) {
    failure = String(error);
    throw error;
  } finally {
    const artifactDigests: Record<string, string> = {};
    for (const file of [executable, path.join(source, "count.py"), path.join(source, "verify.py")]) {
      try { artifactDigests[file] = createHash("sha256").update(await fs.readFile(file)).digest("hex"); } catch {}
    }
    const head = command("git", ["rev-parse", "HEAD"], lifecycle);
    await fs.mkdir(path.dirname(evidenceFile), { recursive: true });
    await fs.writeFile(evidenceFile, JSON.stringify({ outcome: failure ? "failed" : "passed", failure,
      terminal, boundary, acceptedTrace, packageIdentity, lifecycle, product: source,
      lifecycleHead: head.status === 0 ? head.stdout.trim() : null,
      sourceCommits: commits, receipts, artifactDigests,
      installed: process.env.MDLM_TINY_INSTALLED === "1", repositoryPreservedForAudit: true,
    }, null, 2) + "\n");
    process.stdout.write(`TINY_JOURNEY_EVIDENCE ${evidenceFile}\n`);
  }
}, 180_000);
