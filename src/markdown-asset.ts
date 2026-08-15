import { promises as fs } from "node:fs";
import path from "node:path";
import { parse } from "yaml";

const frontmatterPattern = /^---\n([\s\S]*?)\n---(?:\n|$)/;
const versionedAssetReferencePattern = /^(?!.*(?:^|\/)\.\.(?:\/|$))([A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*\.(?:md|yaml))@([1-9][0-9]*)$/;
const backtickSpanPattern = /`([^`\n]+)`/g;

export interface PackageMarkdownAsset {
  content: string;
  relativePath: string;
}

export type PackageMarkdownAssetRead =
  | { ok: true; asset: PackageMarkdownAsset }
  | {
      ok: false;
      reason: "invalid-reference" | "outside-package" | "read" | "version-mismatch";
      path: string;
      message: string;
    };

export function markdownAssetFrontmatter(
  content: string,
): Record<string, unknown> | undefined {
  const match = frontmatterPattern.exec(content);
  if (!match?.[1]) return undefined;
  const parsed = parse(match[1]);
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : undefined;
}

export function markdownAssetBody(content: string): string {
  const frontmatter = frontmatterPattern.exec(content);
  return frontmatter ? content.slice(frontmatter[0].length) : content;
}

export function parseVersionedAssetReference(
  reference: string,
): { path: string; version: number } | undefined {
  const match = versionedAssetReferencePattern.exec(reference);
  return match?.[1] && match[2]
    ? { path: match[1], version: Number(match[2]) }
    : undefined;
}

function parseSkillReference(reference: string): { path: string; version: number } | undefined {
  const parsed = parseVersionedAssetReference(reference);
  return parsed?.path.startsWith("skills/") && parsed.path.endsWith(".md")
    ? parsed
    : undefined;
}

export function promptSkillReferences(
  content: string,
): { ok: true; references: string[] } | { ok: false } {
  const declared = markdownAssetFrontmatter(content)?.skills;
  if (declared !== undefined) {
    if (
      !Array.isArray(declared) ||
      declared.some((value) =>
        typeof value !== "string" || !parseSkillReference(value)
      ) ||
      new Set(declared).size !== declared.length
    ) {
      return { ok: false };
    }
    return { ok: true, references: declared as string[] };
  }

  const references: string[] = [];
  for (const match of markdownAssetBody(content).matchAll(backtickSpanPattern)) {
    const candidate = match[1];
    if (!candidate) continue;
    if (!candidate.startsWith("skills/")) continue;
    if (!parseSkillReference(candidate)) return { ok: false };
    references.push(candidate);
  }
  return new Set(references).size === references.length
    ? { ok: true, references }
    : { ok: false };
}

function pathIsWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative);
}

export async function readPackageMarkdownAsset(
  root: string,
  reference: string,
): Promise<PackageMarkdownAssetRead> {
  const parsedReference = parseVersionedAssetReference(reference);
  if (!parsedReference) {
    return {
      ok: false,
      reason: "invalid-reference",
      path: reference,
      message: `Invalid versioned Markdown asset reference '${reference}'`,
    };
  }
  const relativePath = parsedReference.path;
  try {
    const packageRoot = await fs.realpath(root);
    const unresolvedPath = path.resolve(packageRoot, relativePath);
    if (!pathIsWithin(packageRoot, unresolvedPath)) {
      return {
        ok: false,
        reason: "outside-package",
        path: relativePath,
        message: `Resolved Markdown asset '${reference}' is outside the exact Process Package root`,
      };
    }
    const resolvedPath = await fs.realpath(unresolvedPath);
    if (!pathIsWithin(packageRoot, resolvedPath)) {
      return {
        ok: false,
        reason: "outside-package",
        path: relativePath,
        message: `Resolved Markdown asset '${reference}' escapes the exact Process Package root`,
      };
    }
    const content = await fs.readFile(resolvedPath, "utf8");
    const frontmatter = markdownAssetFrontmatter(content);
    const expectedVersion = parsedReference.version;
    const expectedId = path.basename(relativePath, path.extname(relativePath));
    if (
      frontmatter?.version !== expectedVersion ||
      frontmatter.id !== expectedId
    ) {
      return {
        ok: false,
        reason: "version-mismatch",
        path: relativePath,
        message: `Resolved Markdown asset '${reference}' does not declare exact identity '${expectedId}@${expectedVersion}'`,
      };
    }
    return { ok: true, asset: { content, relativePath } };
  } catch (error) {
    return {
      ok: false,
      reason: "read",
      path: relativePath,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
