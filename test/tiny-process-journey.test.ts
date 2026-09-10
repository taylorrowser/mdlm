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
it("captures Docker failures and stakeholder rejection through correction to explicit acceptance", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-docker-public-"));
  const lifecycle = path.join(root, "lifecycle");
  const source = path.join(root, "product");
  let executable = path.join(process.cwd(), "dist/mdlm.js");
  const evidenceFile = path.join(os.tmpdir(), "mdlm-docker-public-evidence", `${path.basename(root)}.json`);
  const acceptedTrace: Json[] = [];
  const rejectedTrace: Json[] = [];
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
  let changed = false;
  let rejection = "";
  let rejectedImplementation = "";
  let correctedImplementation = "";
  let currentSet = "";
  let firstImplementation = "";
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
    for (let step = 0; step < 28; step++) {
      const next = cli(["next", "--json"]);
      if (next.outcome === "lifecycle-complete") {
        if (!installedMode && !changed) {
          const request = cli(["change", "request", "--requirements", currentSet]);
          expect(request.outcome).toBe("assignment");
          changed = true;
          continue;
        }
        break;
      }
      boundary = next;
      const packet = next.assignment.packet;
      const proposal = structuredClone(packet.authorValuesScaffold);
      proposal.completionEvidence = { summary: "Reviewed the exact assignment inputs and captured results." };
      const output = proposal.outputs[0] ?? {};
      const type = packet.outputs[0].type;
      output.body = "Public Docker verification regression.\n";
      if (type === "REQ") {
        proposal.outputs = [
          {slot: "requirements", handle: "need", payload: {title: "Count commas", kind: "stakeholder", statement: "Count ASCII commas from stdin; reject arguments."}, body: ""},
          {slot: "requirements", handle: "count", payload: {title: "Count input", kind: "software", ears: {pattern: "ubiquitous", system: "the counter", response: "print the ASCII comma count plus newline for no arguments and reject arguments with exit 2 and usage on stderr"}}, links: [{type: "decomposes", target: {output: "need"}}], body: ""},
        ];
        if (changed) {
          const requirements = packet.requirementGraphs[0].requirements;
          proposal.outputs[0].revision_of = requirements.find((r: Json) => r.payload.kind === "stakeholder").revision;
          proposal.outputs[0].payload.statement += " Preserve this behavior for later invocations.";
          proposal.outputs[1].revision_of = requirements.find((r: Json) => r.leaf).revision;
        }
      } else if (type === "IMP") {
        if (rejection && !correctedImplementation) {
          expect(packet.scenario.reference).toBe("correct-product@2");
          expect(JSON.stringify(packet.exactInputs)).toContain(rejection);
          expect(JSON.stringify(packet.exactInputs)).toContain(rejectedImplementation);
        }
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
        const leaf = packet.requirementGraphs[0].requirements.find((r: Json) => r.leaf).id;
        const countFile = path.join(source, "count.py");
        const countSource = (await fs.readFile(countFile, "utf8")).replace(/^# mdlm:(?:begin|end)[^\n]*\n/gm, "").trim();
        await fs.writeFile(countFile, `# mdlm:begin runtime implements ${leaf}\n${countSource}\n# mdlm:end runtime\n\n`);
        await fs.writeFile(path.join(source, "verify.py"), `# mdlm:begin checks verifies ${leaf}\n${script}# mdlm:end checks\n`);
        git(["add", "count.py", "verify.py"]);
        git(["-c", "commit.gpgSign=false", "commit", "--quiet", "--allow-empty", "--no-verify", "-m", `Verification stage ${implementation}`]);
        const sourceCommit = git(["rev-parse", "HEAD"]);
        commits.push(sourceCommit);
        output.payload = { title: "Comma counter and verification script", repository_path: source,
          source_commit: sourceCommit, command: ["python3", "count.py"], file_roles: {"count.py": "production", "verify.py": "verification"},
          verification_image: image, verification_command: ["python3", "verify.py"], verification_script: "verify.py" };
        if (!installedMode && implementation === 0) {
          // Reject an uncovered committed line without publishing any IMP/SCP.
          await fs.appendFile(countFile, "# uncovered comment\n");
          git(["add", "count.py"]);
          git(["-c", "commit.gpgSign=false", "commit", "--quiet", "--no-verify", "-m", "Uncovered content regression"]);
          const invalid = structuredClone(proposal);
          invalid.outputs[0].payload.source_commit = git(["rev-parse", "HEAD"]);
          const before = git(["status", "--porcelain", "--", ".lifecycle/data"], lifecycle);
          const rejected = cli(["assignment", "submit-proposal", "-", "--json"], invalid, 1);
          rejectedTrace.push({ assignment: next.assignment.id, sourceCommit: invalid.outputs[0].payload.source_commit, rejected });
          expect(rejected.outcome).toBe("rejected");
          expect(JSON.stringify(rejected)).toContain("source-line-unmapped");
          expect(git(["status", "--porcelain", "--", ".lifecycle/data"], lifecycle)).toBe(before);
          git(["checkout", sourceCommit, "--", "count.py"]);
          git(["-c", "commit.gpgSign=false", "commit", "--quiet", "--no-verify", "-m", "Restore mapped source"]);
          output.payload.source_commit = git(["rev-parse", "HEAD"]);
          commits[commits.length - 1] = output.payload.source_commit;
        }
        implementation++;
      } else if (type === "RES") {
        output.payload = { assessment: "The intended committed script ran; inspected its captured streams and exit status.",
          correction_target: implementation >= 3 ? "none" : "implementation" };
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
        expect(result.outcome).toBe((installedMode ? ["pass", "pass"] : ["fail", "error", "pass", "pass", "pass"])[receipts.length - 1]);
        expect(result.exitCode).toBe((installedMode ? [0, 0] : [1, 2, 0, 0, 0])[receipts.length - 1]);
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
        output.payload = { title: "Stakeholder decision", decision: rejection ? "accept" : "reject",
          rationale: rejection ? "The corrected script passes stdin and argument assertions." : "Reject this candidate and request an implementation correction." };
        if (!rejection) {
          const missingDecision = structuredClone(proposal);
          delete missingDecision.outputs[0].payload.decision;
          const before = git(["status", "--porcelain", "--", ".lifecycle/data"], lifecycle);
          const invalid = cli(["assignment", "submit-proposal", "-", "--json", "--authority", "stakeholder"], missingDecision, 1);
          expect(invalid.outcome).toBe("rejected");
          expect(git(["status", "--porcelain", "--", ".lifecycle/data"], lifecycle)).toBe(before);
          rejectedTrace.push({ assignment: next.assignment.id, missingDecision: invalid });
        }
      } else throw new Error(`Unexpected output ${type}`);
      const args = ["assignment", "submit-proposal", "-", "--json"];
      if (next.outcome === "attention-required") args.push("--authority", next.authorityRequirement.authority);
      const submitted = cli(args, proposal);
      expect(submitted.outcome).toBe("accepted");
      for (const publication of submitted.receipt.publications) {
        if (publication.stableId.startsWith("ACC-") && output.payload.decision === "reject") rejection = publication.revisionId;
        if (publication.stableId.startsWith("IMP-")) {
          if (!rejection) rejectedImplementation = publication.revisionId;
          else if (!correctedImplementation) {
            correctedImplementation = publication.revisionId;
            expect(publication.stableId).toBe(rejectedImplementation.replace(/-r\d+$/, ""));
            expect(correctedImplementation).not.toBe(rejectedImplementation);
          }
        }
        if (publication.stableId.startsWith("RQS-")) currentSet = publication.revisionId;
        if (publication.stableId.startsWith("IMP-") && !firstImplementation) firstImplementation = publication.revisionId;
      }
      if (type === "IMP") expect(submitted.receipt.publications.filter((p: Json) => p.stableId.startsWith("SCP-"))).toHaveLength(2);
      acceptedTrace.push({ assignment: next.assignment.id, scenario: packet.scenario.reference, submitted });
      git(["add", ".lifecycle/data"], lifecycle);
      git(["-c", "user.name=MDLM test", "-c", "user.email=mdlm-test@localhost", "-c", "commit.gpgSign=false",
        "commit", "--quiet", "--no-verify", "-m", `Publish ${packet.scenario.reference}`], lifecycle);
    }
    expect(cli(["next", "--json"]).outcome).toBe("lifecycle-complete");
    expect(receipts).toHaveLength(installedMode ? 2 : 5);
    const why = cli(["trace", "why", "count.py:2", "--implementation", firstImplementation, "--json"]).requirementTrace;
    expect(why.scopes).toHaveLength(1);
    expect(why.scopes[0].reasons[0].path).toHaveLength(2);
    const blank = cli(["trace", "why", "count.py:8", "--implementation", firstImplementation, "--json"]).requirementTrace;
    expect(blank).toMatchObject({ diagnostics: [], scopes: [], lineStatus: "blank-line-exempt" });
    const plainBlank = command(process.execPath, [executable, "trace", "why", "count.py:8", "--implementation", firstImplementation], lifecycle);
    expect(plainBlank.status).toBe(0);
    expect(plainBlank.stdout).toContain("Blank line outside regions");
    const plainWhy = command(process.execPath, [executable, "trace", "why", "count.py:2", "--implementation", firstImplementation], lifecycle);
    expect(plainWhy.status).toBe(0);
    expect(plainWhy.stdout).toContain("count.py:");
    expect(plainWhy.stdout).toContain(" -> ");
    const need = why.requirements.find((r: Json) => r.payload.kind === "stakeholder").id;
    const plainImpact = command(process.execPath, [executable, "trace", "impact", need, "--implementation", firstImplementation], lifecycle);
    expect(plainImpact.status).toBe(0);
    expect(plainImpact.stdout).toContain("count.py:");
    expect(plainImpact.stdout).toContain("verify.py:");
    if (!installedMode) expect(why.reassessment).toHaveLength(2);
    const records: Json[] = [];
    const data = path.join(lifecycle, ".lifecycle/data");
    for (const file of await fs.readdir(data, { recursive: true })) {
      if (!file.endsWith(".md")) continue;
      const bytes = await fs.readFile(path.join(data, file), "utf8");
      const frontmatter = bytes.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (frontmatter) records.push(parse(frontmatter[1]!));
    }
    const results = records.filter(record => record.type === "RES");
    expect(results.map(record => record.payload.outcome).sort()).toEqual(installedMode ? ["pass", "pass"] : ["error", "fail", "pass", "pass", "pass"]);
    for (const receipt of receipts) {
      const retained = JSON.parse(git(["cat-file", "blob", receipt.oid], lifecycle));
      expect(retained).toEqual(receipt.receipt);
      expect(results.some(record => record.payload.receipt === `git-blob:${receipt.oid}`)).toBe(true);
    }
    const decisions = records.filter(record => record.type === "ACC");
    expect(decisions.filter(record => record.payload.decision === "reject")).toHaveLength(1);
    expect(correctedImplementation).not.toBe("");
    const corrected = records.find(record => record.revision_id === correctedImplementation)!;
    expect(corrected.links).toContainEqual(expect.objectContaining({ type: "corrects", target: rejection }));
    const acceptances = decisions.filter(record => record.payload.decision === "accept");
    expect(acceptances).toHaveLength(installedMode ? 1 : 2);
    const linked = (record: Json, type: string) => {
      const links = record.links.filter((link: Json) => link.type === type);
      expect(links).toHaveLength(1);
      const target = records.find(candidate => candidate.revision_id === links[0].target);
      expect(target).toBeDefined();
      return target!;
    };
    const acceptedSets = new Set<string>();
    const acceptedResults = new Set<string>();
    for (const acceptance of acceptances) {
      const passed = linked(acceptance, "uses-evidence");
      const implementation = linked(acceptance, "accepts");
      const requirements = linked(acceptance, "confirms");
      expect(passed.type).toBe("RES");
      expect(passed.payload.outcome).toBe("pass");
      expect(implementation.type).toBe("IMP");
      expect(requirements.type).toBe("RQS");
      expect(linked(passed, "executes").revision_id).toBe(implementation.revision_id);
      expect(linked(passed, "verifies").revision_id).toBe(requirements.revision_id);
      expect(linked(implementation, "implements").revision_id).toBe(requirements.revision_id);
      acceptedSets.add(requirements.revision_id);
      acceptedResults.add(passed.revision_id);
    }
    expect(acceptedSets.size).toBe(acceptances.length);
    expect(acceptedResults.size).toBe(acceptances.length);
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
      terminal, boundary, acceptedTrace, rejectedTrace, packageIdentity, lifecycle, product: source,
      lifecycleHead: head.status === 0 ? head.stdout.trim() : null,
      sourceCommits: commits, receipts, artifactDigests,
      installed: process.env.MDLM_TINY_INSTALLED === "1", repositoryPreservedForAudit: true,
    }, null, 2) + "\n");
    process.stdout.write(`TINY_JOURNEY_EVIDENCE ${evidenceFile}\n`);
  }
}, 180_000);
