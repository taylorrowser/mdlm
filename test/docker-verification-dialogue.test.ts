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
