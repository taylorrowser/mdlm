#!/usr/bin/env node
import { executeCommandApplication } from "./command-application.js";

const arguments_ = process.argv.slice(2);
const submitArguments = arguments_.filter((argument) => argument !== "--json");
const readsAssignmentResponse = submitArguments[0] === "scenario" &&
  submitArguments[1] === "submit" &&
  (submitArguments[2] === undefined || submitArguments[2] === "-");
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
