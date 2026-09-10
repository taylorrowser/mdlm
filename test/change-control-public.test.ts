import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { parse } from "yaml";

type Json = Record<string, any>;
const image = "python@sha256:7415fbc3c9e4979cc717d92377ab2bc7b2b4a2af1ac03cc52b5f3f88efedaf3a";

// One compiled public journey owns the publication and scheduling contract.
// Pure assessment tests cover permutations without repeating Docker journeys.
it("reviews decomposition, changes a baselined leaf, and clarifies its ancestor without descendant churn", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-change-public-"));
  const lifecycle = path.join(root, "lifecycle");
  const source = path.join(root, "product");
  let executable = path.join(process.cwd(), "dist/mdlm.js");
  const installedMode = process.env.MDLM_TINY_INSTALLED === "1";
  let archive: string | undefined;
  const evidenceFile = path.join(os.tmpdir(), "mdlm-change-public-evidence", `${path.basename(root)}.json`);
  const accepted: Json[] = [];
  const rejected: Json[] = [];
  const baselines: Json[] = [];
  const receipts: Json[] = [];
  let terminal: Json | undefined;
  let boundary: Json | undefined;
  let packageIdentity: Json | undefined;
  let failure: string | undefined;
  let phase = 0;
  let failedGroup = false;
  let correctedGroup = false;
  let currentSet = "";
  let graph: Json | undefined;
  let sourceCommit = "";
  const leaf = (g: Json, title: string) => g.requirements.find((r: Json) => r.payload.title === title);
  const parent = (g: Json, requirement: string) => g.groups.find((d: Json) => d.links.some((l: Json) => l.type === "parent" && l.target === requirement));
  const requirements = (g: Json) => Object.fromEntries(g.requirements.map((r: Json) => [r.id, r.revision]));
  const groups = (g: Json) => Object.fromEntries(g.groups.map((d: Json) => [d.revision.replace(/-r\d+$/, ""), d.revision]));
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
  function cli(args: string[], input?: Json, status = 0, cwd = lifecycle): Json {
    const result = command(process.execPath, [executable, ...args], cwd, input === undefined ? undefined : JSON.stringify(input));
    expect(result.stdout, result.stderr).not.toBe("");
    terminal = JSON.parse(result.stdout);
    expect(result.status, result.stdout || result.stderr).toBe(status);
    return terminal!;
  }
  function publish(next: Json, proposal: Json, status = 0) {
    const args = ["assignment", "submit-proposal", "-", "--json"];
    if (next.outcome === "attention-required") args.push("--authority", next.authorityRequirement.authority);
    const before = git(["status", "--porcelain", "--", ".lifecycle/data"], lifecycle);
    const result = cli(args, proposal, status);
    if (status !== 0) {
      expect(result.outcome).toBe("rejected");
      expect(git(["status", "--porcelain", "--", ".lifecycle/data"], lifecycle)).toBe(before);
      rejected.push({ assignment: next.assignment.id, result });
    }
    return result;
  }
  function req(handle: string, title: string, response: string, revision?: string) {
    return { slot: "requirements", handle, ...(revision ? { revision_of: revision } : {}),
      payload: { title, kind: "software", ears: { pattern: "ubiquitous", system: "the counter", response } }, body: "" };
  }
  function dcp(handle: string, parentTarget: Json | string, children: (Json | string)[], revision?: string) {
    return { slot: "decompositions", handle, ...(revision ? { revision_of: revision } : {}),
      payload: { title: handle }, links: [{ type: "parent", target: typeof parentTarget === "string" ? { datum: parentTarget } : parentTarget }, ...children.map(target => ({ type: "child", target: typeof target === "string" ? { datum: target } : target }))], body: "" };
  }
  try {
    await fs.access(executable);
    await fs.mkdir(source);
    git(["init", "--quiet"]);
    git(["config", "user.name", "MDLM public change test"]);
    git(["config", "user.email", "mdlm-test@localhost"]);
    if (installedMode) {
      const packedRoot = path.join(root, "packed");
      const installRoot = path.join(root, "install");
      await fs.mkdir(packedRoot);
      const packed = command("npm", ["pack", "--pack-destination", packedRoot, "--silent"], process.cwd());
      expect(packed.status, packed.stderr).toBe(0);
      archive = path.join(packedRoot, packed.stdout.trim().split("\n").at(-1)!);
      const installed = command("npm", ["install", "--prefix", installRoot, "--ignore-scripts", "--no-audit", "--no-fund", "--offline", archive], root);
      expect(installed.status, installed.stderr).toBe(0);
      executable = path.join(installRoot, "node_modules/mdlm/dist/mdlm.js");
      await fs.access(executable);
    }
    // Every lifecycle invocation runs outside the source checkout. Installed mode
    // changes only the executable; all three baseline journeys remain mandatory.
    packageIdentity = cli(["init", lifecycle, "--json"], undefined, 0, root).package;
    for (let step = 0; step < 36; step++) {
      const next = cli(["next", "--json"]);
      if (next.outcome === "lifecycle-complete") {
        expect(graph).toBeDefined();
        baselines.push({ graph: structuredClone(graph), sourceCommit, terminal: next });
        if (phase === 2) break;
        phase++;
        expect(cli(["change", "request", "--requirements", currentSet, "--json"]).outcome).toBe("assignment");
        continue;
      }
      boundary = next;
      expect(["assignment", "attention-required"]).toContain(next.outcome);
      const packet = next.assignment.packet;
      const scenario: string = packet.scenario.reference;
      if (packet.requirementGraphs?.length) graph = packet.requirementGraphs[0];
      const proposal = structuredClone(packet.authorValuesScaffold);
      proposal.completionEvidence = { summary: "Assessed the exact supplied work and its required dispositions." };
      const output = proposal.outputs[0] ?? {};
      const type = packet.outputs[0].type;
      output.body = "Public change-control transaction regression.\n";
      if (type === "REQ") {
        if (!graph) {
          proposal.outputs = [
            { slot: "requirements", handle: "need", payload: { title: "Delimiter counting", kind: "stakeholder", statement: "Count the selected delimiter from stdin and reject command arguments." }, body: "" },
            req("interface", "Command contract", "read stdin and print the selected delimiter count plus newline with exit 0, or reject arguments with exit 2 and usage on stderr"),
            req("count", "Count delimiter", "print the ASCII comma count from stdin plus newline when invoked without arguments"),
            dcp("root-group", { output: "need" }, [{ output: "interface" }]),
            dcp("command-group", { output: "interface" }, [{ output: "count" }]),
          ];
        } else if (phase === 0) {
          expect(failedGroup).toBe(true);
          expect(scenario).toMatch(/correct|revise/);
          const contract = leaf(graph, "Command contract");
          const group = parent(graph, contract.revision);
          proposal.outputs = [
            req("arguments", "Reject arguments", "reject all command arguments with exit 2, empty stdout and usage on stderr"),
            dcp("command-group", contract.revision, [leaf(graph, "Count delimiter").revision, { output: "arguments" }], group.revision),
          ];
          correctedGroup = true;
        } else {
          expect(scenario).toBe("revise-requirements@1");
          const target = leaf(graph, phase === 1 ? "Count delimiter" : "Delimiter counting");
          proposal.outputs = phase === 1
            ? [req("count", "Count delimiter", "print the ASCII semicolon count from stdin plus newline when invoked without arguments", target.revision)]
            : [{ slot: "requirements", handle: "need", revision_of: target.revision, payload: { ...target.payload,
              statement: "Count the selected delimiter from stdin and reject command arguments. Delimiters are counted literally, without trimming input." }, body: "" }];
          // Fixed fields remain CLI-owned in author values.
          delete proposal.outputs[0].payload.publication;
          if (phase === 1) {
            const unauthorized = structuredClone(proposal);
            const sibling = leaf(graph, "Reject arguments");
            unauthorized.outputs.push(req("unrelated", "Reject arguments", "accept arguments silently", sibling.revision));
            expect(JSON.stringify(publish(next, unauthorized, 1))).toMatch(/scope|frontier|authorized/i);
          }
        }
      } else if (type === "CHG") {
        expect(phase).toBeGreaterThan(0);
        expect(scenario).toBe("request-change@1");
        output.payload = { title: phase === 1 ? "Count semicolons" : "Clarify literal counting",
          reason: phase === 1 ? "The input format now uses semicolons." : "Make the existing literal-input interpretation explicit.",
          requested_outcome: phase === 1 ? "Count semicolons instead of commas; keep argument rejection unchanged." : "Clarify the stakeholder statement without changing behavior." };
        output.links = [{ type: "changes", target: { datum: leaf(graph!, phase === 1 ? "Count delimiter" : "Delimiter counting").revision } }];
      } else if (type === "REV") {
        if (scenario === "approve-change@1") {
          const subjects = packet.exactInputs.flatMap((invocation: Json) => invocation.inputs)
            .filter((input: Json) => input.name === "subject")
            .flatMap((input: Json) => input.values);
          expect(subjects).toHaveLength(1);
          const subject = subjects[0];
          expect(subject.identity.type).toBe("CHG");
          const baselineLinks = subject.data.links.filter((link: Json) => link.type === "baseline");
          expect(baselineLinks).toHaveLength(1);
          expect(packet.prospectiveChange.change).toBe(subject.identity.revision_id);
          expect(packet.prospectiveChange.baseline).toBe(baselineLinks[0].target);
          // The most recently accepted graph is this request's baseline. Older
          // completed changes must not add their requirement selections here.
          expect(packet.requirementGraphs.map((selected: Json) => selected.selection))
            .toEqual([baselines.at(-1)!.graph.selection]);
        }
        output.payload = { ...output.payload, title: "Exact content review", outcome: "pass", findings: "The supplied requirements and evidence support the requested behavior." };
        for (const assessment of output.payload.requirement_assessments ?? []) Object.assign(assessment, { disposition: "valid", rationale: "The statement describes its allocated behavior." });
        for (const assessment of output.payload.decomposition_assessments ?? []) {
          Object.assign(assessment, { disposition: "adequate", membership_action: "none", rationale: "The children collectively cover the parent contract." });
          for (const child of assessment.children) Object.assign(child, { disposition: "valid", rationale: "The child remains correct under this exact parent." });
        }
        for (const assessment of output.payload.source_assessments ?? []) Object.assign(assessment, { disposition: "valid", rationale: "The region and its verification satisfy the revised requirement." });
        if (scenario.includes("requirements")) {
          expect(output.payload.requirement_assessments).toBeInstanceOf(Array);
          expect(output.payload.decomposition_assessments).toBeInstanceOf(Array);
          if (!failedGroup) {
            expect(output.payload.decomposition_assessments).toHaveLength(2);
            const incomplete = structuredClone(proposal);
            incomplete.outputs[0].payload.decomposition_assessments.pop();
            expect(JSON.stringify(publish(next, incomplete, 1))).toMatch(/assessment|coverage/i);
            const group = parent(graph!, leaf(graph!, "Command contract").revision);
            const gap = output.payload.decomposition_assessments.find((a: Json) => a.group === group.revision);
            Object.assign(gap, { disposition: "needs-change", membership_action: "revise-membership", rationale: "Every child is valid, but no child covers argument rejection." });
            expect(gap.children.every((c: Json) => c.disposition === "valid")).toBe(true);
            expect(JSON.stringify(publish(next, proposal, 1))).toMatch(/pass|assessment|decomposition/i);
            output.payload.outcome = "fail";
            output.payload.findings = "The command decomposition omits argument rejection.";
            failedGroup = true;
          } else if (phase === 1) {
            const previous = baselines[0]!.graph;
            const changed = leaf(graph!, "Count delimiter");
            expect(requirements(graph!)).toEqual({ ...requirements(previous), [changed.id]: changed.revision });
            expect(changed.revision).not.toBe(leaf(previous, "Count delimiter").revision);
            const unchangedRootGroup = parent(previous, leaf(previous, "Delimiter counting").revision);
            expect(groups(graph!)[unchangedRootGroup.revision.replace(/-r\d+$/, "")]).toBe(unchangedRootGroup.revision);
            expect(output.payload.decomposition_assessments.map((a: Json) => a.group)).toEqual([parent(graph!, leaf(graph!, "Command contract").revision).revision]);
          } else if (phase === 2) {
            const previous = baselines[1]!.graph;
            const clarified = leaf(graph!, "Delimiter counting");
            expect(requirements(graph!)).toEqual({ ...requirements(previous), [clarified.id]: clarified.revision });
            expect(clarified.revision).not.toBe(leaf(previous, "Delimiter counting").revision);
            const deeper = parent(previous, leaf(previous, "Command contract").revision);
            expect(groups(graph!)[deeper.revision.replace(/-r\d+$/, "")]).toBe(deeper.revision);
            expect(output.payload.decomposition_assessments.map((a: Json) => a.group)).toEqual([parent(graph!, clarified.revision).revision]);
          }
        }
      } else if (type === "IMP") {
        expect(correctedGroup).toBe(true);
        const count = leaf(graph!, "Count delimiter").id;
        const args = leaf(graph!, "Reject arguments").id;
        if (phase < 2) {
          const delimiter = phase === 0 ? "," : ";";
          const countSource = ["import sys", "if len(sys.argv) != 1:", "    print('usage: count.py', file=sys.stderr)", "    sys.exit(2)", `print(sys.stdin.read().count(${JSON.stringify(delimiter)}))`].join("\n");
          const verification = ["import subprocess, sys", "result = subprocess.run([sys.executable, 'count.py'], input=b'a,b;c;', capture_output=True)",
            `assert (result.returncode, result.stdout, result.stderr) == (0, b'${phase === 0 ? 1 : 2}\\n', b'')`,
            "result = subprocess.run([sys.executable, 'count.py', 'argument'], capture_output=True)",
            "assert (result.returncode, result.stdout, result.stderr) == (2, b'', b'usage: count.py\\n')", "print('PASS')"].join("\n");
          await fs.writeFile(path.join(source, "count.py"), `# mdlm:begin runtime implements ${count} ${args}\n${countSource}\n# mdlm:end runtime\n`);
          await fs.writeFile(path.join(source, "verify.py"), `# mdlm:begin checks verifies ${count} ${args}\n${verification}\n# mdlm:end checks\n`);
          git(["add", "count.py", "verify.py"]);
          git(["-c", "commit.gpgSign=false", "commit", "--quiet", "--no-verify", "-m", `Product phase ${phase}`]);
          sourceCommit = git(["rev-parse", "HEAD"]);
        } else expect(git(["rev-parse", "HEAD"])).toBe(sourceCommit);
        const dispositions = output.payload?.impact_dispositions;
        output.payload = { title: "Delimiter counter", repository_path: source, source_commit: sourceCommit,
          command: ["python3", "count.py"], file_roles: { "count.py": "production", "verify.py": "verification" },
          verification_image: image, verification_command: ["python3", "verify.py"], verification_script: "verify.py" };
        if (dispositions) output.payload.impact_dispositions = dispositions.map((d: Json) => ({ ...d, disposition: phase === 1 ? "changed" : "valid", rationale: "The candidate retains this region's responsibility." }));
      } else if (type === "RES") {
        const execution = cli(["assignment", "run", "--json"]).value;
        expect(execution.receipt.result).toMatchObject({ started: true, outcome: "pass", exitCode: 0, sourceCommit });
        receipts.push(execution);
        output.payload = { assessment: "The committed verifier ran successfully and checked stdin and argument rejection.", correction_target: "none" };
      } else if (type === "ACC") {
        output.payload = { title: "Accept product", decision: "accept", rationale: "The requirements, decomposition, implementation and verification satisfy this product change." };
      } else throw new Error(`Unexpected output ${type} in ${scenario}`);
      const submitted = publish(next, proposal);
      expect(submitted.outcome).toBe("accepted");
      accepted.push({ phase, assignment: next.assignment.id, scenario, submitted });
      for (const publication of submitted.receipt.publications) if (publication.stableId.startsWith("RQS-")) currentSet = publication.revisionId;
      git(["add", ".lifecycle/data"], lifecycle);
      git(["-c", "user.name=MDLM test", "-c", "user.email=mdlm-test@localhost", "-c", "commit.gpgSign=false", "commit", "--quiet", "--no-verify", "-m", `Publish ${scenario}`], lifecycle);
    }
    expect(baselines).toHaveLength(3);
    expect(receipts).toHaveLength(3);
    expect(baselines[0]!.sourceCommit).not.toBe(baselines[1]!.sourceCommit);
    expect(baselines[1]!.sourceCommit).toBe(baselines[2]!.sourceCommit);
    expect(accepted.filter(t => t.scenario === "approve-change@1")).toHaveLength(2);
    expect(cli(["next", "--json"]).outcome).toBe("lifecycle-complete");
    const records: Json[] = [];
    for (const file of await fs.readdir(path.join(lifecycle, ".lifecycle/data"), { recursive: true })) {
      if (!file.endsWith(".md")) continue;
      const bytes = await fs.readFile(path.join(lifecycle, ".lifecycle/data", file), "utf8");
      const frontmatter = bytes.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (frontmatter) records.push(parse(frontmatter[1]!));
    }
    expect(records.filter(r => r.type === "ACC" && r.payload.decision === "accept")).toHaveLength(3);
    for (const baseline of baselines) for (const revision of Object.values(requirements(baseline.graph))) expect(records.some(r => r.revision_id === revision)).toBe(true);
  } catch (error) {
    failure = error instanceof Error ? error.stack ?? error.message : String(error);
    throw error;
  } finally {
    await fs.mkdir(path.dirname(evidenceFile), { recursive: true });
    const executableBytes = await fs.readFile(executable).catch(() => undefined);
    const executableSha256 = executableBytes ? createHash("sha256").update(executableBytes).digest("hex") : null;
    const artifactDigests: Record<string, string> = {};
    for (const file of [executable, archive, path.join(source, "count.py"), path.join(source, "verify.py")]) {
      if (!file) continue;
      const bytes = await fs.readFile(file).catch(() => undefined);
      if (bytes) artifactDigests[file] = createHash("sha256").update(bytes).digest("hex");
    }
    const head = command("git", ["rev-parse", "HEAD"], lifecycle);
    await fs.writeFile(evidenceFile, JSON.stringify({ outcome: failure ? "failed" : "passed", root, lifecycle, source,
      product: source, executable, executableSha256, archive, artifactDigests, installed: installedMode,
      lifecycleHead: head.status === 0 ? head.stdout.trim() : null, repositoryPreservedForAudit: true,
      packageIdentity, accepted, rejected, baselines, receipts, terminal, boundary, failure }, null, 2) + "\n");
    process.stdout.write(`TINY_JOURNEY_EVIDENCE ${evidenceFile}\n`);
    // Preserve both success and failure repositories for exact evidence inspection.
  }
}, 240_000);
