import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const cachedDigests = new Map<string, Promise<string>>();

async function filePaths(root: string, directory = root): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return filePaths(root, entryPath);
    return entry.isFile() ? [path.relative(root, entryPath)] : [];
  }));
  return nested.flat().sort();
}

async function calculateDigest(root: string): Promise<string> {
  const hash = createHash("sha256");
  for (const relativePath of await filePaths(root)) {
    const contents = await fs.readFile(path.join(root, relativePath));
    hash.update(relativePath);
    hash.update("\0");
    hash.update(String(contents.byteLength));
    hash.update("\0");
    hash.update(contents);
  }
  return `sha256:${hash.digest("hex")}`;
}

export function processPackageDigest(root: string): Promise<string> {
  const resolved = path.resolve(root);
  const cached = cachedDigests.get(resolved);
  if (cached) return cached;
  const digest = calculateDigest(resolved);
  cachedDigests.set(resolved, digest);
  void digest.catch(() => cachedDigests.delete(resolved));
  return digest;
}
