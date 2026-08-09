import { spawnSync } from "node:child_process";
import { appendFileSync, closeSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { commandOutput as baseCommandOutput, commandResult as baseCommandResult } from "./frontier-command.mjs";
import {
  complexityReasonsFromStats,
  isTransientAgentFailure,
  reviewerVerdict,
  reviewRequestsSimplification,
  validationPassed,
} from "./frontier-loop-core.mjs";
import { referencedParentNumber } from "./frontier-issue-contract.mjs";
import { sleep } from "./frontier-time.mjs";

function isoNow() {
  return new Date().toISOString();
}

export function appendAgentLog(path, heading, output = "") {
  appendFileSync(path, `\n===== ${heading} — ${isoNow()} =====\n${output}${output.endsWith("\n") || !output ? "" : "\n"}`);
}

export function issueReviewEvidenceArguments(issueNumber) {
  return ["issue", "view", String(issueNumber), "--json", "number,title,body,comments"];
}

export function formatIssueReviewEvidence(issue) {
  const comments = issue.comments?.length
    ? issue.comments.map((comment) => `### Comment by ${comment.author?.login ?? "unknown"}\n\n${comment.body ?? ""}`).join("\n\n")
    : "No comments.";
  return `# #${issue.number}: ${issue.title}\n\n${issue.body || "No issue body."}\n\n## Comments\n\n${comments}`;
}

export function validationCommands(baseBranch) {
  return [
    ["npm", ["ci", "--ignore-scripts"]],
    ["git", ["diff", "--check", `origin/${baseBranch}...HEAD`]],
    ["npm", ["run", "typecheck"]],
    ["npm", ["test"]],
  ];
}

export function createAgentRunner({
  repositoryRoot,
  maximumInfrastructureAttempts,
  complexityBudget,
}) {
  function runImplementation(worktree, prompt, logPath, heading) {
    for (let attempt = 1; attempt <= maximumInfrastructureAttempts; attempt += 1) {
      const descriptor = openSync(logPath, "a");
      appendAgentLog(logPath, `${heading} (provider attempt ${attempt}/${maximumInfrastructureAttempts})`);
      const attemptLogOffset = readFileSync(logPath, "utf8").length;
      const result = spawnSync("pi", ["-p", "--no-session", prompt], {
        cwd: worktree,
        env: process.env,
        stdio: ["ignore", descriptor, descriptor],
        timeout: Number(process.env.MDLM_FRONTIER_AGENT_TIMEOUT_MS ?? 2 * 60 * 60_000),
      });
      closeSync(descriptor);
      if (!result.error && result.status === 0) return;
      const attemptOutput = readFileSync(logPath, "utf8").slice(attemptLogOffset);
      const failure = new Error(result.error?.message ?? `pi exited ${result.status}: ${attemptOutput}`);
      if (!isTransientAgentFailure(failure) || attempt === maximumInfrastructureAttempts) {
        throw new Error(`pi exited ${result.status ?? "before startup"}; inspect ${logPath}`);
      }
      appendAgentLog(logPath, "transient Pi/provider failure", `Retrying in ${attempt * 15} seconds.\n`);
      sleep(attempt * 15_000);
    }
  }

  function validate(worktree, logPath, baseBranch) {
    const descriptor = openSync(logPath, "a");
    appendAgentLog(logPath, "independent command validation");
    for (const [command, args] of validationCommands(baseBranch)) {
      const result = spawnSync(command, args, {
        cwd: worktree,
        env: process.env,
        stdio: ["ignore", descriptor, descriptor],
        timeout: Number(process.env.MDLM_FRONTIER_VALIDATION_TIMEOUT_MS ?? 30 * 60_000),
      });
      if (result.error) {
        closeSync(descriptor);
        throw new Error(`Validation command ${command} failed to complete: ${result.error.message}`);
      }
      if (result.status !== 0) {
        closeSync(descriptor);
        return false;
      }
    }
    closeSync(descriptor);
    return true;
  }

  function complexityReasons(worktree, baseBranch) {
    const output = baseCommandOutput("git", ["diff", "--numstat", `origin/${baseBranch}...HEAD`], { cwd: worktree });
    const rows = output.split("\n").filter(Boolean).map((line) => line.split("\t"));
    const changedLines = rows.reduce((total, [added, deleted]) => total + (Number(added) || 0) + (Number(deleted) || 0), 0);
    const lifecycleModules = rows.filter(([, , path]) => path?.startsWith("src/") || path?.startsWith(".lifecycle/")).length;
    return complexityReasonsFromStats({ changedFiles: rows.length, changedLines, lifecycleModules }, complexityBudget);
  }

  function writeReviewEvidence(issue, worktree, logPath, baseBranch) {
    const parentNumber = referencedParentNumber(issue.body);
    const issueEvidence = formatIssueReviewEvidence(JSON.parse(baseCommandOutput("gh", issueReviewEvidenceArguments(issue.number), { cwd: repositoryRoot })));
    const parentEvidence = parentNumber
      ? formatIssueReviewEvidence(JSON.parse(baseCommandOutput("gh", issueReviewEvidenceArguments(parentNumber), { cwd: repositoryRoot })))
      : "No explicit parent issue.";
    const commits = baseCommandOutput("git", ["log", `origin/${baseBranch}..HEAD`, "--oneline"], { cwd: worktree });
    const diff = baseCommandOutput("git", ["diff", `origin/${baseBranch}...HEAD`], { cwd: worktree });
    const evidencePath = `${logPath}.review-evidence.md`;
    writeFileSync(evidencePath, `# Independent review evidence for #${issue.number}\n\n## Commits\n\n${commits}\n\n## Active issue and comments\n\n${issueEvidence}\n\n## Parent issue and comments\n\n${parentEvidence}\n\n## Exact diff\n\n\u0060\u0060\u0060diff\n${diff}\n\u0060\u0060\u0060\n`, { mode: 0o600 });
    return evidencePath;
  }

  function runReadOnlyReviewer(worktree, prompt, logPath) {
    let lastOutput = "";
    for (let attempt = 1; attempt <= maximumInfrastructureAttempts; attempt += 1) {
      let result;
      try {
        result = baseCommandResult("pi", ["-p", "--no-session", "--no-extensions", "--tools", "read,grep,find,ls", prompt], { cwd: worktree });
      } catch (error) {
        const output = error instanceof Error ? error.message : String(error);
        lastOutput = output;
        appendAgentLog(logPath, `independent read-only code review ${attempt}/${maximumInfrastructureAttempts}`, output);
        if (!isTransientAgentFailure(error) || attempt === maximumInfrastructureAttempts) return { valid: false, output };
        appendAgentLog(logPath, "transient review-provider failure", `Retrying read-only review in ${attempt * 15} seconds.\n`);
        sleep(attempt * 15_000);
        continue;
      }
      const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
      lastOutput = output;
      appendAgentLog(logPath, `independent read-only code review ${attempt}/${maximumInfrastructureAttempts}`, output);
      if (result.status === 0 && reviewerVerdict(output)) return { valid: true, output };
      const transient = isTransientAgentFailure(new Error(output));
      const malformed = result.status === 0;
      if ((!transient && !malformed) || attempt === maximumInfrastructureAttempts) return { valid: false, output };
      appendAgentLog(logPath, transient ? "transient review-provider failure" : "malformed reviewer verdict", `Retrying read-only review in ${attempt * 15} seconds.\n`);
      sleep(attempt * 15_000);
    }
    return { valid: false, output: lastOutput };
  }

  function review(issue, worktree, logPath, baseBranch) {
    const before = baseCommandOutput("git", ["rev-parse", "HEAD"], { cwd: worktree });
    const evidencePath = writeReviewEvidence(issue, worktree, logPath, baseBranch);
    const prompt = `Independently validate the implementation using the complete evidence packet at ${evidencePath}. Review it on two separate axes: Standards (repository instructions, glossary, ADRs, documented conventions, deep-module interfaces, and material code smells) and Spec (every acceptance criterion, missing behavior, incorrect behavior, negative scope, and scope creep). Explicitly flag accidental interpreters/workflow engines, cross-owner transactions, scattered lifecycle state, recovery knobs leaking through interfaces, speculative abstractions, and complexity disproportionate to this tracer bullet. If implementation behavior relies on an autonomous contract clarification, fail Spec unless an issue comment records the retained behavior, intentionally given-up behavior, and relationship to the parent goal. You have read-only tools only. Inspect repository files when useful. Report both axes concisely. Do not use either verdict marker anywhere else. End with exactly two lines: COMPLEXITY: OK only when the implementation remains bounded and modules stay deep, otherwise COMPLEXITY: ESCALATE; then VALIDATION: PASS only when both Standards and Spec have zero findings, otherwise VALIDATION: FAIL.`;
    const result = runReadOnlyReviewer(worktree, prompt, logPath);
    const after = baseCommandOutput("git", ["rev-parse", "HEAD"], { cwd: worktree });
    const dirty = baseCommandOutput("git", ["status", "--porcelain"], { cwd: worktree });
    if (before !== after || dirty) throw new Error("Independent reviewer modified the branch; refusing to merge");
    return {
      retry: !result.valid,
      passed: result.valid && validationPassed(result.output),
      simplify: result.valid && reviewRequestsSimplification(result.output),
    };
  }

  return { complexityReasons, review, runImplementation, validate };
}
