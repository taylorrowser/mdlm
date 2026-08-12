import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, closeSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { commandOutput as baseCommandOutput } from "./frontier-command.mjs";
import {
  complexityReasonsFromStats,
  isTransientAgentFailure,
  reviewerVerdict,
  reviewRequestsSimplification,
  validationPassed,
} from "./frontier-loop-core.mjs";
import { referencedParentNumber } from "./frontier-issue-contract.mjs";
import { runInProcessGroup } from "./frontier-process-group.mjs";
import { independentReviewerPrompt } from "./frontier-prompts.mjs";
import { sleep } from "./frontier-time.mjs";

export const frontierModel = "openai-codex/gpt-5.6-sol";
export const frontierThinkingLevel = "high";

export class AgentProcessTimeoutError extends Error {
  constructor({ actionKind, attemptStartIdentity, evidence, logPath }) {
    super(`Pi ${actionKind} attempt ${attemptStartIdentity} exceeded its process timeout; inspect ${logPath}`);
    this.name = "AgentProcessTimeoutError";
    this.actionKind = actionKind;
    this.attemptStartIdentity = attemptStartIdentity;
    this.evidence = evidence;
    this.logPath = logPath;
  }
}

export function piAgentArguments(prompt, { readOnly = false } = {}) {
  return [
    "-p",
    "--no-session",
    ...(readOnly ? ["--no-extensions", "--tools", "read,grep,find,ls"] : []),
    "--model",
    frontierModel,
    "--thinking",
    frontierThinkingLevel,
    prompt,
  ];
}

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

export function validationCommandWasInterrupted(result) {
  return result.status === null || Boolean(result.signal);
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
  runAgentProcess = runInProcessGroup,
}) {
  function processTimeout(result, { actionKind, attemptStartIdentity, logPath, output }) {
    if (!result.timedOut && result.status !== 124) return;
    const evidence = String(output || result.stderr || "FRONTIER_PROCESS_TIMEOUT")
      .split(/\r?\n/)
      .findLast((line) => line.includes("FRONTIER_PROCESS_TIMEOUT"))
      ?? `FRONTIER_PROCESS_TIMEOUT: Pi ${actionKind} process group terminated`;
    throw new AgentProcessTimeoutError({ actionKind, attemptStartIdentity, evidence, logPath });
  }

  function runImplementation(worktree, prompt, logPath, heading, {
    actionKind = "implementation",
    attemptStartIdentity = "unidentified-attempt",
  } = {}) {
    for (let attempt = 1; attempt <= maximumInfrastructureAttempts; attempt += 1) {
      const descriptor = openSync(logPath, "a");
      appendAgentLog(logPath, `${heading} (provider attempt ${attempt}/${maximumInfrastructureAttempts})`);
      const attemptLogOffset = readFileSync(logPath, "utf8").length;
      let result;
      try {
        result = runAgentProcess("pi", piAgentArguments(prompt), {
          cwd: worktree,
          stdio: ["ignore", descriptor, descriptor],
          timeout: Number(process.env.MDLM_FRONTIER_AGENT_TIMEOUT_MS ?? 2 * 60 * 60_000),
        });
      } finally {
        closeSync(descriptor);
      }
      const attemptOutput = readFileSync(logPath, "utf8").slice(attemptLogOffset);
      processTimeout(result, { actionKind, attemptStartIdentity, logPath, output: attemptOutput });
      if (!result.error && result.status === 0) return;
      const failure = new Error(result.error?.message ?? `pi exited ${result.status}: ${attemptOutput}`);
      if (!isTransientAgentFailure(failure) || attempt === maximumInfrastructureAttempts) {
        throw new Error(`pi exited ${result.status ?? "before startup"}; inspect ${logPath}`);
      }
      appendAgentLog(logPath, "transient Pi/provider failure", `Retrying in ${attempt * 15} seconds.\n`);
      sleep(attempt * 15_000);
    }
  }

  function validate(worktree, logPath, baseBranch) {
    appendAgentLog(logPath, "independent command validation");
    for (const [command, args] of validationCommands(baseBranch)) {
      const commandIdentity = [command, ...args].map((part) => JSON.stringify(part)).join(" ");
      const result = spawnSync(command, args, {
        cwd: worktree,
        env: process.env,
        encoding: "utf8",
        maxBuffer: 50 * 1024 * 1024,
        timeout: Number(process.env.MDLM_FRONTIER_VALIDATION_TIMEOUT_MS ?? 30 * 60_000),
      });
      const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
      appendAgentLog(logPath, `validation command ${commandIdentity}`, output);
      if (result.error || validationCommandWasInterrupted(result)) {
        const detail = result.error?.message ?? `terminated by ${result.signal ?? "an unknown signal"}`;
        throw new Error(`Validation command ${command} failed to complete: ${detail}`);
      }
      if (result.status !== 0) {
        return { passed: false, failure: { commandIdentity, output } };
      }
    }
    return { passed: true, failure: null };
  }

  function complexityReasons(worktree, baseBranch) {
    const output = baseCommandOutput("git", ["diff", "--numstat", `origin/${baseBranch}...HEAD`], { cwd: worktree });
    const rows = output.split("\n").filter(Boolean).map((line) => line.split("\t"));
    const changedLines = rows.reduce((total, [added, deleted]) => total + (Number(added) || 0) + (Number(deleted) || 0), 0);
    const lifecycleModules = rows.filter(([, , path]) => path?.startsWith("src/") || path?.startsWith(".lifecycle/")).length;
    return complexityReasonsFromStats({ changedFiles: rows.length, changedLines, lifecycleModules }, complexityBudget);
  }

  function writeReviewEvidence(issue, worktree, logPath, baseBranch) {
    const liveIssue = JSON.parse(baseCommandOutput("gh", issueReviewEvidenceArguments(issue.number), { cwd: repositoryRoot }));
    const parentNumber = referencedParentNumber(liveIssue.body);
    const issueEvidence = formatIssueReviewEvidence(liveIssue);
    const parentEvidence = parentNumber
      ? formatIssueReviewEvidence(JSON.parse(baseCommandOutput("gh", issueReviewEvidenceArguments(parentNumber), { cwd: repositoryRoot })))
      : "No explicit parent issue.";
    const commits = baseCommandOutput("git", ["log", `origin/${baseBranch}..HEAD`, "--oneline"], { cwd: worktree });
    const diff = baseCommandOutput("git", ["diff", `origin/${baseBranch}...HEAD`], { cwd: worktree });
    const evidencePath = `${logPath}.review-evidence.md`;
    const content = `# Independent review evidence for #${issue.number}\n\n## Commits\n\n${commits}\n\n## Active issue and comments\n\n${issueEvidence}\n\n## Parent issue and comments\n\n${parentEvidence}\n\n## Exact diff\n\n\u0060\u0060\u0060diff\n${diff}\n\u0060\u0060\u0060\n`;
    writeFileSync(evidencePath, content, { mode: 0o600 });
    return { path: evidencePath, fingerprint: createHash("sha256").update(content).digest("hex") };
  }

  function runReadOnlyReviewer(worktree, prompt, logPath, {
    actionKind = "review",
    attemptStartIdentity = "unidentified-attempt",
  } = {}) {
    let lastOutput = "";
    for (let attempt = 1; attempt <= maximumInfrastructureAttempts; attempt += 1) {
      let result;
      try {
        result = runAgentProcess("pi", piAgentArguments(prompt, { readOnly: true }), {
          cwd: worktree,
          timeout: Number(process.env.MDLM_FRONTIER_AGENT_TIMEOUT_MS ?? 2 * 60 * 60_000),
        });
      } catch (error) {
        if (error instanceof AgentProcessTimeoutError) throw error;
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
      processTimeout(result, { actionKind, attemptStartIdentity, logPath, output });
      if (result.status === 0 && reviewerVerdict(output)) return { valid: true, output };
      const transient = isTransientAgentFailure(new Error(output));
      const malformed = result.status === 0;
      if ((!transient && !malformed) || attempt === maximumInfrastructureAttempts) return { valid: false, output };
      appendAgentLog(logPath, transient ? "transient review-provider failure" : "malformed reviewer verdict", `Retrying read-only review in ${attempt * 15} seconds.\n`);
      sleep(attempt * 15_000);
    }
    return { valid: false, output: lastOutput };
  }

  function reviewEvidence(issue, worktree, logPath, baseBranch) {
    return writeReviewEvidence(issue, worktree, logPath, baseBranch);
  }

  function review(worktree, logPath, evidence, attempt = {}) {
    const before = baseCommandOutput("git", ["rev-parse", "HEAD"], { cwd: worktree });
    const prompt = independentReviewerPrompt(evidence.path);
    const result = runReadOnlyReviewer(worktree, prompt, logPath, attempt);
    const after = baseCommandOutput("git", ["rev-parse", "HEAD"], { cwd: worktree });
    const dirty = baseCommandOutput("git", ["status", "--porcelain"], { cwd: worktree });
    if (before !== after || dirty) throw new Error("Independent reviewer modified the branch; refusing to merge");
    const passed = result.valid && validationPassed(result.output);
    const simplify = result.valid && reviewRequestsSimplification(result.output);
    return {
      retry: !result.valid,
      passed,
      simplify,
      evidenceFingerprint: evidence.fingerprint,
      failure: result.valid && (!passed || simplify)
        ? { commandIdentity: "pi independent-read-only-review", output: result.output }
        : null,
    };
  }

  return { complexityReasons, review, reviewEvidence, runImplementation, runReadOnlyReviewer, validate };
}
