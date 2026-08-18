import { it } from "vitest";
import { runDistinctContextPhaseTwoRoute } from "./helpers/proportional-phase-2-routes.js";

it(
  "completes separate zero-interface DWP and SYS routes for distinct contexts",
  runDistinctContextPhaseTwoRoute,
  420_000,
);
