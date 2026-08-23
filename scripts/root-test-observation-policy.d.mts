export const ROOT_TEST_OBSERVATION_KINDS: Readonly<{
  CANONICAL_IN_PROCESS: "canonical-in-process";
  PROCESS_REPOSITORY: "process-repository";
}>;
export const PROCESS_REPOSITORY_TEST_TIMEOUT_MS: 180000;
export const PROCESS_REPOSITORY_HOOK_TIMEOUT_MS: 40000;
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
export function renderRootTestObservationInventory(root?: string): string;
