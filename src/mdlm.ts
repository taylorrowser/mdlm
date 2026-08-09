#!/usr/bin/env node
import { executeCommandApplication } from "./req.js";

const execution = await executeCommandApplication({
  arguments: process.argv.slice(2),
  repositoryRoot: process.cwd(),
  commandName: "mdlm",
});
process.stdout.write(execution.output);
if (execution.errorOutput) process.stderr.write(execution.errorOutput);
process.exitCode = execution.exitCode;
