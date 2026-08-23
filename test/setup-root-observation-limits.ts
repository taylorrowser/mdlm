import { expect, vi } from "vitest";
import {
  CONTENDED_IN_PROCESS_SETUP_LIMITS,
  PROCESS_REPOSITORY_HOOK_TIMEOUT_MS,
  PROCESS_REPOSITORY_TEST_TIMEOUT_MS,
  ROOT_TEST_OBSERVATION_KINDS,
  rootTestObservationPolicyForPath,
} from "../scripts/root-test-observation-policy.mjs";

const testPath = expect.getState().testPath;
if (!testPath) throw new Error("Root observation policy requires the current test path");
const policy = rootTestObservationPolicyForPath(testPath);
if (!policy) throw new Error(`Root observation policy is missing ${testPath}`);

if (policy.observationKind === ROOT_TEST_OBSERVATION_KINDS.PROCESS_REPOSITORY) {
  vi.setConfig({
    hookTimeout: PROCESS_REPOSITORY_HOOK_TIMEOUT_MS,
    testTimeout: PROCESS_REPOSITORY_TEST_TIMEOUT_MS,
  });
} else {
  const hookTimeout = CONTENDED_IN_PROCESS_SETUP_LIMITS[policy.file];
  if (hookTimeout !== undefined) vi.setConfig({ hookTimeout });
}
