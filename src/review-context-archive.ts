import type { DirectReviewContext } from "./direct-review-context.js";

type VerifierSource = NonNullable<DirectReviewContext["verifierSources"]>[number];
type Files = VerifierSource["files"];
export type SavedReviewContext = DirectReviewContext & {ok: boolean; command: string; diagnostics: unknown[]};
export interface ReviewContextArchive {
  contract: "mdlm-review-context-archive@1";
  context: Omit<SavedReviewContext, "verifierSources">;
  verifierSources?: (Omit<VerifierSource, "files"> & {filesRef: number})[];
  verifierSourceTrees: Files[];
}

/** Transport only. Native review context and registration hashes stay expanded. */
export function archiveReviewContext(context: SavedReviewContext): ReviewContextArchive {
  const {verifierSources, ...rest} = context;
  const verifierSourceTrees: Files[] = [], indices = new Map<string, number>();
  const sources = verifierSources?.map(({files, ...source}) => {
    const key = JSON.stringify(files);
    let filesRef = indices.get(key);
    if (filesRef === undefined) {
      filesRef = verifierSourceTrees.length;
      indices.set(key, filesRef);
      verifierSourceTrees.push(files);
    }
    return {...source, filesRef};
  });
  return {contract: "mdlm-review-context-archive@1", context: rest, ...(sources ? {verifierSources: sources} : {}), verifierSourceTrees};
}

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

/** Resolve only embedded lists, never source paths, Git repositories or manifests. */
export function expandReviewContextArchive(value: unknown): SavedReviewContext {
  if (!object(value) || value.contract !== "mdlm-review-context-archive@1") throw new Error("Unsupported review context archive contract");
  if (!object(value.context) || value.context.contract !== "mdlm-direct-review-context@1" || "verifierSources" in value.context) throw new Error("Invalid expanded review context header");
  if (!Array.isArray(value.verifierSourceTrees)) throw new Error("Review context archive has no embedded verifier trees");
  const trees = value.verifierSourceTrees;
  for (const files of trees) {
    if (!Array.isArray(files) || files.some(file => !object(file) || typeof file.path !== "string" || typeof file.blob !== "string" || typeof file.content !== "string" || (file.encoding !== undefined && file.encoding !== "base64"))) throw new Error("Invalid embedded verifier file list");
  }
  let sources: VerifierSource[] | undefined;
  if (value.verifierSources !== undefined) {
    if (!Array.isArray(value.verifierSources)) throw new Error("Invalid verifier source occurrences");
    sources = value.verifierSources.map(source => {
      if (!object(source) || typeof source.activity !== "string" || typeof source.sourceCommit !== "string" || "files" in source || !Number.isSafeInteger(source.filesRef) || Number(source.filesRef) < 0 || Number(source.filesRef) >= trees.length) throw new Error("Invalid or missing embedded verifier tree reference");
      const {filesRef, ...occurrence} = source;
      return {...occurrence, files: trees[Number(filesRef)]} as VerifierSource;
    });
  }
  return {...value.context, ...(sources ? {verifierSources: sources} : {})} as SavedReviewContext;
}
