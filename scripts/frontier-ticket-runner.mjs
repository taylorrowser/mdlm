import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { appendAgentLog, createAgentRunner } from "./frontier-agent-runner.mjs";
import { commandOutput as baseCommandOutput, commandResult as baseCommandResult } from "./frontier-command.mjs";
import {
  isTransientInfrastructureFailure,
  parsePullRequestNumber,
  validatedHeadMatches,
  validationFailureAction,
} from "./frontier-loop-core.mjs";

function sleep(milliseconds) {
  execFileSync(process.execPath, ["-e", `setTimeout(() => {}, ${milliseconds})`]);
}

export function createTicketRunner({
  repositoryRoot,
  writeState,
  log,
  defaultBranch,
  maximumDiagnosticEscalations,
  maximumDesignEscalations,
  maximumAgentInfrastructureAttempts,
  complexityBudget,
}) {
  const agentRunner = createAgentRunner({
    repositoryRoot,
    maximumInfrastructureAttempts: maximumAgentInfrastructureAttempts,
    complexityBudget,
  });

  function commandResult(command, args, options = {}) {
    return baseCommandResult(command, args, { ...options, cwd: options.cwd ?? repositoryRoot });
  }

  function commandOutput(command, args, options = {}) {
    return baseCommandOutput(command, args, { ...options, cwd: options.cwd ?? repositoryRoot });
  }

  function commandJson(command, args, options = {}) {
    const output = commandOutput(command, args, options);
    return output ? JSON.parse(output) : null;
  }

  function fail(message) {
    throw new Error(message);
  }

  function viewerLogin() {
    return commandOutput("gh", ["api", "user", "--jq", ".login"]);
  }

  function issueOpen(number) {
    return commandOutput("gh", ["issue", "view", String(number), "--json", "state", "--jq", ".state"]) === "OPEN";
  }

  function removeWorktree(worktree, branch) {
    if (worktree && existsSync(worktree)) commandOutput("git", ["worktree", "remove", "--force", worktree]);
    if (branch && commandResult("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]).status === 0) {
      commandOutput("git", ["branch", "-D", branch]);
    }
  }

  function prepareWorktree(issue, paths, resumeState) {
    if (resumeState?.currentIssue === issue.number && resumeState.worktree && existsSync(resumeState.worktree)) {
      return { worktree: resumeState.worktree, branch: resumeState.branch, resumed: true };
    }
    const branch = `agent/issue-${issue.number}-${Date.now()}`;
    const worktree = join(paths.worktrees, `issue-${issue.number}`);
    if (existsSync(worktree)) fail(`Unrecognized existing worktree: ${worktree}`);
    const base = defaultBranch();
    commandOutput("git", ["fetch", "origin", base]);
    commandOutput("git", ["worktree", "add", "-b", branch, worktree, `origin/${base}`]);
    return { worktree, branch, resumed: false };
  }

  function remediationPrompt(issue, reasonLog) {
    return `/skill:implement Continue implementing GitHub issue #${issue.number} on the current branch. An independent validation pass failed; inspect ${reasonLog}, the complete issue and comments, parent spec, existing commits, and any uncommitted work. Reproduce every finding at the narrowest agreed seam, fix its root cause, rerun focused and full validation, invoke code review, and commit the corrections. Prefer deleting accidental complexity over adding flags, callbacks, state, or compatibility layers. Work autonomously. Do not push, create or merge a PR, or close the issue; the tmux orchestrator owns those steps.`;
  }

  function implementationPrompt(issue, resumed) {
    const action = resumed ? "Continue and finish" : "Implement";
    return `/skill:implement ${action} GitHub issue #${issue.number} (${issue.title}) on the current branch. Read the complete issue and comments, any parent spec, repository instructions, glossary, and relevant ADRs. Treat the issue acceptance criteria as the implementation boundary; parent constraints remain authoritative and open siblings remain deferred. Use TDD where possible at the agreed public-process seam. Keep MDLM lifecycle-neutral and modules deep; simplify before allowing implementation complexity to fan out. Claiming has already been handled. Run focused checks regularly and the full suite at the end, invoke code review, and commit all work with issue #${issue.number} in the commit message. Do not push, create or merge a PR, or close the issue; the tmux orchestrator owns those steps.`;
  }

  function diagnosisPrompt(issue, reasonLog) {
    return `/skill:implement Diagnose and fix the repeatedly failing implementation of GitHub issue #${issue.number} (${issue.title}) on the current branch. Explicitly use the diagnosing-bugs method. The latest failed command validation, explicit VALIDATION: FAIL, or remote PR check in ${reasonLog} is the red-capable signal; inspect failed Actions logs when applicable and reproduce each finding before changing code. Read the complete issue/comments, any parent spec, instructions, glossary, ADRs, branch commits, and validation history. Generate ranked falsifiable hypotheses, then proceed autonomously through regression tests, root-cause repair, cleanup, focused checks, the full suite, and code review. Revert or redesign earlier work rather than layering patches. Preserve the user-visible contract and sibling boundaries. Commit every completed fix with issue #${issue.number}. Do not push, create or merge a PR, or close issues; the tmux orchestrator owns those steps.`;
  }

  function simplificationPrompt(issue, reasonLog, reasons) {
    const trigger = reasons.length > 0 ? reasons.join("; ") : "independent review found disproportionate complexity";
    return `/skill:implement Simplify and finish GitHub issue #${issue.number} (${issue.title}) on the current branch. Explicitly apply the codebase-design and grilling skills before editing. Complexity escalation was triggered by: ${trigger}. Inspect ${reasonLog}, the complete issue/comments and parent constraints, and the entire diff. Preserve every user-visible invariant and acceptance outcome while deleting accidental machinery, speculative generality, workflow state, recovery knobs, duplicated logic, or shallow interfaces. Prefer a smaller deep module and the existing public test seam. Revert or replace prior work when that is cleaner. Then run focused checks, the full suite, code review, and commit the simplification with issue #${issue.number}. Do not push, open/merge a PR, or close issues.`;
  }

  function contractReviewPrompt(issue, reasonLog) {
    return `/skill:implement Resolve a repeated complexity deadlock for GitHub issue #${issue.number} (${issue.title}) and finish it autonomously. Explicitly apply grilling, codebase-design, and diagnosing-bugs. Read ${reasonLog}, the complete issue/comments, parent spec, glossary, ADRs, and full branch history. First try to replace the implementation with a substantially simpler design that preserves the written contract. If and only if a criterion itself forces unbounded analysis, a generic workflow engine, cross-owner atomicity, or similarly disproportionate machinery, choose the smallest user-goal-preserving contract clarification. Never waive atomic publication, one canonical writer, package neutrality, harness neutrality, independent judgment, tests, or review. Record any clarification as an auditable GitHub comment on the active issue naming retained behavior, intentionally given-up behavior, and why the simpler contract still satisfies the parent goal; do not rewrite history or close issues. Implement that clarified contract, add regression evidence, run focused and full checks, invoke code review, and commit all work with issue #${issue.number}. Do not push or create/merge a PR.`;
  }

  function executeAgentAction(issue, prepared, issueLog, paths, state, action, transition = {}) {
    const descriptions = {
      implementation: "implementation",
      remediation: "broad remediation",
      diagnosis: "independent diagnosis",
      simplification: "design simplification",
      "contract-review": "autonomous contract review",
    };
    const description = descriptions[action.kind];
    if (!description) fail(`Unknown pending agent action: ${action.kind}`);
    state = writeState(paths, state, {
      ...transition,
      phase: action.kind,
      pendingAction: action,
      message: `${action.resumed ? "Resuming" : "Running"} ${description} for #${issue.number}`,
      validatedHead: null,
    });
    log(state.message);
    let prompt;
    if (action.kind === "implementation") prompt = implementationPrompt(issue, prepared.resumed || action.resumed);
    else if (action.kind === "remediation") prompt = remediationPrompt(issue, issueLog);
    else if (action.kind === "diagnosis") prompt = diagnosisPrompt(issue, issueLog);
    else if (action.kind === "simplification") prompt = simplificationPrompt(issue, issueLog, action.reasons ?? []);
    else prompt = contractReviewPrompt(issue, issueLog);
    agentRunner.runImplementation(prepared.worktree, prompt, issueLog, `${action.resumed ? "resumed " : ""}${description}`);
    return writeState(paths, state, { pendingAction: null });
  }

  function waitForPullRequestChecks(prNumber, worktree, logPath) {
    const checksExpected = existsSync(join(worktree, ".github", "workflows"));
    const discoveryAttempts = checksExpected ? 12 : 1;
    let checks = [];
    for (let attempt = 1; attempt <= discoveryAttempts; attempt += 1) {
      const result = commandResult("gh", ["pr", "checks", String(prNumber), "--json", "name,state,bucket"], { cwd: worktree });
      try {
        checks = result.stdout.trim() ? JSON.parse(result.stdout) : [];
      } catch {
        checks = [];
      }
      if (result.status !== 0 && checks.length === 0 && !/no checks reported/i.test(result.stderr ?? "")) {
        throw new Error(`Remote check discovery infrastructure failure for PR #${prNumber}: ${result.stderr || result.stdout}`);
      }
      if (checks.length > 0) break;
      if (attempt < discoveryAttempts) sleep(10_000);
    }
    if (checks.length === 0 && !checksExpected) {
      appendAgentLog(logPath, "remote checks", "No repository workflows or registered checks exist; local independent validation is authoritative.\n");
      return;
    }
    if (checks.length === 0) fail(`Expected remote checks did not register for PR #${prNumber}; publication will retry without changing code`);
    const watched = commandResult("gh", ["pr", "checks", String(prNumber), "--watch", "--fail-fast"], { cwd: worktree });
    const output = [watched.stdout, watched.stderr].filter(Boolean).join("\n");
    appendAgentLog(logPath, "remote checks", output);
    if (watched.status !== 0) {
      if (isTransientInfrastructureFailure(new Error(output))) throw new Error(output);
      const latest = commandResult("gh", ["pr", "checks", String(prNumber), "--json", "name,state,bucket"], { cwd: worktree });
      let latestChecks = [];
      try {
        latestChecks = latest.stdout.trim() ? JSON.parse(latest.stdout) : [];
      } catch {
        latestChecks = [];
      }
      if (latestChecks.some((check) => check.bucket === "fail")) fail(`Remote checks failed for PR #${prNumber}; inspect ${logPath}`);
      throw new Error(`Remote check command failed without a failing check bucket for PR #${prNumber}: ${[latest.stdout, latest.stderr, output].filter(Boolean).join("\n")}`);
    }
  }

  function pullRequestHead(prNumber, worktree) {
    return commandOutput("gh", ["pr", "view", String(prNumber), "--json", "headRefOid", "--jq", ".headRefOid"], { cwd: worktree });
  }

  function waitForMergedPullRequest(prNumber, worktree, logPath) {
    for (let attempt = 1; attempt <= 60; attempt += 1) {
      const detail = commandJson("gh", ["pr", "view", String(prNumber), "--json", "state,mergeCommit"], { cwd: worktree });
      if (detail?.state === "MERGED") {
        appendAgentLog(logPath, "merge confirmation", `PR #${prNumber} merged as ${detail.mergeCommit?.oid ?? "unknown"}.\n`);
        return;
      }
      sleep(10_000);
    }
    fail(`PR #${prNumber} did not reach confirmed MERGED state; publication will resume without closing the issue`);
  }

  function publishAndMerge(issue, worktree, branch, logPath, validatedHead, preferredPullRequest, onPullRequest) {
    const base = defaultBranch();
    const localHead = commandOutput("git", ["rev-parse", "HEAD"], { cwd: worktree });
    if (localHead !== validatedHead) fail(`Local head changed after validation for #${issue.number}`);

    let pullRequest = preferredPullRequest
      ? commandJson("gh", ["pr", "view", String(preferredPullRequest), "--json", "number,url,state"], { cwd: worktree })
      : null;
    if (!pullRequest) {
      const existing = commandJson("gh", ["pr", "list", "--head", branch, "--state", "all", "--limit", "1", "--json", "number,url,state"], { cwd: worktree }) ?? [];
      pullRequest = existing[0] ?? null;
    }

    if (pullRequest?.state !== "MERGED") {
      commandOutput("git", ["push", "--set-upstream", "origin", branch], { cwd: worktree });
      if (!pullRequest) {
        const body = `Closes #${issue.number}\n\nImplemented and independently validated by the MDLM frontier loop.`;
        const url = commandOutput("gh", ["pr", "create", "--base", base, "--head", branch, "--title", issue.title, "--body", body], { cwd: worktree });
        pullRequest = { number: parsePullRequestNumber(url), url, state: "OPEN" };
      }
    }

    const prNumber = pullRequest.number;
    onPullRequest(prNumber);
    appendAgentLog(logPath, "pull request", `${pullRequest.url}\n`);
    if (pullRequest.state !== "MERGED") {
      if (pullRequestHead(prNumber, worktree) !== validatedHead) fail(`Remote PR #${prNumber} does not point at validated commit ${validatedHead}`);
      waitForPullRequestChecks(prNumber, worktree, logPath);
      if (pullRequestHead(prNumber, worktree) !== validatedHead) fail(`Remote PR #${prNumber} changed after validation`);
      commandOutput("gh", ["pr", "merge", String(prNumber), "--merge", "--match-head-commit", validatedHead], { cwd: worktree });
    }
    waitForMergedPullRequest(prNumber, worktree, logPath);
    commandResult("git", ["push", "origin", "--delete", branch], { cwd: worktree });
    for (let attempt = 0; attempt < 15 && issueOpen(issue.number); attempt += 1) sleep(2_000);
    if (issueOpen(issue.number)) {
      commandOutput("gh", ["issue", "close", String(issue.number), "--comment", `Implemented and confirmed merged in PR #${prNumber}.`]);
    }
    return prNumber;
  }

  function betweenTicketsPatch() {
    return {
      phase: "between-tickets",
      currentIssue: null,
      currentIssueTitle: null,
      branch: null,
      worktree: null,
      issueLog: null,
      pullRequest: null,
      remediationUsed: false,
      diagnosticEscalations: 0,
      designEscalations: 0,
      contractReviews: 0,
      complexityReviewedHead: null,
      commandsValidatedHead: null,
      pendingAction: null,
      validatedHead: null,
      lastError: null,
    };
  }

  function mergeValidatedIssue(issue, paths, state, prepared, issueLog) {
    const head = commandOutput("git", ["rev-parse", "HEAD"], { cwd: prepared.worktree });
    if (!validatedHeadMatches(state, head)) fail(`Validated branch changed before publication for #${issue.number}`);
    state = writeState(paths, state, { phase: "merging", message: `Publishing and merging #${issue.number}` });
    log(state.message);
    const prNumber = publishAndMerge(
      issue,
      prepared.worktree,
      prepared.branch,
      issueLog,
      head,
      state.pullRequest,
      (pullRequest) => {
        state = writeState(paths, state, { pullRequest });
      },
    );
    state = writeState(paths, state, { pullRequest: prNumber, message: `Merged #${issue.number} in PR #${prNumber}` });
    log(state.message);
    removeWorktree(prepared.worktree, prepared.branch);
    return writeState(paths, state, betweenTicketsPatch());
  }

  function reconcileClosedCurrentIssue(plan, paths, state) {
    if (!state.currentIssue) return state;
    const current = [...plan.children, ...plan.backlog].find((issue) => issue.number === state.currentIssue);
    if (current?.state !== "CLOSED") return state;
    const cwd = state.worktree && existsSync(state.worktree) ? state.worktree : repositoryRoot;
    let merged = [];
    if (state.pullRequest) {
      const detail = commandJson("gh", ["pr", "view", String(state.pullRequest), "--json", "number,state"], { cwd });
      if (detail?.state === "MERGED") merged = [detail];
    } else if (state.branch) {
      merged = commandJson("gh", ["pr", "list", "--head", state.branch, "--state", "merged", "--json", "number"], { cwd }) ?? [];
    }
    if (merged.length === 0) fail(`Issue #${state.currentIssue} closed without a confirmed merged PR; preserving its branch and worktree`);
    if (state.worktree && existsSync(state.worktree)) {
      const dirty = commandOutput("git", ["status", "--porcelain"], { cwd: state.worktree });
      if (dirty) fail(`Closed issue #${state.currentIssue} has a dirty preserved worktree: ${state.worktree}`);
    }
    removeWorktree(state.worktree, state.branch);
    log(`Reconciled confirmed merged issue #${state.currentIssue} after interrupted cleanup`);
    return writeState(paths, state, betweenTicketsPatch());
  }

  function processIssue(issue, paths, state) {
    const continuingIssue = state?.currentIssue === issue.number;
    const prepared = prepareWorktree(issue, paths, state);
    const issueLog = join(paths.root, `issue-${issue.number}.log`);
    const currentHead = commandOutput("git", ["rev-parse", "HEAD"], { cwd: prepared.worktree });
    const pendingAction = continuingIssue ? state.pendingAction ?? null : null;
    const resumeValidated = !pendingAction && validatedHeadMatches(state, currentHead);
    let remediationUsed = continuingIssue ? state.remediationUsed ?? false : false;
    let diagnosticEscalations = continuingIssue ? state.diagnosticEscalations ?? 0 : 0;
    let designEscalations = continuingIssue ? state.designEscalations ?? 0 : 0;
    let contractReviews = continuingIssue ? state.contractReviews ?? 0 : 0;
    let complexityReviewedHead = continuingIssue ? state.complexityReviewedHead ?? null : null;
    let commandsValidatedHead = continuingIssue ? state.commandsValidatedHead ?? null : null;
    state = writeState(paths, state, {
      phase: resumeValidated ? "merging" : pendingAction?.kind ?? (prepared.resumed ? "resuming" : "implementing"),
      message: resumeValidated
        ? `Retrying publication for validated #${issue.number}`
        : `${prepared.resumed ? "Resuming" : "Implementing"} #${issue.number}: ${issue.title}`,
      currentIssue: issue.number,
      currentIssueTitle: issue.title,
      branch: prepared.branch,
      worktree: prepared.worktree,
      issueLog,
      pullRequest: continuingIssue ? state.pullRequest ?? null : null,
      pendingAction,
      remediationUsed,
      diagnosticEscalations,
      designEscalations,
      contractReviews,
      complexityReviewedHead,
      commandsValidatedHead,
      validatedHead: resumeValidated ? currentHead : null,
      lastError: null,
    });
    const login = viewerLogin();
    if (!issue.assignees.some((assignee) => assignee.login === login)) {
      commandOutput("gh", ["issue", "edit", String(issue.number), "--add-assignee", "@me"]);
    }
    log(state.message);
    if (resumeValidated) return mergeValidatedIssue(issue, paths, state, prepared, issueLog);
    if (pendingAction?.kind === "review" || pendingAction?.kind === "validation") {
      state = writeState(paths, state, { pendingAction: null, phase: pendingAction.kind === "review" ? "retrying-review" : "validating" });
    } else {
      state = executeAgentAction(
        issue,
        prepared,
        issueLog,
        paths,
        state,
        pendingAction ? { ...pendingAction, resumed: true } : { kind: "implementation" },
      );
    }

    while (true) {
      const headBeforeValidation = commandOutput("git", ["rev-parse", "HEAD"], { cwd: prepared.worktree });
      const complexityReasons = agentRunner.complexityReasons(prepared.worktree, defaultBranch());
      if (complexityReasons.length > 0 && complexityReviewedHead !== headBeforeValidation && designEscalations < maximumDesignEscalations) {
        designEscalations += 1;
        state = executeAgentAction(issue, prepared, issueLog, paths, state, { kind: "simplification", reasons: complexityReasons }, { designEscalations });
        complexityReviewedHead = commandOutput("git", ["rev-parse", "HEAD"], { cwd: prepared.worktree });
        state = writeState(paths, state, { complexityReviewedHead });
        continue;
      }

      state = writeState(paths, state, {
        phase: "validating",
        pendingAction: null,
        remediationUsed,
        diagnosticEscalations,
        designEscalations,
        contractReviews,
        complexityReviewedHead,
        commandsValidatedHead,
        message: `Validating #${issue.number} (remediation ${remediationUsed ? "used" : "available"}, diagnostics ${diagnosticEscalations}/${maximumDiagnosticEscalations}, simplifications ${designEscalations}/${maximumDesignEscalations}, contract reviews ${contractReviews})`,
      });
      log(state.message);
      const commitCount = Number(commandOutput("git", ["rev-list", "--count", `origin/${defaultBranch()}..HEAD`], { cwd: prepared.worktree }));
      const clean = commandOutput("git", ["status", "--porcelain"], { cwd: prepared.worktree }) === "";
      let commandsPass = commitCount > 0 && clean && commandsValidatedHead === headBeforeValidation;
      if (!commandsPass && commitCount > 0 && clean) {
        state = writeState(paths, state, { phase: "validating", pendingAction: { kind: "validation" } });
        commandsPass = agentRunner.validate(prepared.worktree, issueLog, defaultBranch());
        state = writeState(paths, state, { pendingAction: null });
        const headAfterCommands = commandOutput("git", ["rev-parse", "HEAD"], { cwd: prepared.worktree });
        const cleanAfterCommands = commandOutput("git", ["status", "--porcelain"], { cwd: prepared.worktree }) === "";
        if (commandsPass && (headAfterCommands !== headBeforeValidation || !cleanAfterCommands)) {
          fail(`Independent command validation mutated #${issue.number}; refusing to review or publish unvalidated bytes`);
        }
        commandsValidatedHead = commandsPass ? headBeforeValidation : null;
        state = writeState(paths, state, { commandsValidatedHead });
      }
      let review = { retry: false, passed: false, simplify: false };
      if (commandsPass) {
        state = writeState(paths, state, { phase: "reviewing", pendingAction: { kind: "review" } });
        review = agentRunner.review(issue, prepared.worktree, issueLog, defaultBranch());
        if (!review.retry) state = writeState(paths, state, { pendingAction: null });
      }
      if (commandsPass && review.retry) {
        state = writeState(paths, state, {
          phase: "retrying-review",
          pendingAction: { kind: "review" },
          message: `Reviewer/provider did not return a valid verdict for #${issue.number}; returning control to the supervisor without changing product code`,
        });
        log(state.message);
        fail(`Independent reviewer exhausted its bounded attempts for #${issue.number}`);
      }
      if (commandsPass && review.passed && !review.simplify) {
        const validatedHead = commandOutput("git", ["rev-parse", "HEAD"], { cwd: prepared.worktree });
        state = writeState(paths, state, { validatedHead });
        return mergeValidatedIssue(issue, paths, state, prepared, issueLog);
      }

      let action = validationFailureAction({
        remediationUsed,
        diagnosticEscalations,
        maximumDiagnosticEscalations,
        designEscalations,
        maximumDesignEscalations,
      });
      if (review.simplify && designEscalations < maximumDesignEscalations) action = "simplify";

      if (action === "remediate") {
        remediationUsed = true;
        state = executeAgentAction(issue, prepared, issueLog, paths, state, { kind: "remediation" }, { remediationUsed });
        continue;
      }

      if (action === "diagnose") {
        diagnosticEscalations += 1;
        state = executeAgentAction(issue, prepared, issueLog, paths, state, { kind: "diagnosis" }, { diagnosticEscalations });
        continue;
      }

      if (action === "simplify") {
        designEscalations += 1;
        state = executeAgentAction(issue, prepared, issueLog, paths, state, { kind: "simplification", reasons: complexityReasons }, { designEscalations });
        complexityReviewedHead = commandOutput("git", ["rev-parse", "HEAD"], { cwd: prepared.worktree });
        state = writeState(paths, state, { complexityReviewedHead });
        continue;
      }

      contractReviews += 1;
      remediationUsed = false;
      diagnosticEscalations = 0;
      designEscalations = 0;
      complexityReviewedHead = null;
      state = executeAgentAction(issue, prepared, issueLog, paths, state, { kind: "contract-review" }, {
        remediationUsed,
        diagnosticEscalations,
        designEscalations,
        contractReviews,
        complexityReviewedHead,
      });
    }
  }


  return { processIssue, reconcileClosedCurrentIssue };
}
