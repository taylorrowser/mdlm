#!/usr/bin/env node
import { executeLegacyReqApplication } from "./command-application.js";

const execution = await executeLegacyReqApplication(
  process.argv.slice(2),
  process.cwd(),
);
process.stdout.write(execution.output);
process.exitCode = execution.exitCode;
