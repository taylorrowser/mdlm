import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { initialPhaseId } from "../src/lifecycle-inspection.js";
import { loadRepositoryInspection } from "../src/repository-inspection.js";
import { selectedRepositoryPackage } from "../src/selected-package.js";

const corpusRoot = path.join(process.cwd(), "test/fixtures/cutover-corpus");
const contractRoot = path.join(process.cwd(), "test/fixtures/operator-contract-v2");
const bundleRoot = path.join(corpusRoot, "bundles");
const executeFile = promisify(execFile);

const retainedEvidence = [
  {
    file: "retained-051-assignment.json",
    sha256: "87cd74515247e7578569bcaf846f01c8aca5484fd5c3039973c0d8cd063fda97",
    outcome: "assignment",
  },
  {
    file: "retained-051-materialization.json",
    sha256: "c64dd1cd11da7c226409162b138ecd24e63e5cf9f159aebd6cfaac70d23edf92",
    outcome: "publication-required",
  },
  {
    file: "retained-052-attention.json",
    sha256: "ac10f44ae68b7adb27d9dc0eaba440e36038431221922ff47e0b7f397d75385a",
    outcome: "attention-required",
  },
] as const;

async function exactJson(root: string, file: string): Promise<{
  source: string;
  value: Record<string, unknown>;
}> {
  const source = await fs.readFile(path.join(root, file), "utf8");
  return { source, value: JSON.parse(source) as Record<string, unknown> };
}

function digest(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

async function executableSnapshot(bundle: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-cutover-corpus-"));
  const packageRoot = path.join(
    root,
    ".lifecycle/packages/mdlm-bootstrap@0.79.0",
  );
  await fs.mkdir(packageRoot, { recursive: true });
  await executeFile("tar", ["-xzf", path.join(bundleRoot, bundle), "-C", root]);
  await executeFile("tar", [
    "-xzf",
    path.join(bundleRoot, "package-0.79.0.tar.gz"),
    "-C",
    packageRoot,
  ]);
  const selected = await selectedRepositoryPackage(root);
  if (!selected.ok) throw new Error(JSON.stringify(selected.diagnostics));
  const phase = initialPhaseId(selected.processPackage);
  if (!phase) throw new Error("Cutover package has no initial Phase");
  const inspection = await loadRepositoryInspection(
    root,
    selected.processPackage,
    `${selected.summary.reference}#${selected.summary.digest}`,
  );
  if (!inspection.ok) throw new Error(JSON.stringify(inspection.diagnostics));
  return {
    root,
    package: selected.summary,
    snapshot: inspection.value.lifecycleSnapshot(phase),
    lease: JSON.parse(
      await fs.readFile(path.join(root, ".lifecycle/work/active-assignment.json"), "utf8"),
    ) as Record<string, unknown>,
  };
}

describe("bounded cutover evidence", () => {
  it("pins the exact retained-lane bytes and their old safety results", async () => {
    for (const fixture of retainedEvidence) {
      const { source, value } = await exactJson(corpusRoot, fixture.file);
      expect(digest(source)).toBe(fixture.sha256);
      expect(value.outcome).toBe(fixture.outcome);
      expect((value.package as Record<string, unknown>).digest).toBe(
        "sha256:3268712b6a316bd378a485c894417f9013afd6529eddda1aaf19c37c7b467574",
      );
    }
  });

  it("reconstructs authenticated retained snapshots and distinct active recovery", async () => {
    const packageArchive = await fs.readFile(path.join(bundleRoot, "package-0.79.0.tar.gz"));
    expect(createHash("sha256").update(packageArchive).digest("hex")).toBe(
      "618e1e8ae8bb2f2f0088fc3dae959bf9c6e66f39b91d2804febbfa52840e200d",
    );
    const active = await executableSnapshot(
      "utf8-codepoint-count-pi-glm-051-qualified-079-snapshot.tar.gz",
    );
    const attended = await executableSnapshot(
      "json-array-length-pi-glm-052-qualified-079-snapshot.tar.gz",
    );
    try {
      expect(active.package.digest).toBe(
        "sha256:3268712b6a316bd378a485c894417f9013afd6529eddda1aaf19c37c7b467574",
      );
      expect(active.snapshot.records).toHaveLength(3);
      expect(active.lease).toMatchObject({
        id: "3848d89a-c926-408c-a802-113407e5de12",
        disposition: "active",
      });
      expect(attended.snapshot.records).toHaveLength(4);
      expect(attended.lease).toMatchObject({
        id: "ca96351a-38af-4086-a5cb-5af038ab74e0",
        disposition: "active",
      });
    } finally {
      await Promise.all([
        fs.rm(active.root, { recursive: true, force: true }),
        fs.rm(attended.root, { recursive: true, force: true }),
      ]);
    }
  });

  it("retains the stopped Codex accepted-but-uncommitted no-replay boundary", async () => {
    const { value } = await exactJson(
      corpusRoot,
      "retained-codex-046-accepted-uncommitted.json",
    );
    const archive = path.join(
      corpusRoot,
      String((value.transactionArchive as Record<string, unknown>).file),
    );
    const bytes = await fs.readFile(archive);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      (value.transactionArchive as Record<string, unknown>).sha256,
    );
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-codex-046-corpus-"));
    try {
      await executeFile("tar", ["-xzf", archive, "-C", root]);
      const transaction = path.join(
        root,
        ".lifecycle/data/.transactions",
        String(value.execution),
      );
      const executionSource = await fs.readFile(path.join(transaction, "execution.json"));
      const datumSource = await fs.readFile(
        path.join(transaction, "BSL/BSL-XGVB13HF50/r00001.md"),
      );
      expect(createHash("sha256").update(executionSource).digest("hex")).toBe(
        "523cc624ba813af0c1c0a4d4dbf4208472b5785e250a91bff061cfc55c1824fb",
      );
      expect(createHash("sha256").update(datumSource).digest("hex")).toBe(
        "eb43ea87fd9d364b9de6f768de3b013a857c2b17beb7b20944ee79e30f7c0131",
      );
      const execution = JSON.parse(executionSource.toString()) as Record<string, any>;
      expect(execution).toMatchObject({
        id: value.execution,
        status: "completed",
        response: {
          assignment: value.assignment,
          digest: value.responseDigest,
        },
      });
      expect(value).toMatchObject({
        transport: "stopped",
        writer: null,
        acceptedTransactions: { acceptedUncommitted: 1 },
        boundary: { closure: "accepted-publication-uncommitted", replay: false },
      });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("freezes exactly the six v2 OperatorOutcome families", async () => {
    const files = [
      "assignment.json",
      "attention-required.json",
      "profile-boundary-reached.json",
      "lifecycle-complete.json",
      "process-dead-end.json",
      "invalid.json",
    ];
    const outcomes = await Promise.all(files.map(async (file) =>
      (await exactJson(contractRoot, file)).value.outcome
    ));
    expect(outcomes).toEqual([
      "assignment",
      "attention-required",
      "profile-boundary-reached",
      "lifecycle-complete",
      "process-dead-end",
      "invalid",
    ]);
  });

  it("keeps the complete packet small and the response free of generated identity claims", async () => {
    const packet = await exactJson(contractRoot, "assignment-packet.json");
    const response = await exactJson(contractRoot, "assignment-response.json");
    const oldPacketBytes = 37_052;
    expect(Buffer.byteLength(packet.source)).toBeLessThanOrEqual(oldPacketBytes * 0.2);
    expect(packet.value).toHaveProperty("responseScaffold");
    expect(packet.value).toHaveProperty("schemas");
    expect(packet.value).toHaveProperty("exactInputs");
    expect(response.source).not.toMatch(/stableId|revisionId|revision_id|authoritySupplies|standingDelegations/);
    expect(response.value).toHaveProperty("proposal.outputs.0.handle", "context");
    expect(response.value).toHaveProperty("proposal.outputs.1.links.1.target.output", "context");
  });

  it("freezes accepted, repeatable rejection, and no-replay settlement results", async () => {
    const files = [
      "submission-accepted.json",
      "submission-rejected.json",
      "submission-settlement-required.json",
    ];
    const outcomes = await Promise.all(files.map(async (file) =>
      (await exactJson(contractRoot, file)).value
    ));
    expect(outcomes.map((outcome) => outcome.outcome)).toEqual([
      "accepted",
      "rejected",
      "settlement-required",
    ]);
    expect(outcomes[1]).toMatchObject({ retryable: true, correctionConsumed: false });
    expect(outcomes[2]).toHaveProperty("orchestration.replay", false);
  });
});
