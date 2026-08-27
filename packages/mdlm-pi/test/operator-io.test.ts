import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PassThrough, Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  AttendedAnswerReader,
  TerminalOperatorIO,
} from "../src/operator-io.js";

const packageRoot = path.resolve(import.meta.dirname, "..");
const fixture = path.join(
  import.meta.dirname,
  "fixtures/markdown-run-010-attended-answer.txt",
);

describe("TerminalOperatorIO", () => {
  it("captures the exact multiline Markdown run 010 attended answer", async () => {
    const wording = await readFile(fixture);
    expect(wording.byteLength).toBe(3_485);
    expect(createHash("sha256").update(wording).digest("hex")).toBe(
      "30af520562fbbcc9475c91f3f38e481adc60b82239bb2ae40ee3aa6630690fe6",
    );
    const runnerInput = Buffer.concat([wording, Buffer.from("\n")]);
    expect(runnerInput.byteLength).toBe(3_486);

    const result = await invokeTerminalOperatorIO(runnerInput);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout.split("RESULT=").at(-1) ?? "")).toEqual({
      conclusion: { statement: wording.toString("utf8") },
    });
  });

  it("treats framing-looking legacy wording as one exact answer", async () => {
    const wording = "MDLM-ATTENDED/1 5\nhello";
    const input = new PassThrough();
    const io = new TerminalOperatorIO({ input, output: new PassThrough() });
    input.end(`${wording}\n`);

    await expect(io.attention({})).resolves.toEqual({
      conclusion: { statement: wording },
    });
  });

  it("preserves a trailing lone CR at the 65,536-byte legacy boundary", async () => {
    const wording = `${"a".repeat(65_535)}\r`;
    const input = new PassThrough();
    const io = new TerminalOperatorIO({ input, output: new PassThrough() });
    input.end(`${wording}\n`);

    await expect(io.attention({})).resolves.toEqual({
      conclusion: { statement: wording },
    });
  });

  it("rejects 65,537 legacy bytes even when the last answer byte is CR", async () => {
    const input = new PassThrough();
    const io = new TerminalOperatorIO({ input, output: new PassThrough() });
    input.end(`${"a".repeat(65_536)}\r\n`);

    await expect(io.attention({})).rejects.toMatchObject({
      code: "ATTENDED_INPUT_TOO_LARGE",
    });
  });

  it("leaves an adjacent length-framed answer for the next attended read", async () => {
    const wire = Buffer.concat([
      frame(Buffer.from("first line\r\nsecond line")),
      frame(Buffer.from("next authority answer")),
    ]);
    const input = Readable.from([...wire].map((byte) => Buffer.from([byte])));
    const reader = new AttendedAnswerReader(input, "framed-v1");

    await expect(reader.read()).resolves.toBe("first line\r\nsecond line");
    await expect(reader.read()).resolves.toBe("next authority answer");
  });

  it("uses a visible terminal delimiter without consuming the next answer", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const written: Buffer[] = [];
    output.on("data", (chunk: Buffer) => written.push(chunk));
    const io = new TerminalOperatorIO({ input, output, mode: "terminal-delimiter" });
    input.end("line one\nline two\n.mdlm-submit\nsecond\n.mdlm-submit\n");

    await expect(io.attention({})).resolves.toEqual({
      conclusion: { statement: "line one\nline two" },
    });
    expect(Buffer.concat(written).toString("utf8")).toContain(
      "Finish with .mdlm-submit on its own line.",
    );
    await expect(io.attention({})).resolves.toEqual({
      conclusion: { statement: "second" },
    });
  });

  it.each([
    {
      name: "an empty legacy answer",
      input: Buffer.from("\n"),
      code: "ATTENDED_INPUT_EMPTY",
      mode: "legacy-eof" as const,
    },
    {
      name: "legacy EOF without its framing newline",
      input: Buffer.from("not terminated"),
      code: "ATTENDED_INPUT_INCOMPLETE",
      mode: "legacy-eof" as const,
    },
    {
      name: "a malformed length frame",
      input: Buffer.from("MDLM-ATTENDED/1 nope\nabc"),
      code: "ATTENDED_INPUT_INCOMPLETE",
      mode: "framed-v1" as const,
    },
    {
      name: "a length frame cut short by EOF",
      input: Buffer.from("MDLM-ATTENDED/1 5\nabc"),
      code: "ATTENDED_INPUT_INCOMPLETE",
      mode: "framed-v1" as const,
    },
    {
      name: "invalid UTF-8",
      input: frame(Buffer.from([0xc3, 0x28])),
      code: "ATTENDED_INPUT_INVALID_UTF8",
      mode: "framed-v1" as const,
    },
    {
      name: "a declared oversized answer",
      input: Buffer.from("MDLM-ATTENDED/1 9\n"),
      code: "ATTENDED_INPUT_TOO_LARGE",
      maximum: 8,
      mode: "framed-v1" as const,
    },
  ])("rejects $name without returning a partial conclusion", async ({ input, code, maximum, mode }) => {
    const reader = new AttendedAnswerReader(
      Readable.from([input]),
      mode,
      maximum,
    );

    await expect(reader.read()).rejects.toMatchObject({ code });
  });

  it("rejects an oversized terminal payload before copying at its delimiter", async () => {
    const reader = new AttendedAnswerReader(
      Readable.from([Buffer.from("aaaaaaaaa\n.mdlm-submit\n")]),
      "terminal-delimiter",
      8,
    );

    await expect(reader.read()).rejects.toMatchObject({
      code: "ATTENDED_INPUT_TOO_LARGE",
    });
  });

  it("rejects a non-ASCII byte in a framed header", async () => {
    const input = Buffer.concat([
      Buffer.from("MDLM-ATTENDED/1 ", "ascii"),
      Buffer.from([0xb1, 0x0a, 0x61]),
    ]);
    const reader = new AttendedAnswerReader(Readable.from([input]), "framed-v1");

    await expect(reader.read()).rejects.toMatchObject({
      code: "ATTENDED_INPUT_INCOMPLETE",
    });
  });

  it("rejects an unpaired surrogate from a string chunk", async () => {
    const reader = new AttendedAnswerReader(
      Readable.from(["answer\ud800\n"]),
      "legacy-eof",
    );

    await expect(reader.read()).rejects.toMatchObject({
      code: "ATTENDED_INPUT_INVALID_UTF8",
    });
  });

  it.each([
    { mode: "legacy-eof" as const, length: 10 },
    { mode: "framed-v1" as const, length: 145 },
    { mode: "terminal-delimiter" as const, length: 45 },
  ])("rejects an oversized $mode chunk before copying it", async ({ mode, length }) => {
    const reader = new AttendedAnswerReader(
      Readable.from([copyTrap(length)]),
      mode,
      8,
    );

    await expect(reader.read()).rejects.toMatchObject({
      code: "ATTENDED_INPUT_TOO_LARGE",
    });
  });

  it.each([
    { mode: "legacy-eof" as const, initial: 8, crossing: 2 },
    { mode: "framed-v1" as const, initial: 63, crossing: 82 },
    { mode: "terminal-delimiter" as const, initial: 43, crossing: 2 },
  ])("rejects oversized aggregate $mode input before copying the crossing chunk", async ({
    mode,
    initial,
    crossing,
  }) => {
    const reader = new AttendedAnswerReader(
      Readable.from([Buffer.alloc(initial, 0x61), copyTrap(crossing)]),
      mode,
      8,
    );

    await expect(reader.read()).rejects.toMatchObject({
      code: "ATTENDED_INPUT_TOO_LARGE",
    });
  });

  it("settles a pending attended read when SIGINT aborts its signal", async () => {
    const input = new PassThrough();
    const interruption = new AbortController();
    const reader = new AttendedAnswerReader(
      input,
      "legacy-eof",
      65_536,
      interruption.signal,
    );
    const reading = reader.read();

    interruption.abort(new Error("SIGINT"));

    await expect(Promise.race([
      reading,
      new Promise((resolve) => setTimeout(() => resolve("timed out"), 100)),
    ])).rejects.toMatchObject({ code: "ATTENDED_INPUT_CANCELLED" });
  });

  it("reports an input stream failure", async () => {
    const input = Readable.from((async function* () {
      yield Buffer.from("partial");
      throw new Error("input crashed");
    })());
    const reader = new AttendedAnswerReader(input, "legacy-eof");

    await expect(reader.read()).rejects.toMatchObject({
      code: "ATTENDED_INPUT_STREAM_FAILURE",
      message: "failed to read the attended answer: input crashed",
    });
  });

  it("rejects terminal EOF before the explicit delimiter", async () => {
    const reader = new AttendedAnswerReader(
      Readable.from([Buffer.from("unfinished\nanswer\n")]),
      "terminal-delimiter",
    );

    await expect(reader.read()).rejects.toMatchObject({
      code: "ATTENDED_INPUT_INCOMPLETE",
    });
  });
});

function copyTrap(length: number): Uint8Array {
  return new class extends Uint8Array {
    override get buffer(): ArrayBuffer {
      throw new Error("buffer copied before the input bound was checked");
    }
  }(length);
}

function frame(payload: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from(`MDLM-ATTENDED/1 ${payload.byteLength}\n`, "ascii"),
    payload,
  ]);
}

async function invokeTerminalOperatorIO(input: Buffer): Promise<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
}> {
  const script = [
    'import { TerminalOperatorIO } from "./dist/operator-io.js";',
    "const answer = await new TerminalOperatorIO().attention({});",
    "process.stdout.write(`\\nRESULT=${JSON.stringify(answer)}\\n`);",
  ].join("\n");
  const child = spawn(process.execPath, ["--input-type=module", "--eval", script], {
    cwd: packageRoot,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
  child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
  child.stdin.end(input);
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  return {
    exitCode,
    stdout: Buffer.concat(stdout).toString("utf8"),
    stderr: Buffer.concat(stderr).toString("utf8"),
  };
}
