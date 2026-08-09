#!/usr/bin/env node
import { executeCommandApplication } from "./command-application.js";

const execution = await executeCommandApplication(
  process.argv.slice(2),
  process.cwd(),
  { legacyRepositoryInitialization: true },
);
process.stdout.write(execution.output);
process.exitCode = execution.exitCode;
