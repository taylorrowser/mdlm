import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

type Json = Record<string, any>;
const image = "python@sha256:7415fbc3c9e4979cc717d92377ab2bc7b2b4a2af1ac03cc52b5f3f88efedaf3a";

it("continues nominations through stakeholder feedback while preserving exact prototype history", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-exploration-public-"));
  const lifecycle = path.join(root, "lifecycle");
  const source = path.join(root, "prototype");
  let executable = path.join(process.cwd(), "dist/mdlm.js");
  const captures: Json[] = [];
  const receipts: Json[] = [];
  const commits: string[] = [];
  const publications: Json[] = [];
  function command(file: string, args: string[], cwd: string, input?: string) {
    const result = spawnSync(file, args, { cwd, input, encoding: "utf8", timeout: 90_000, maxBuffer: 10 * 1024 * 1024 });
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
    captures.push({ args, cwd, status: result.status, stdout: result.stdout, stderr: result.stderr });
    expect(result.status, result.stdout || result.stderr).toBe(status);
    return JSON.parse(result.stdout);
  }
  try {
    if (process.env.MDLM_EXPLORATORY_INSTALLED === "1") {
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
    const tiny = cli(["init", path.join(root, "default"), "--json"], undefined, 0, root);
    expect(tiny.package.reference).toBe("mdlm-tiny@0.7.0");
    const unknown = path.join(root, "unknown");
    expect(cli(["init", unknown, "--process", "invented", "--json"], undefined, 1, root).ok).toBe(false);
    await expect(fs.stat(unknown)).rejects.toMatchObject({ code: "ENOENT" });
    const initialized = cli(["init", lifecycle, "--process", "exploratory", "--json"], undefined, 0, root);
    expect(initialized.package.reference).toBe("mdlm-exploratory@0.2.0");
    await fs.mkdir(source);
    git(["init", "--quiet"]);
    git(["config", "user.name", "MDLM exploratory fixture"]);
    git(["config", "user.email", "mdlm-test@localhost"]);
    const scenarios: string[] = [];
    let observation = 0;
    let firstObservation: Json | undefined;
    let firstObservationId: string | undefined;
    for (let step = 0; step < 15; step++) {
      const next = cli(["next", "--json"]);
      if (step === 14) {
        expect(next.outcome).toBe("profile-boundary-reached");
        expect(JSON.stringify(next)).toContain("not product acceptance");
        break;
      }
      expect(["assignment", "attention-required"]).toContain(next.outcome);
      const packet = next.assignment.packet;
      const scenario = packet.scenario.reference;
      scenarios.push(scenario);
      const proposal = structuredClone(packet.authorValuesScaffold);
      proposal.completionEvidence = { summary: "Executed the bounded public CLI fixture." };
      const output = proposal.outputs[0];
      output.body = "Exploratory fixture. This does not establish human usability.\n";
      if (scenario === "frame-experiment@1" || scenario === "revise-experiment@2") {
        output.payload = { title: "Explore counting", criterion: observation < 3 ? "Count input separators" : "Count colon separators", question: "Does this candidate match the selected separator?", approach: observation === 0 ? "Count commas" : observation < 3 ? "Count semicolons" : "Count colons", constraints: "Finite stdin/stdout dialogue", allowance_minutes: 10, scope_cut: "Only one separator; no persistence" };
      } else if (scenario === "prepare-prototype@1" || scenario === "revise-prototype@1") {
        const separator = [",", ";", ";", ":"][observation]!;
        const input = Array.from({ length: observation + 3 }, () => "x").join(separator);
        const expected = String(observation + 2);
        await fs.writeFile(path.join(source, "count.py"), `import sys\nprint(sys.stdin.read().count('${separator}'))\n`);
        await fs.writeFile(path.join(source, "verify.py"), `import subprocess, sys\nresult = subprocess.run([sys.executable, 'count.py'], input='${input}', capture_output=True, text=True, timeout=5)\nassert (result.returncode, result.stdout, result.stderr) == (0, '${expected}\\n', '')\nprint('PASS: ${expected} separators')\n`);
        git(["add", "count.py", "verify.py"]);
        git(["-c", "commit.gpgSign=false", "commit", "--quiet", "--no-verify", "-m", `Prototype ${observation + 1}`]);
        const commit = git(["rev-parse", "HEAD"]);
        commits.push(commit);
        output.payload = { title: "Committed prototype", repository_path: source, source_commit: commit, command: ["python3", "count.py"], verification_image: image, verification_command: ["python3", "verify.py"], verification_script: "verify.py" };
        expect(await fs.readFile(path.join(source, "count.py"), "utf8")).not.toContain("mdlm:");
      } else if (scenario === "observe-prototype@2") {
        output.payload = { title: "Observed separator behavior", assessment: "Inspected the exact execution receipt and independent expected count.", observation_origin: "scripted", interaction_observation: "Human use has not been observed.", limitations: "One input example; no usability evidence.", recommendation: observation === 0 ? "revise" : "nominate", next_action: observation === 0 ? "Try a semicolon criterion without treating comma counting as an obligation." : "Nominate counting semicolons; stakeholder commitment remains undecided." };
        expect(output.payload).not.toHaveProperty("outcome");
        expect(output.payload).not.toHaveProperty("receipt");
        expect(cli(["assignment", "submit-proposal", "-", "--json"], proposal, 1).outcome).toBe("rejected");
        const execution = cli(["assignment", "run", "--json"]).value;
        receipts.push(execution);
        expect(execution.receipt.result.outcome).toBe("pass");
        expect(execution.receipt.result.sourceCommit).toBe(commits.at(-1));
        expect(Buffer.from(execution.receipt.result.stdoutBase64, "base64").toString()).toContain(`${observation + 2} separators`);
        observation++;
      } else if (scenario === "record-feedback@1") {
        expect(next.outcome).toBe("attention-required");
        expect(next.authorityRequirement.authority).toBe("stakeholder");
        expect(next.authorityRequirement.delegationAllowed).toBe(false);
        const waiting = cli(["next", "--json"]);
        expect(waiting.outcome).toBe("attention-required");
        expect(waiting.assignment.id).toBe(next.assignment.id);
        const action = observation === 2 ? "revise-prototype" : observation === 3 ? "revise-criteria" : "stop";
        output.payload = { title: "Stakeholder fixture feedback", action, feedback: action === "revise-prototype" ? "Keep the semicolon criterion and try another input example." : action === "revise-criteria" ? "Change the criterion to count colons." : "Stop this experiment; do not baseline or accept the product.", source: "Synthetic stakeholder protocol fixture, not an actual user observation." };
        expect(cli(["assignment", "submit-proposal", "-", "--json"], proposal, 1).outcome).toBe("rejected");
      } else throw new Error(`Unexpected scenario ${scenario}`);
      const submitArgs = ["assignment", "submit-proposal", "-", "--json"];
      if (scenario === "record-feedback@1") submitArgs.push("--authority", "stakeholder");
      const submitted = cli(submitArgs, proposal);
      expect(submitted.outcome, JSON.stringify(submitted)).toBe("accepted");
      publications.push(submitted);
      expect(cli(["doctor", "--json"]).ok).toBe(true);
      git(["add", ".lifecycle/data"], lifecycle);
      git(["-c", "commit.gpgSign=false", "commit", "--quiet", "--no-verify", "-m", scenario], lifecycle);
      if (scenario === "observe-prototype@2" && observation === 1) {
        const list = cli(["list", "--json"]);
        // The public list identifies the exact OBS; show remains identical after revision.
        firstObservationId = list.data.find((entry: Json) => entry.lifecycleDatum.datum.type === "OBS")?.lifecycleDatum.datum.revision_id;
        expect(firstObservationId).toBeTruthy();
        firstObservation = cli(["show", firstObservationId!, "--json"]).lifecycleDatum;
      }
    }
    expect(scenarios).toEqual([
      "frame-experiment@1", "prepare-prototype@1", "observe-prototype@2",
      "revise-experiment@2", "prepare-prototype@1", "observe-prototype@2",
      "record-feedback@1", "revise-prototype@1", "observe-prototype@2",
      "record-feedback@1", "revise-experiment@2", "prepare-prototype@1",
      "observe-prototype@2", "record-feedback@1",
    ]);
    expect(cli(["show", firstObservationId!, "--json"]).lifecycleDatum).toEqual(firstObservation);
    const datums: Json[] = cli(["list", "--json"]).data.map((entry: Json) => entry.lifecycleDatum.datum);
    expect(datums.some(datum => ["REQ", "SCP", "ACC"].includes(datum.type))).toBe(false);
    const currentExperiment = datums.find(datum => datum.type === "EXP")!;
    const history = cli(["history", currentExperiment.id, "--json"]).history;
    const experiments = history.revisions.map((revision: Json) => cli(["show", revision.revisionId, "--json"]).lifecycleDatum.datum);
    expect(experiments.map((datum: Json) => datum.revision)).toEqual([1, 2, 3]);
    expect(experiments[1]!.links).toContainEqual({ type: "responds-to", target: firstObservationId });
    const feedbacks = datums.filter(datum => datum.type === "FDB");
    const criteriaFeedback = feedbacks.find(datum => datum.payload.action === "revise-criteria")!;
    const prototypeFeedback = feedbacks.find(datum => datum.payload.action === "revise-prototype")!;
    expect(experiments[2]!.links).toContainEqual({ type: "responds-to", target: criteriaFeedback.revision_id });
    expect(experiments[2]!.payload.criterion).toBe("Count colon separators");
    const trials = receipts.map(receipt => {
      const trialId = receipt.receipt.binding.inputs.find((input: Json) => input.name === "trial").revisions[0];
      return cli(["show", trialId, "--json"]).lifecycleDatum.datum;
    });
    expect(trials[1]!.id).toBe(trials[2]!.id);
    expect(trials[2]!.revision).toBe(trials[1]!.revision + 1);
    expect(trials[2]!.links).toContainEqual({ type: "responds-to", target: prototypeFeedback.revision_id });
    expect(trials[1]!.links.find((link: Json) => link.type === "explores")).toEqual(trials[2]!.links.find((link: Json) => link.type === "explores"));
    for (const [index, trial] of trials.entries()) {
      const observed = datums.find(datum => datum.type === "OBS" && datum.links.some((link: Json) => link.type === "observes" && link.target === trial.revision_id))!;
      expect(trial.payload.source_commit).toBe(commits[index]);
      expect(observed.payload.receipt).toBe(`git-blob:${receipts[index]!.oid}`);
      expect(receipts[index]!.receipt.binding.sourceCommit).toBe(commits[index]);
      const experimentId = trial.links.find((link: Json) => link.type === "explores").target;
      expect(observed.links).toContainEqual({ type: "against", target: experimentId });
    }
    expect(new Set(commits).size).toBe(commits.length);
    const stop = feedbacks.find(datum => datum.payload.action === "stop")!;
    expect(stop.links[0].target).toBe(datums.find(datum => datum.type === "OBS" && datum.payload.receipt === `git-blob:${receipts.at(-1)!.oid}`)!.revision_id);
  } finally {
    await fs.writeFile(path.join(root, "evidence.json"), JSON.stringify({ executable, captures, receipts, commits, publications }, null, 2) + "\n");
    console.log(`Exploratory journey evidence: ${path.join(root, "evidence.json")}`);
  }
}, 120_000);
