#!/usr/bin/env node
import { runMdlmCli } from "./cli-main.js";

const arguments_ = process.argv.slice(2);
const submitArguments = arguments_.filter((argument) => argument !== "--json");
const readsAssignmentResponse =
  (submitArguments[0] === "proposal" && submitArguments[1] === "submit" && submitArguments[2] === "-") ||
  (submitArguments[0] === "scenario" &&
    submitArguments[1] === "submit" &&
    (submitArguments[2] === undefined || submitArguments[2] === "-")) ||
  (submitArguments[0] === "assignment" &&
    submitArguments[1] === "submit-proposal" &&
    submitArguments[2] === "-");
let standardInput: string | undefined;
if (readsAssignmentResponse) {
  process.stdin.setEncoding("utf8");
  standardInput = "";
  for await (const chunk of process.stdin) standardInput += chunk;
}
process.exitCode = await runMdlmCli({
  arguments_,
  cwd: process.cwd(),
  standardInput,
  stdout: process.stdout,
  stderr: process.stderr,
  performanceDiagnostics: process.env.MDLM_PERFORMANCE === "json",
});
