export const ROOT_TEST_OBSERVATION_KINDS: Readonly<{
  CANONICAL_IN_PROCESS: "canonical-in-process";
  PROCESS_REPOSITORY: "process-repository";
}>;
export const PROCESS_REPOSITORY_TEST_TIMEOUT_MS: 240000;
export const PROCESS_REPOSITORY_HOOK_TIMEOUT_MS: 40000;
export const PROCESS_REPOSITORY_CHILD_TIMEOUT_MS: 60000;
export const CONTENDED_IN_PROCESS_SETUP_LIMITS: Readonly<Record<string, number>>;
export type RootTestObservationPolicy = Readonly<{
  file: string;
  runtimeClass: string;
  observationKind: "canonical-in-process" | "process-repository";
  boundaryOwnership: string;
  effectiveDefaultTestTimeoutMs: number;
  effectiveDefaultHookTimeoutMs: number;
  disposition: string;
}>;
export const rootTestObservationPolicy: readonly RootTestObservationPolicy[];
export function rootTestObservationPolicyForPath(
  testPath: string,
  root?: string,
): RootTestObservationPolicy | undefined;
export type RootTestObservationBoundary = Readonly<{
  line: number;
  kind: "test" | "hook";
  call: string;
  title: string;
  declaredLimit: string;
  effectiveTimeoutMs: number;
}>;
export function verifyRootTestObservationPolicy(root?: string): readonly Readonly<
  RootTestObservationPolicy & { boundaries: readonly RootTestObservationBoundary[] }
>[];
export type RootTestChildProcessLaunch = Readonly<{
  key: string;
  file: string;
  line: number;
  api: "exec" | "execFile" | "execFileSync" | "execSync" | "fork" | "spawn" | "spawnSync";
  declaredTimeout: string;
  effectiveTimeoutMs: number | null;
  disposition: string;
  reachableFrom: readonly string[];
}>;
export type RootTestNonChildTimeout = Readonly<{
  file: string;
  line: number;
  kind: string;
  effectiveTimeout: string;
  disposition: string;
}>;
export type RootTestChildProcessInventory = Readonly<{
  manifests: readonly Readonly<{ file: string; sourceFiles: readonly string[] }>[];
  launches: readonly RootTestChildProcessLaunch[];
  nonChildTimeouts: readonly RootTestNonChildTimeout[];
}>;
export function verifyRootTestChildProcessPolicy(root?: string): RootTestChildProcessInventory;
export function renderRootTestObservationInventory(root?: string): string;
