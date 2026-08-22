import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

async function filePaths(root: string): Promise<string[]> {
  const directories = [root];
  const paths: string[] = [];
  while (directories.length > 0) {
    const directory = directories.pop()!;
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) directories.push(entryPath);
      else if (entry.isFile()) paths.push(path.relative(root, entryPath));
    }
  }
  return paths.sort();
}

/** Hash the exact current package bytes. No metadata or watcher result is trusted. */
export async function processPackageDigest(root: string): Promise<string> {
  const resolvedRoot = path.resolve(root);
  const paths = await filePaths(resolvedRoot);
  const hash = createHash("sha256");
  for (let index = 0; index < paths.length; index += 32) {
    const batch = paths.slice(index, index + 32);
    const contents = await Promise.all(batch.map((relativePath) =>
      fs.readFile(path.join(resolvedRoot, relativePath))
    ));
    for (const [offset, relativePath] of batch.entries()) {
      const content = contents[offset]!;
      hash.update(relativePath);
      hash.update("\0");
      hash.update(String(content.byteLength));
      hash.update("\0");
      hash.update(content);
    }
  }
  return `sha256:${hash.digest("hex")}`;
}
