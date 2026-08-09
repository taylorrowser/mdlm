import {
  dispatchCommand,
  failure,
  renderCommandResult,
  type CommandResult,
} from "./req.js";

export interface CommandApplicationExecution {
  exitCode: 0 | 1;
  output: string;
}

function presentAsMdlm(result: CommandResult): CommandResult {
  if (result.diagnostics === undefined) return result;
  return {
    ...result,
    diagnostics: result.diagnostics.map((diagnostic) => ({
      ...diagnostic,
      code: diagnostic.code === "req-error" ? "mdlm-error" : diagnostic.code,
      message: diagnostic.message.replaceAll("'req ", "'mdlm "),
    })),
  };
}

/** Dispatch and render one MDLM invocation without owning process startup. */
export async function executeCommandApplication(
  arguments_: string[],
  repositoryRoot: string,
): Promise<CommandApplicationExecution> {
  const json = arguments_.includes("--json");
  let result: CommandResult;
  try {
    result = presentAsMdlm(
      await dispatchCommand(arguments_, repositoryRoot),
    );
  } catch (error) {
    result = failure(
      "mdlm-error",
      error instanceof Error ? error.message : String(error),
    );
  }
  return {
    exitCode: result.ok ? 0 : 1,
    output: `${json ? JSON.stringify(result, null, 2) : renderCommandResult(result)}\n`,
  };
}
