#!/usr/bin/env node
import { executeCommandApplication } from "./command-application.js";
import { writeCommandOutput } from "./command-output.js";
import { collectPerformanceDiagnostics } from "./performance-diagnostics.js";

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
const measured = await collectPerformanceDiagnostics(() =>
  executeCommandApplication(
    arguments_,
    process.cwd(),
    standardInput,
  )
);
await writeCommandOutput(process.stdout, measured.value.output);
if (process.env.MDLM_PERFORMANCE === "json") {
  await writeCommandOutput(
    process.stderr,
    `${JSON.stringify(measured.diagnostics)}\n`,
  );
}
process.exitCode = measured.value.exitCode;
