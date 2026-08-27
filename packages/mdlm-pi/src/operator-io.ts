import { stdin, stdout } from "node:process";
import type { Readable, Writable } from "node:stream";
import { TextDecoder } from "node:util";
import type { JsonObject, JsonValue } from "./mdlm-client.js";

const framedPrefix = Buffer.from("MDLM-ATTENDED/1 ", "ascii");
const maximumFrameHeaderBytes = 64;
const interactiveDelimiter = ".mdlm-submit";
export const maximumAttendedAnswerBytes = 64 * 1024;

export type AttendedInputMode =
  | "framed-v1"
  | "legacy-eof"
  | "terminal-delimiter";

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
      | "ATTENDED_INPUT_CANCELLED"
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
  mode?: AttendedInputMode;
  maximumAnswerBytes?: number;
  signal?: AbortSignal;
}

/**
 * Reads attended answers using one transport selected before input is read.
 *
 * `legacy-eof` accepts one answer, one framing LF, and EOF. `framed-v1`
 * accepts adjacent `MDLM-ATTENDED/1 <utf8-bytes>\n<payload>` frames.
 * `terminal-delimiter` ends an answer at `.mdlm-submit` followed by LF.
 */
export class AttendedAnswerReader {
  private buffer = Buffer.alloc(0);
  private ended = false;
  private readonly iterator: AsyncIterator<unknown>;
  private readonly bufferLimit: number;

  constructor(
    private readonly input: Readable,
    private readonly mode: AttendedInputMode,
    private readonly maximumAnswerBytes = maximumAttendedAnswerBytes,
    private readonly signal?: AbortSignal,
  ) {
    if (
      !Number.isSafeInteger(maximumAnswerBytes)
      || maximumAnswerBytes < 1
      || maximumAnswerBytes > maximumAttendedAnswerBytes
    ) {
      throw new RangeError(
        `maximumAnswerBytes must be between 1 and ${maximumAttendedAnswerBytes}`,
      );
    }
    this.iterator = input[Symbol.asyncIterator]();
    this.bufferLimit = inputBufferLimit(mode, maximumAnswerBytes);
  }

  async read(): Promise<string> {
    this.assertNotCancelled();
    const payload = this.mode === "terminal-delimiter"
      ? await this.readInteractiveFrame()
      : this.mode === "framed-v1"
        ? await this.readLengthFrame()
        : await this.readLegacyEofFrame();
    this.assertNotCancelled();
    if (payload.byteLength === 0) {
      throw new AttendedInputError(
        "ATTENDED_INPUT_EMPTY",
        "the attended answer must not be empty",
      );
    }
    if (payload.byteLength > this.maximumAnswerBytes) throw this.tooLarge();
    try {
      return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(payload);
    } catch {
      throw new AttendedInputError(
        "ATTENDED_INPUT_INVALID_UTF8",
        "the attended answer is not valid UTF-8",
      );
    }
  }

  private async readLengthFrame(): Promise<Buffer> {
    let newline = this.buffer.indexOf(0x0a);
    while (newline === -1) {
      if (this.buffer.byteLength >= maximumFrameHeaderBytes) {
        throw this.incomplete("the attended input frame header is invalid");
      }
      if (this.ended) {
        throw this.incomplete("EOF interrupted the attended input frame header");
      }
      await this.readChunk();
      newline = this.buffer.indexOf(0x0a);
    }
    if (newline >= maximumFrameHeaderBytes) {
      throw this.incomplete("the attended input frame header is invalid");
    }
    const length = parseFrameLength(this.buffer.subarray(0, newline));
    if (length === null) {
      throw this.incomplete("the attended input frame header is invalid");
    }
    if (length > this.maximumAnswerBytes) throw this.tooLarge();
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
    while (!this.ended) await this.readChunk();
    if (this.buffer.byteLength === 0) return Buffer.alloc(0);
    if (this.buffer.at(-1) !== 0x0a) {
      throw this.incomplete("EOF did not follow the legacy attended input framing LF");
    }
    const payloadLength = this.buffer.byteLength - 1;
    if (payloadLength > this.maximumAnswerBytes) throw this.tooLarge();
    const payload = Buffer.from(this.buffer.subarray(0, payloadLength));
    this.buffer = Buffer.alloc(0);
    return payload;
  }

  private async readInteractiveFrame(): Promise<Buffer> {
    while (true) {
      const boundary = interactiveBoundary(this.buffer);
      if (boundary !== null) {
        if (boundary.payloadEnd > this.maximumAnswerBytes) throw this.tooLarge();
        const payload = Buffer.from(this.buffer.subarray(0, boundary.payloadEnd));
        this.buffer = this.buffer.subarray(boundary.frameEnd);
        return payload;
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
      result = await this.nextChunk();
    } catch (error) {
      if (error instanceof AttendedInputError) throw error;
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
    const chunkLength = typeof chunk === "string"
      ? strictUtf8Length(chunk)
      : chunk.byteLength;
    if (chunkLength > this.bufferLimit - this.buffer.byteLength) throw this.tooLarge();
    const bytes = typeof chunk === "string"
      ? Buffer.from(chunk, "utf8")
      : Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    this.buffer = Buffer.concat([this.buffer, bytes], this.buffer.byteLength + chunkLength);
  }

  private async nextChunk(): Promise<IteratorResult<unknown>> {
    this.assertNotCancelled();
    if (this.signal === undefined) return this.iterator.next();
    const signal = this.signal;
    return await new Promise<IteratorResult<unknown>>((resolve, reject) => {
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", onAbort);
        callback();
      };
      const onAbort = () => finish(() => {
        reject(this.cancelled());
        try {
          this.input.pause();
          this.input.destroy();
          (this.input as Readable & { unref?: () => void }).unref?.();
        } catch {
          // Cancellation already settled the attended read; cleanup is best effort.
        }
        try {
          void this.iterator.return?.().catch(() => undefined);
        } catch {
          // A custom iterator must not replace the typed cancellation.
        }
      });
      signal.addEventListener("abort", onAbort, { once: true });
      void this.iterator.next().then(
        (result) => finish(() => resolve(result)),
        (error: unknown) => finish(() => reject(error)),
      );
      if (signal.aborted) onAbort();
    });
  }

  private assertNotCancelled(): void {
    if (this.signal?.aborted) throw this.cancelled();
  }

  private cancelled(): AttendedInputError {
    return new AttendedInputError(
      "ATTENDED_INPUT_CANCELLED",
      "attended input was cancelled",
    );
  }

  private incomplete(message: string): AttendedInputError {
    return new AttendedInputError("ATTENDED_INPUT_INCOMPLETE", message);
  }

  private tooLarge(): AttendedInputError {
    return new AttendedInputError(
      "ATTENDED_INPUT_TOO_LARGE",
      `the attended answer exceeds ${this.maximumAnswerBytes} UTF-8 bytes`,
    );
  }
}

export class TerminalOperatorIO implements OperatorIO {
  private readonly output: Writable;
  private readonly mode: AttendedInputMode;
  private readonly answers: AttendedAnswerReader;

  constructor(options: TerminalOperatorIOOptions = {}) {
    const input = options.input ?? stdin;
    this.output = options.output ?? stdout;
    this.mode = options.mode ?? (
      (input as Readable & { isTTY?: boolean }).isTTY
        ? "terminal-delimiter"
        : "legacy-eof"
    );
    this.answers = new AttendedAnswerReader(
      input,
      this.mode,
      options.maximumAnswerBytes,
      options.signal,
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
    if (this.mode === "terminal-delimiter") {
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

function inputBufferLimit(mode: AttendedInputMode, maximumAnswerBytes: number): number {
  if (mode === "legacy-eof") return maximumAnswerBytes + 1;
  if (mode === "framed-v1") {
    return 2 * (maximumAnswerBytes + maximumFrameHeaderBytes);
  }
  return 2 * (maximumAnswerBytes + Buffer.byteLength(interactiveDelimiter) + 2);
}

function parseFrameLength(header: Buffer): number | null {
  if (
    header.byteLength <= framedPrefix.byteLength
    || !header.subarray(0, framedPrefix.byteLength).equals(framedPrefix)
  ) {
    return null;
  }
  const digits = header.subarray(framedPrefix.byteLength);
  if (digits.byteLength > 1 && digits[0] === 0x30) return null;
  let length = 0;
  for (const byte of digits) {
    if (byte < 0x30 || byte > 0x39) return null;
    length = length * 10 + byte - 0x30;
    if (!Number.isSafeInteger(length)) return null;
  }
  return length;
}

function strictUtf8Length(value: string): number {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const low = value.charCodeAt(index + 1);
      if (low < 0xdc00 || low > 0xdfff) throw invalidScalarString();
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw invalidScalarString();
    }
  }
  return Buffer.byteLength(value, "utf8");
}

function invalidScalarString(): AttendedInputError {
  return new AttendedInputError(
    "ATTENDED_INPUT_INVALID_UTF8",
    "the attended input stream returned a string with an unpaired surrogate",
  );
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
    if (buffer.subarray(lineStart, newline).equals(delimiter)) {
      return {
        payloadEnd: lineStart === 0 ? 0 : lineStart - 1,
        frameEnd: newline + 1,
      };
    }
    lineStart = newline + 1;
  }
  return null;
}
