import { it } from "vitest";
import { runZeroInterfacePhaseTwoRoute } from "./helpers/proportional-phase-2-routes.js";

const CONTENDED_PHASE_TWO_TEST_TIMEOUT_MS = 480_000;

it(
  "publishes one zero-interface DWP and SYS through the compiled public boundary",
  runZeroInterfacePhaseTwoRoute,
  CONTENDED_PHASE_TWO_TEST_TIMEOUT_MS,
);
