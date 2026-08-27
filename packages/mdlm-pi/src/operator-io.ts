import { stdin, stdout } from "node:process";
import { TextDecoder } from "node:util";
import type { Readable, Writable } from "node:stream";
import type { JsonObject, JsonValue } from "./mdlm-client.js";

const framedPrefix = Buffer.from("MDLM-ATTENDED/1 ", "ascii");
const interactiveDelimiter = ".mdlm-submit";
export const maximumAttendedAnswerBytes = 64 * 1024;

export interface AttendedConclusion {
  /** Final normalized conclusion only; raw conversation is never returned to the controller. */
  conclusion: JsonValue;
}

export interface OperatorIO {
  progress(message: string): void;
  attention(outcome: JsonObject): Promise<AttendedConclusion>;
  stopped(status: string, details: JsonObject): void;
}

export class AttendedInputError extends Error {
  constructor(
    readonly code:
      | "ATTENDED_INPUT_EMPTY"
      | "ATTENDED_INPUT_INVALID_UTF8"
      | "ATTENDED_INPUT_TOO_LARGE"
      | "ATTENDED_INPUT_INCOMPLETE"
      | "ATTENDED_INPUT_STREAM_FAILURE",
    message: string,
  ) {
    super(message);
    this.name = "AttendedInputError";
  }
}

export interface TerminalOperatorIOOptions {
  input?: Readable;
  output?: Writable;
  terminal?: boolean;
  maximumAnswerBytes?: number;
}

/**
 * Reads one attended answer without treating an embedded newline as the frame end.
 *
 * Non-terminal automation may send `MDLM-ATTENDED/1 <utf8-bytes>\n<payload>`.
 * Frames can be adjacent. The existing demo runner remains compatible through a
 * legacy frame made from one UTF-8 answer, one framing LF, and EOF.
 *
 * A terminal answer ends only when `.mdlm-submit` is entered on its own line.
 */
export class AttendedAnswerReader {
  private buffer = Buffer.alloc(0);
  private ended = false;
  private readonly iterator: AsyncIterator<unknown>;

  constructor(
    private readonly input: Readable,
    private readonly terminal: boolean,
    private readonly maximumAnswerBytes = maximumAttendedAnswerBytes,
  ) {
    if (!Number.isSafeInteger(maximumAnswerBytes) || maximumAnswerBytes < 1) {
      throw new RangeError("maximumAnswerBytes must be a positive safe integer");
    }
    this.iterator = input[Symbol.asyncIterator]();
  }

  async read(): Promise<string> {
    const payload = this.terminal
      ? await this.readInteractiveFrame()
      : await this.readNonTerminalFrame();
    if (payload.byteLength === 0) {
      throw new AttendedInputError(
        "ATTENDED_INPUT_EMPTY",
        "the attended answer must not be empty",
      );
    }
    if (payload.byteLength > this.maximumAnswerBytes) {
      throw new AttendedInputError(
        "ATTENDED_INPUT_TOO_LARGE",
        `the attended answer exceeds ${this.maximumAnswerBytes} UTF-8 bytes`,
      );
    }
    try {
      return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(payload);
    } catch {
      throw new AttendedInputError(
        "ATTENDED_INPUT_INVALID_UTF8",
        "the attended answer is not valid UTF-8",
      );
    }
  }

  private async readNonTerminalFrame(): Promise<Buffer> {
    await this.readWhilePossibleFramePrefix();
    if (this.buffer.subarray(0, framedPrefix.byteLength).equals(framedPrefix)) {
      return this.readLengthFrame();
    }
    return this.readLegacyEofFrame();
  }

  private async readWhilePossibleFramePrefix(): Promise<void> {
    while (
      !this.ended
      && this.buffer.byteLength < framedPrefix.byteLength
      && framedPrefix.subarray(0, this.buffer.byteLength).equals(this.buffer)
    ) {
      await this.readChunk();
    }
  }

  private async readLengthFrame(): Promise<Buffer> {
    let newline = this.buffer.indexOf(0x0a);
    while (newline === -1) {
      if (this.buffer.byteLength > 64) {
        throw this.incomplete("the attended input frame header is invalid");
      }
      if (this.ended) {
        throw this.incomplete("EOF interrupted the attended input frame header");
      }
      await this.readChunk();
      newline = this.buffer.indexOf(0x0a);
    }
    if (newline > 63) {
      throw this.incomplete("the attended input frame header is invalid");
    }
    const header = this.buffer.subarray(0, newline + 1).toString("ascii");
    const match = /^MDLM-ATTENDED\/1 (0|[1-9][0-9]*)\n$/.exec(header);
    if (match?.[1] === undefined) {
      throw this.incomplete("the attended input frame header is invalid");
    }
    const length = Number(match[1]);
    if (!Number.isSafeInteger(length)) {
      throw this.incomplete("the attended input frame length is invalid");
    }
    if (length > this.maximumAnswerBytes) {
      throw new AttendedInputError(
        "ATTENDED_INPUT_TOO_LARGE",
        `the attended answer exceeds ${this.maximumAnswerBytes} UTF-8 bytes`,
      );
    }
    this.buffer = this.buffer.subarray(newline + 1);
    while (this.buffer.byteLength < length) {
      if (this.ended) {
        throw this.incomplete("EOF interrupted the attended input frame payload");
      }
      await this.readChunk();
    }
    const payload = Buffer.from(this.buffer.subarray(0, length));
    this.buffer = this.buffer.subarray(length);
    return payload;
  }

  private async readLegacyEofFrame(): Promise<Buffer> {
    while (!this.ended) {
      if (this.buffer.byteLength > this.maximumAnswerBytes + 2) {
        throw new AttendedInputError(
          "ATTENDED_INPUT_TOO_LARGE",
          `the attended answer exceeds ${this.maximumAnswerBytes} UTF-8 bytes`,
        );
      }
      await this.readChunk();
    }
    if (this.buffer.byteLength === 0) return Buffer.alloc(0);
    if (this.buffer.at(-1) !== 0x0a) {
      throw this.incomplete("EOF did not follow the legacy attended input framing newline");
    }
    const framingBytes = this.buffer.at(-2) === 0x0d ? 2 : 1;
    const payload = Buffer.from(this.buffer.subarray(0, -framingBytes));
    this.buffer = Buffer.alloc(0);
    return payload;
  }

  private async readInteractiveFrame(): Promise<Buffer> {
    while (true) {
      const boundary = interactiveBoundary(this.buffer);
      if (boundary !== null) {
        const payload = Buffer.from(this.buffer.subarray(0, boundary.payloadEnd));
        this.buffer = this.buffer.subarray(boundary.frameEnd);
        return payload;
      }
      if (this.buffer.byteLength > this.maximumAnswerBytes + interactiveDelimiter.length + 4) {
        throw new AttendedInputError(
          "ATTENDED_INPUT_TOO_LARGE",
          `the attended answer exceeds ${this.maximumAnswerBytes} UTF-8 bytes`,
        );
      }
      if (this.ended) {
        throw this.incomplete(
          `EOF arrived before the interactive ${interactiveDelimiter} delimiter`,
        );
      }
      await this.readChunk();
    }
  }

  private async readChunk(): Promise<void> {
    let result: IteratorResult<unknown>;
    try {
      result = await this.iterator.next();
    } catch (error) {
      throw new AttendedInputError(
        "ATTENDED_INPUT_STREAM_FAILURE",
        `failed to read the attended answer: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (result.done) {
      this.ended = true;
      return;
    }
    const chunk = result.value;
    if (typeof chunk !== "string" && !ArrayBuffer.isView(chunk)) {
      throw new AttendedInputError(
        "ATTENDED_INPUT_STREAM_FAILURE",
        "the attended input stream returned a non-byte chunk",
      );
    }
    this.buffer = Buffer.concat([
      this.buffer,
      typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(
        chunk.buffer,
        chunk.byteOffset,
        chunk.byteLength,
      ),
    ]);
  }

  private incomplete(message: string): AttendedInputError {
    return new AttendedInputError("ATTENDED_INPUT_INCOMPLETE", message);
  }
}

export class TerminalOperatorIO implements OperatorIO {
  private readonly output: Writable;
  private readonly terminal: boolean;
  private readonly answers: AttendedAnswerReader;

  constructor(options: TerminalOperatorIOOptions = {}) {
    const input = options.input ?? stdin;
    this.output = options.output ?? stdout;
    this.terminal = options.terminal ?? Boolean((input as Readable & { isTTY?: boolean }).isTTY);
    this.answers = new AttendedAnswerReader(
      input,
      this.terminal,
      options.maximumAnswerBytes,
    );
  }

  progress(message: string): void {
    this.output.write(`${message}\n`);
  }

  async attention(outcome: JsonObject): Promise<AttendedConclusion> {
    this.output.write("\nMDLM requires attended authority.\n");
    if (typeof outcome.explanation === "string") this.output.write(`${outcome.explanation}\n`);
    if (outcome.authorityRequirement !== undefined) {
      this.output.write(`${JSON.stringify(outcome.authorityRequirement, null, 2)}\n`);
    }
    if (outcome.attentionContext !== undefined) {
      this.output.write(`${JSON.stringify(outcome.attentionContext, null, 2)}\n`);
    }
    if (outcome.checkpointConversation !== undefined) {
      this.output.write(`${JSON.stringify(outcome.checkpointConversation, null, 2)}\n`);
    }
    if (this.terminal) {
      this.output.write(
        `Enter the explicit conclusion from the named authority holder. `
        + `Finish with ${interactiveDelimiter} on its own line.\n`,
      );
    } else {
      this.output.write("Explicit conclusion from the named authority holder (not chat approval): ");
    }
    const response = await this.answers.read();
    return { conclusion: { statement: response } };
  }

  stopped(status: string, details: JsonObject): void {
    this.output.write(`${JSON.stringify({ status, ...details }, null, 2)}\n`);
  }
}

function interactiveBoundary(buffer: Buffer): {
  payloadEnd: number;
  frameEnd: number;
} | null {
  const delimiter = Buffer.from(interactiveDelimiter, "utf8");
  let lineStart = 0;
  while (lineStart <= buffer.byteLength) {
    const newline = buffer.indexOf(0x0a, lineStart);
    if (newline === -1) return null;
    const carriageReturn = newline > lineStart && buffer[newline - 1] === 0x0d;
    const lineEnd = carriageReturn ? newline - 1 : newline;
    if (buffer.subarray(lineStart, lineEnd).equals(delimiter)) {
      const precedingCarriageReturn = lineStart >= 2 && buffer[lineStart - 2] === 0x0d;
      const payloadEnd = lineStart === 0
        ? 0
        : lineStart - (precedingCarriageReturn ? 2 : 1);
      return { payloadEnd, frameEnd: newline + 1 };
    }
    lineStart = newline + 1;
  }
  return null;
}
