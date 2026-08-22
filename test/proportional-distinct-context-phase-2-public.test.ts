import { it } from "vitest";
import { runZeroInterfacePhaseTwoRoute } from "./helpers/proportional-phase-2-routes.js";

it(
  "publishes one zero-interface DWP and SYS through the compiled public boundary",
  runZeroInterfacePhaseTwoRoute,
  420_000,
);
