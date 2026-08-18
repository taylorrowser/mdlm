import { it } from "vitest";
import { runCoherentPhaseTwoRoute } from "./helpers/proportional-phase-2-routes.js";

it(
  "publishes one shared ASP, one actual ICSP, one many-parent DWP, and detailed SYS",
  runCoherentPhaseTwoRoute,
  420_000,
);
