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

  it("removes a legacy CRLF frame ending without changing embedded CRLF", async () => {
    const reader = new AttendedAnswerReader(
      Readable.from([Buffer.from("line one\r\nline two\r\n")]),
      false,
    );

    await expect(reader.read()).resolves.toBe("line one\r\nline two");
  });

  it("leaves an adjacent length-framed answer for the next attended read", async () => {
    const wire = Buffer.concat([
      frame(Buffer.from("first line\r\nsecond line")),
      frame(Buffer.from("next authority answer")),
    ]);
    const input = Readable.from([...wire].map((byte) => Buffer.from([byte])));
    const reader = new AttendedAnswerReader(input, false);

    await expect(reader.read()).resolves.toBe("first line\r\nsecond line");
    await expect(reader.read()).resolves.toBe("next authority answer");
  });

  it("uses a visible terminal delimiter without consuming the next answer", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const written: Buffer[] = [];
    output.on("data", (chunk: Buffer) => written.push(chunk));
    const io = new TerminalOperatorIO({ input, output, terminal: true });
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
    },
    {
      name: "legacy EOF without its framing newline",
      input: Buffer.from("not terminated"),
      code: "ATTENDED_INPUT_INCOMPLETE",
    },
    {
      name: "a malformed length frame",
      input: Buffer.from("MDLM-ATTENDED/1 nope\nabc"),
      code: "ATTENDED_INPUT_INCOMPLETE",
    },
    {
      name: "a length frame cut short by EOF",
      input: Buffer.from("MDLM-ATTENDED/1 5\nabc"),
      code: "ATTENDED_INPUT_INCOMPLETE",
    },
    {
      name: "invalid UTF-8",
      input: frame(Buffer.from([0xc3, 0x28])),
      code: "ATTENDED_INPUT_INVALID_UTF8",
    },
    {
      name: "a declared oversized answer",
      input: Buffer.from("MDLM-ATTENDED/1 9\n"),
      code: "ATTENDED_INPUT_TOO_LARGE",
      maximum: 8,
    },
  ])("rejects $name without returning a partial conclusion", async ({ input, code, maximum }) => {
    const reader = new AttendedAnswerReader(
      Readable.from([input]),
      false,
      maximum,
    );

    await expect(reader.read()).rejects.toMatchObject({ code });
  });

  it("reports an input stream failure", async () => {
    const input = Readable.from((async function* () {
      yield Buffer.from("partial");
      throw new Error("input crashed");
    })());
    const reader = new AttendedAnswerReader(input, false);

    await expect(reader.read()).rejects.toMatchObject({
      code: "ATTENDED_INPUT_STREAM_FAILURE",
      message: "failed to read the attended answer: input crashed",
    });
  });

  it("rejects terminal EOF before the explicit delimiter", async () => {
    const reader = new AttendedAnswerReader(
      Readable.from([Buffer.from("unfinished\nanswer\n")]),
      true,
    );

    await expect(reader.read()).rejects.toMatchObject({
      code: "ATTENDED_INPUT_INCOMPLETE",
    });
  });
});

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
