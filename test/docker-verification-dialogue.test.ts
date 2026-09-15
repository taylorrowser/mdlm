import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { executeDockerVerification } from "../src/docker-verification.js";

// Exercise the existing execution seam with real Docker, without duplicating
// the public lifecycle's review, receipt-publication, and correction tests.
it("verifies a finite prompted dialogue through child stdin without a TTY", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-dialogue-proof-"));
  const source = path.join(root, "source");
  await fs.mkdir(source);
  const git = (...args: string[]) => execFileSync("git", ["-C", source, ...args], { encoding: "utf8" }).trim();
  git("init", "--quiet");
  await fs.writeFile(path.join(source, "dialogue.py"), String.raw`names = input("Names: ").split(",")
totals = [0] * len(names)
while True:
    bids = [int(input(f"{name} bid: ")) for name in names]
    taken = [int(input(f"{name} taken: ")) for name in names]
    for index, name in enumerate(names):
        bid, actual = bids[index], taken[index]
        score = bid * 10 + 10 if bid == actual else -10 * abs(bid - actual)
        totals[index] += score
        print(f"{name}: hand {score}, total {totals[index]}")
    if input("Next or quit: ") == "quit":
        print("Finished")
        break
`);
  await fs.writeFile(path.join(source, "verify.py"), String.raw`import subprocess
import sys

try:
    result = subprocess.run(
        [sys.executable, "dialogue.py"],
        input=b"Amy,Ben\n1\n0\n1\n0\nnext\n0\n1\n1\n0\nquit\n",
        capture_output=True, timeout=5, check=False,
    )
    expected = (
        b"Names: Amy bid: Ben bid: Amy taken: Ben taken: "
        b"Amy: hand 20, total 20\nBen: hand 10, total 10\n"
        b"Next or quit: Amy bid: Ben bid: Amy taken: Ben taken: "
        b"Amy: hand -10, total 10\nBen: hand -10, total 0\n"
        b"Next or quit: Finished\n"
    )
    assert (result.returncode, result.stdout, result.stderr) == (0, expected, b""), result
except AssertionError as error:
    print(f"FAIL: {error}", file=sys.stderr)
    sys.exit(1)
except Exception as error:
    print(f"ERROR: {error}", file=sys.stderr)
    sys.exit(2)
print("PASS: two-hand dialogue, scores, totals, and quit")
`);
  git("add", ".");
  git("-c", "user.name=MDLM test", "-c", "user.email=test@example.invalid", "commit", "--quiet", "-m", "Finite dialogue fixture");
  const input = {
    repositoryPath: source,
    sourceCommit: git("rev-parse", "HEAD"),
    image: "python@sha256:7415fbc3c9e4979cc717d92377ab2bc7b2b4a2af1ac03cc52b5f3f88efedaf3a",
    command: ["python3", "verify.py"],
    scriptPath: "verify.py",
    timeoutMs: 20_000,
  };
  const result = await executeDockerVerification(input);
  // Preserve the exact source and result on success and failure for inspection.
  const evidence = path.join(root, "evidence.json");
  await fs.writeFile(evidence, JSON.stringify({ input, result }, null, 2) + "\n");
  console.log(`Finite dialogue evidence: ${evidence}`);
  expect(result, JSON.stringify(result)).toMatchObject({ outcome: "pass", started: true, exitCode: 0, sourceCommit: input.sourceCommit });
  expect(Buffer.from(result.stdoutBase64, "base64").toString()).toBe("PASS: two-hand dialogue, scores, totals, and quit\n");
  expect(result.stderrBase64).toBe("");
}, 45_000);

it("partial verification cannot use an omitted committed dependency", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-partial-dependency-"));
  const git = (...args: string[]) => execFileSync("git", ["-C", root, ...args], {encoding: "utf8"}).trim();
  git("init", "--quiet");
  await fs.writeFile(path.join(root, "dependency.py"), "value = 30\n");
  await fs.writeFile(path.join(root, "scoring.py"), "from dependency import value\ndef score():\n    return value\n");
  await fs.writeFile(path.join(root, "verify.py"), "import sys\ntry:\n    from scoring import score\n    assert score() == 30\nexcept AssertionError:\n    sys.exit(1)\nexcept Exception as error:\n    print(error, file=sys.stderr)\n    sys.exit(2)\n");
  git("add", ".");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@localhost", "commit", "-qm", "Dependency fixture");
  const input = {repositoryPath: root, sourceCommit: git("rev-parse", "HEAD"), image: "python@sha256:7415fbc3c9e4979cc717d92377ab2bc7b2b4a2af1ac03cc52b5f3f88efedaf3a", command: ["python3", "verify.py"], scriptPath: "verify.py", formalFiles: ["scoring.py", "verify.py"]};
  const missing = await executeDockerVerification(input);
  const included = await executeDockerVerification({...input, formalFiles: [...input.formalFiles, "dependency.py"]});
  await fs.writeFile(path.join(root, "evidence.json"), JSON.stringify({input, missing, included}, null, 2));
  console.log(`PARTIAL_DEPENDENCY_EVIDENCE ${root}/evidence.json`);
  expect(missing).toMatchObject({outcome: "error", exitCode: 2, started: true});
  expect(Buffer.from(missing.stderrBase64, "base64").toString()).toContain("dependency");
  expect(included).toMatchObject({outcome: "pass", exitCode: 0});
}, 45_000);

it("executes committed nested files under a restrictive caller umask", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-umask-proof-"));
  const git = (...args: string[]) => execFileSync("git", ["-C", root, ...args], {encoding: "utf8"}).trim();
  git("init", "--quiet");
  await fs.mkdir(path.join(root, "nested"));
  await fs.writeFile(path.join(root, "nested/value.txt"), "committed value\n");
  await fs.writeFile(path.join(root, "nested/helper.sh"), "#!/bin/sh\ncat nested/value.txt\n");
  await fs.chmod(path.join(root, "nested/helper.sh"), 0o755);
  const script = "import os, pathlib, subprocess\nassert os.getuid() == 65534\nassert pathlib.Path('nested/value.txt').read_text() == 'committed value\\n'\nassert subprocess.check_output(['./nested/helper.sh']) == b'committed value\\n'\nprint('PASS: committed nested files')\n";
  await fs.writeFile(path.join(root, "nested/verify.py"), script);
  git("add", ".");
  git("-c", "user.name=MDLM test", "-c", "user.email=test@example.invalid", "commit", "--quiet", "-m", "Restrictive umask fixture");
  const input = {
    repositoryPath: root, sourceCommit: git("rev-parse", "HEAD"),
    image: "python@sha256:7415fbc3c9e4979cc717d92377ab2bc7b2b4a2af1ac03cc52b5f3f88efedaf3a",
    command: ["python3", "nested/verify.py"], scriptPath: "nested/verify.py", timeoutMs: 20_000,
  };
  const previousUmask = process.umask(0o077);
  let result;
  try {
    result = await executeDockerVerification(input);
  } finally {
    process.umask(previousUmask);
  }
  const evidence = path.join(root, "evidence.json");
  await fs.writeFile(evidence, JSON.stringify({input, result}, null, 2) + "\n");
  console.log(`Restrictive umask evidence: ${evidence}`);
  expect(result, JSON.stringify(result)).toMatchObject({outcome: "pass", started: true, exitCode: 0, sourceCommit: input.sourceCommit});
  expect(result.scriptSha256).toBe(createHash("sha256").update(script).digest("hex"));
  expect(Buffer.from(result.stdoutBase64, "base64").toString()).toBe("PASS: committed nested files\n");
  expect(result.stderrBase64).toBe("");
}, 45_000);
