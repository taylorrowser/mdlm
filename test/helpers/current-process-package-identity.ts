import { promises as fs } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { processPackageDigest } from "../../src/process-package-digest.js";

export interface CurrentProcessPackageIdentity {
  reference: string;
  digest: string;
  processRef: string;
}

/** Derive the current test package identity from its manifest and exact bytes. */
export async function currentProcessPackageIdentity(
  processRoot: string,
): Promise<CurrentProcessPackageIdentity> {
  const manifest = parse(
    await fs.readFile(path.join(processRoot, "manifest.yaml"), "utf8"),
  ) as { id?: unknown; version?: unknown };
  if (
    typeof manifest.id !== "string" || manifest.id === "" ||
    typeof manifest.version !== "string" || manifest.version === ""
  ) {
    throw new Error(`Invalid current Process Package identity at '${processRoot}'`);
  }

  const reference = `${manifest.id}@${manifest.version}`;
  const digest = await processPackageDigest(processRoot);
  return { reference, digest, processRef: `${reference}#${digest}` };
}
