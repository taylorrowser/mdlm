import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

/** A trusted fixture reviewer supplies verdicts; the production CLI still owns registration. */
export function reviewFixtureEnvironment(lifecycle: string): NodeJS.ProcessEnv {
  const registry = path.join(path.dirname(lifecycle), "review-registry");
  mkdirSync(registry, {recursive: true});
  const environment: NodeJS.ProcessEnv = {...process.env, MDLM_REVIEW_REGISTRY: registry};
  delete environment.MDLM_REVIEW_REGISTRAR;
  return environment;
}

export function registerReviewFixture(executable: string, lifecycle: string, assignment: string, verdict: unknown, environment: NodeJS.ProcessEnv): void {
  const context = spawnSync(process.execPath, [executable, "assignment", "review-context", assignment, "--json"], {cwd: lifecycle, env: environment, encoding: "utf8", maxBuffer: 16 * 1024 * 1024});
  if (context.status !== 0) throw new Error(context.stdout || context.stderr);
  const contextFile = path.join(environment.MDLM_REVIEW_REGISTRY!, "context.json");
  const verdictFile = path.join(environment.MDLM_REVIEW_REGISTRY!, "verdict.json");
  writeFileSync(contextFile, context.stdout); writeFileSync(verdictFile, JSON.stringify(verdict));
  const registered = spawnSync(process.execPath, [executable, "assignment", "register-review", assignment, contextFile, verdictFile, "--json"], {cwd: lifecycle, env: {...environment, MDLM_REVIEW_REGISTRAR: "1"}, encoding: "utf8"});
  if (registered.status !== 0) throw new Error(registered.stdout || registered.stderr);
}
