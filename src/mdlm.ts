#!/usr/bin/env node
import { executeCommandApplication } from "./command-application.js";

const execution = await executeCommandApplication({
  arguments: process.argv.slice(2),
  repositoryRoot: process.cwd(),
});
process.stdout.write(execution.output);
process.exitCode = execution.exitCode;
