import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import type { JsonObject, JsonValue } from "./mdlm-client.js";

export interface AttendedConclusion {
  /** Final normalized conclusion only; raw conversation is never returned to the controller. */
  conclusion: JsonValue;
}

export interface OperatorIO {
  progress(message: string): void;
  attention(outcome: JsonObject): Promise<AttendedConclusion>;
  stopped(status: string, details: JsonObject): void;
}

export class TerminalOperatorIO implements OperatorIO {
  progress(message: string): void {
    stdout.write(`${message}\n`);
  }

  async attention(outcome: JsonObject): Promise<AttendedConclusion> {
    stdout.write("\nMDLM requires attended authority.\n");
    if (typeof outcome.explanation === "string") stdout.write(`${outcome.explanation}\n`);
    if (outcome.authorityRequirement !== undefined) {
      stdout.write(`${JSON.stringify(outcome.authorityRequirement, null, 2)}\n`);
    }
    if (outcome.attentionContext !== undefined) {
      stdout.write(`${JSON.stringify(outcome.attentionContext, null, 2)}\n`);
    }
    if (outcome.checkpointConversation !== undefined) {
      stdout.write(`${JSON.stringify(outcome.checkpointConversation, null, 2)}\n`);
    }
    const terminal = createInterface({ input: stdin, output: stdout });
    try {
      const response = await terminal.question(
        "Explicit conclusion from the named authority holder (not chat approval): ",
      );
      return { conclusion: { statement: response } };
    } finally {
      terminal.close();
    }
  }

  stopped(status: string, details: JsonObject): void {
    stdout.write(`${JSON.stringify({ status, ...details }, null, 2)}\n`);
  }
}
