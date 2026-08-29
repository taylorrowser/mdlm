#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { executeCommandApplication } from "./command-application.js";
import {
  type CommandOutputStream,
  writeCommandOutput,
} from "./command-output.js";
import { collectPerformanceDiagnostics } from "./performance-diagnostics.js";

const arguments_ = process.argv.slice(2);
const submitArguments = arguments_.filter((argument) => argument !== "--json");
const readsAssignmentResponse = submitArguments[0] === "scenario" &&
  submitArguments[1] === "submit" &&
  (submitArguments[2] === undefined || submitArguments[2] === "-");
export interface MdlmCliOptions {
  arguments_: string[];
  cwd: string;
  standardInput?: string | undefined;
  stdout: CommandOutputStream;
  stderr: CommandOutputStream;
  performanceDiagnostics: boolean;
}

export async function runMdlmCli(options: MdlmCliOptions): Promise<number> {
  const measured = await collectPerformanceDiagnostics(() =>
    executeCommandApplication(
      options.arguments_,
      options.cwd,
      options.standardInput,
    )
  );
  await writeCommandOutput(options.stdout, measured.value.output);
  if (options.performanceDiagnostics) {
    await writeCommandOutput(
      options.stderr,
      `${JSON.stringify(measured.diagnostics)}\n`,
    );
  }
  return measured.value.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
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
}
