#!/usr/bin/env node
import { executeCommandApplication } from "./command-application.js";

const suppliedArguments = process.argv.slice(2);
const execution = await executeCommandApplication({
  arguments: suppliedArguments.length > 0
    ? suppliedArguments
    : ["process", "validate", "--ref", ".lifecycle/process"],
  repositoryRoot: process.cwd(),
});
process.stdout.write(execution.output);
process.exitCode = execution.exitCode;
