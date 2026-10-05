import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify, isDeepStrictEqual } from "node:util";
import { repositoryGitEnvironment } from "./git-environment.js";
import type { ProcessSelection } from "./repository-contract.js";

const exec = promisify(execFile);
export async function upgradeGit(root: string, args: string[]) {
  return (
    await exec("git", ["-C", root, ...args], {
      env: repositoryGitEnvironment(),
      maxBuffer: 16 * 1024 * 1024,
    })
  ).stdout.trim();
}
export async function upgradeDescriptor(
  root: string,
  selection: ProcessSelection & { upgradeReceipt?: string },
): Promise<Record<string, unknown> | undefined> {
  if (!selection.upgradeReceipt) return undefined;
  if (!/^[a-f0-9]{40,64}$/.test(selection.upgradeReceipt))
    throw new Error("Invalid upgrade receipt object identity");
  const receipt = JSON.parse(
    await upgradeGit(root, ["cat-file", "blob", selection.upgradeReceipt]),
  );
  const { upgradeReceipt: _receipt, ...pin } = selection;
  if (
    receipt.contract !== "mdlm-process-upgrade@1" ||
    !isDeepStrictEqual(receipt.selection, pin) ||
    !receipt.descriptor
  )
    throw new Error("Selection differs from its exact upgrade receipt");
  const baseline = JSON.parse(
    await fs.readFile(path.join(root, ".lifecycle/repository.json"), "utf8"),
  );
  if (
    !isDeepStrictEqual(baseline, receipt.baselineDescriptor) ||
    !isDeepStrictEqual(baseline.contracts, receipt.descriptor.contracts) ||
    baseline.repositoryContract !== receipt.descriptor.repositoryContract
  )
    throw new Error(
      "Upgrade baseline descriptor or repository contracts changed",
    );
  let entry = receipt;
  let oid = selection.upgradeReceipt;
  const seen = new Set<string>();
  while (true) {
    if (seen.has(oid)) throw new Error("Cyclic upgrade receipt history");
    seen.add(oid);
    if (
      entry.contract !== "mdlm-process-upgrade@1" ||
      typeof entry.operation !== "string" ||
      !/^[a-zA-Z0-9-]{1,80}$/.test(entry.operation) ||
      !entry.previousSelection ||
      !isDeepStrictEqual(entry.baselineDescriptor, baseline)
    )
      throw new Error("Invalid upgrade receipt history");
    const operationRef = `refs/mdlm/upgrades/${createHash("sha256").update(entry.operation).digest("hex")}`;
    if (
      (await upgradeGit(root, ["rev-parse", "--verify", operationRef])) !== oid
    )
      throw new Error("Upgrade receipt lacks its exact operation binding");
    if (entry.previousReceipt !== entry.previousSelection.upgradeReceipt)
      throw new Error("Upgrade receipt history binding differs");
    if (!entry.previousReceipt) {
      if (
        entry.previousSelection.package.reference !==
          baseline.package?.reference ||
        entry.previousSelection.package.digest !== baseline.package?.digest
      )
        throw new Error(
          "Upgrade history differs from original repository selection",
        );
      break;
    }
    const prior = JSON.parse(
      await upgradeGit(root, ["cat-file", "blob", entry.previousReceipt]),
    );
    const { upgradeReceipt: _previous, ...previousPin } =
      entry.previousSelection;
    if (!isDeepStrictEqual(previousPin, prior.selection))
      throw new Error("Upgrade predecessor selection differs");
    oid = entry.previousReceipt;
    entry = prior;
  }
  return receipt.descriptor;
}
