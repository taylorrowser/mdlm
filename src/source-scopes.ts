/** Committed source attribution. Git enumeration and graph ancestry belong to the caller. */
export type SourceRole = "production" | "verification" | "build" | "documentation" | "configuration";
export interface SourceEntry {
  path: string;
  mode: string;
  blob: string;
  bytes: Uint8Array;
  role?: SourceRole;
}
export interface SelectedSourceRequirement {
  stableId: string;
  revisionId: string;
  kind: "stakeholder" | "software";
  isLeaf: boolean;
}
export interface SourceScopeDiagnostic { code: string; path: string; message: string; line?: number }
export interface SourceLineRange { start: number; end: number }
export interface SourceScope {
  name: string;
  path: string;
  blob: string;
  role: SourceRole;
  inherited: boolean;
  ranges: SourceLineRange[];
  links: { type: "implements" | "verifies"; target: string }[];
}
export interface SourceInventoryEntry {
  path: string;
  mode: string;
  blob: string;
  role: SourceRole | "unclassified";
  lineCount: number | null;
}
export interface SourceScopeResult {
  diagnostics: SourceScopeDiagnostic[];
  inventory: SourceInventoryEntry[];
  scopes: SourceScope[];
}

/**
 * Derive a complete snapshot from the caller's complete committed tree. Outputs
 * are usable for publication only when diagnostics is empty. No mutable files,
 * revision lookup, or publication state are consulted here.
 */
export function deriveSourceScopes(input: {
  entries: readonly SourceEntry[];
  selectedRequirements: readonly SelectedSourceRequirement[];
}): SourceScopeResult {
  const result: SourceScopeResult = { diagnostics: [], inventory: [], scopes: [] };
  const requirements = new Map<string, SelectedSourceRequirement>();
  const report = (code: string, path: string, message: string, line?: number): void => {
    result.diagnostics.push({ code, path, message, ...(line === undefined ? {} : { line }) });
  };
  for (const requirement of input.selectedRequirements) {
    if (requirements.has(requirement.stableId)) {
      report("source-requirement-selection", requirement.stableId, "Select exactly one revision for each stable requirement ID.");
    }
    requirements.set(requirement.stableId, requirement);
  }

  const seenPaths = new Set<string>();
  for (const entry of input.entries) {
    const inventory: SourceInventoryEntry = {
      path: entry.path, mode: entry.mode, blob: entry.blob,
      role: entry.role ?? "unclassified", lineCount: null,
    };
    result.inventory.push(inventory);
    if (seenPaths.has(entry.path)) {
      report("source-inventory", entry.path, "Tracked path occurs more than once in the source inventory.");
      continue;
    }
    seenPaths.add(entry.path);
    if (entry.mode !== "100644" && entry.mode !== "100755") {
      report("source-entry-mode", entry.path, `Unsupported Git mode '${entry.mode}'; symlinks and submodules need explicit source/provenance treatment.`);
      continue;
    }
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(entry.bytes);
      if (text.includes("\0")) throw new Error("NUL byte");
    } catch {
      report("source-text-format", entry.path, "Unsupported binary or non-UTF-8 entry; declare supported source/provenance treatment before publication.");
      continue;
    }
    // A final LF terminates the last physical line; it does not create another.
    const lines = text.length === 0 ? [] : text.split("\n");
    if (text.endsWith("\n")) lines.pop();
    inventory.lineCount = lines.length;
    if (entry.role === undefined) {
      report("source-role", entry.path, "Declare a role for every tracked entry.");
      continue;
    }
    if (entry.role === "documentation") {
      const name = entry.path.split("/").at(-1)!;
      const prose = /\.(?:md|txt|rst)$/i.test(name) || /^(?:readme|license|notice)$/i.test(name);
      if (!prose || entry.mode === "100755" || /^\uFEFF?#!/.test(text)) {
        report("source-documentation", entry.path, "Documentation must be a nonexecutable prose file; code and behavior-changing configuration need their own source role.");
      }
      continue;
    }
    if (entry.role === "configuration") {
      report("source-configuration", entry.path, "Behavior-changing configuration is not supported by the Python trace format; define its trace treatment before publication.");
      continue;
    }
    if (!["production", "verification", "build"].includes(entry.role) || !entry.path.endsWith(".py")) {
      report("source-code-format", entry.path, "Only Python .py production, verification, and build source is supported; unsupported code cannot be classified as documentation.");
      continue;
    }
    if (lines.length === 0) continue;

    const localStart = result.diagnostics.length;
    const scopes: SourceScope[] = [];
    const names = new Set<string>();
    let fileScope: SourceScope | undefined;
    let open: { scope: SourceScope; start: number } | undefined;
    const overrides: { scope: SourceScope; start: number; end: number }[] = [];
    const makeScope = (name: string, relation: "implements" | "verifies", targets: string[], line: number, inherited: boolean): SourceScope => {
      if (names.has(name)) report("source-scope-name", entry.path, `Duplicate scope name '${name}'.`, line);
      names.add(name);
      const expected = entry.role === "verification" ? "verifies" : "implements";
      if (relation !== expected) report("source-scope-relation", entry.path, `${entry.role} scopes must use '${expected}'.`, line);
      const links: SourceScope["links"] = [];
      let hasLeaf = false;
      const seenTargets = new Set<string>();
      for (const target of targets) {
        if (seenTargets.has(target)) {
          report("source-scope-target", entry.path, `Duplicate requirement '${target}' in scope '${name}'.`, line);
          continue;
        }
        seenTargets.add(target);
        const requirement = requirements.get(target);
        if (!requirement) {
          report("source-scope-target", entry.path, `Requirement '${target}' is not a stable ID in the assignment's exact selection.`, line);
          continue;
        }
        const leaf = requirement.kind === "software" && requirement.isLeaf;
        hasLeaf ||= leaf;
        if (relation === "implements" && !leaf) {
          report("source-scope-leaf", entry.path, `Implementation target '${target}' must be a selected software leaf.`, line);
        }
        links.push({ type: relation, target: requirement.revisionId });
      }
      if (!hasLeaf) report("source-scope-leaf", entry.path, `Scope '${name}' needs at least one selected software leaf target.`, line);
      const scope: SourceScope = { name, path: entry.path, blob: entry.blob, role: entry.role!, inherited, ranges: [], links };
      scopes.push(scope);
      return scope;
    };

    lines.forEach((lineText, offset) => {
      const line = offset + 1;
      if (!/^\s*#\s*mdlm:/.test(lineText)) return;
      const declaration = /^\s*#\s*mdlm:(file|begin)\s+([A-Za-z][A-Za-z0-9_-]*)\s+(implements|verifies)\s+(\S+(?:[ \t]+\S+)*)\s*$/.exec(lineText);
      if (declaration) {
        const [, kind, name, relation, targetText] = declaration;
        const scope = makeScope(name!, relation as "implements" | "verifies", targetText!.trim().split(/\s+/), line, kind === "file");
        if (kind === "file") {
          if (fileScope) report("source-file-default", entry.path, "Exactly one file default is allowed.", line);
          if (open) report("source-region-overlap", entry.path, "A file default cannot be declared inside a region.", line);
          fileScope = scope;
        } else if (open) {
          report("source-region-overlap", entry.path, `Region '${name}' overlaps open region '${open.scope.name}'; regions cannot nest.`, line);
        } else {
          open = { scope, start: line };
        }
        return;
      }
      const end = /^\s*#\s*mdlm:end\s+([A-Za-z][A-Za-z0-9_-]*)\s*$/.exec(lineText);
      if (end) {
        if (!open || open.scope.name !== end[1]) {
          report("source-region-end", entry.path, `End '${end[1]}' must match the currently open region.`, line);
        } else {
          overrides.push({ ...open, end: line });
          open = undefined;
        }
        return;
      }
      report("source-directive", entry.path, "Expected '# mdlm:file|begin NAME implements|verifies STABLE_ID ...' or '# mdlm:end NAME'.", line);
    });
    if (open) report("source-region-end", entry.path, `Region '${open.scope.name}' has no matching end.`, open.start);
    if (!fileScope) report("source-file-default", entry.path, "Nonempty Python source requires exactly one '# mdlm:file NAME implements|verifies STABLE_ID ...' default.");
    if (result.diagnostics.length !== localStart || !fileScope) continue;

    let next = 1;
    for (const override of overrides) {
      if (next < override.start) fileScope.ranges.push({ start: next, end: override.start - 1 });
      override.scope.ranges.push({ start: override.start, end: override.end });
      next = override.end + 1;
    }
    if (next <= lines.length) fileScope.ranges.push({ start: next, end: lines.length });
    result.scopes.push(...scopes);
  }
  return result;
}
