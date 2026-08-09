#!/usr/bin/env node
import { executeCommandApplication } from "./command-application.js";

const arguments_ = process.argv.slice(2);
const readsAssignmentResponse = arguments_[0] === "scenario" &&
  arguments_[1] === "submit" &&
  (arguments_[2] === undefined || arguments_[2] === "-" || arguments_[2] === "--json");
let standardInput: string | undefined;
if (readsAssignmentResponse) {
  process.stdin.setEncoding("utf8");
  standardInput = "";
  for await (const chunk of process.stdin) standardInput += chunk;
}
const execution = await executeCommandApplication(
  arguments_,
  process.cwd(),
  standardInput,
);
process.stdout.write(execution.output);
process.exitCode = execution.exitCode;
