import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  operationalFailureDocument,
  redactProviderError,
} from "../src/operational-failure.js";

describe("MDLM-Pi operational failure contract", () => {
  it("serializes unavailable terminal evidence explicitly", () => {
    expect(operationalFailureDocument({
      code: "PI_SETTLED_WITHOUT_COMPLETION",
      message: "Pi settled without calling complete_assignment",
    })).toEqual({
      contract: "mdlm-pi-operational-failure@1",
      status: "operational-failure",
      error: {
        code: "PI_SETTLED_WITHOUT_COMPLETION",
        message: "Pi settled without calling complete_assignment",
      },
      telemetry: {
        stopReason: null,
        providerError: null,
        retriesConsumed: null,
        provider: null,
        model: null,
        completeAssignmentObserved: null,
      },
    });
  });

  it.each([
    "Bearer secret-token-value",
    "authorization=secret-token-value",
    "api_key: secret-token-value",
    "password=hunter2-value",
    "OPENAI_API_KEY=not-prefixed-secret",
    "CLIENT_SECRET=short-secret-value",
    "https://user:password@example.invalid/path",
    "https://provider.example.invalid/errors/request-123?trace=sensitive",
    `sk-${"a".repeat(40)}`,
    `github_pat_${"b".repeat(40)}`,
    "AKIAIOSFODNN7EXAMPLE",
    `glpat-${"g".repeat(32)}`,
    `npm_${"n".repeat(32)}`,
    "AIzaSyD-exampleCredentialValue123456789",
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature-value",
    Buffer.from("an opaque provider credential").toString("base64"),
  ])("redacts credential form %#", (secret) => {
    const result = redactProviderError(`provider rejected ${secret}`);
    expect(result.message).not.toContain(secret);
    expect(result.message).toMatch(/\[REDACTED(?:_URL)?\]/u);
    expect(result.message.length).toBeLessThanOrEqual(512);
  });

  it("redacts and bounds the top-level operational error message", () => {
    const document = operationalFailureDocument({
      code: "MDLM_PI_OPERATION_FAILED",
      message: `OPENAI_API_KEY=not-prefixed-secret https://provider.example.invalid/private ${"x".repeat(300)}`,
    });
    expect(document.error.message).not.toContain("not-prefixed-secret");
    expect(document.error.message).toContain("[REDACTED]");
    expect(document.error.message).not.toContain("provider.example.invalid");
    expect(document.error.message.length).toBeLessThanOrEqual(256);
  });

  it("emits the versioned contract and exit 1 for process-level usage failures", () => {
    const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
    const execution = spawnSync(process.execPath, [cli], { encoding: "utf8" });
    expect(execution.status).toBe(1);
    expect(execution.stdout).toBe("");
    expect(JSON.parse(execution.stderr)).toEqual(operationalFailureDocument({
      code: "CLI_USAGE_INVALID",
      message: "Usage: mdlm-pi run <repository> [--mdlm <executable>] [--provider <provider>] [--model <model>] [--thinking <level>]",
    }));
    expect(execution.stderr).toBe(`${JSON.stringify(JSON.parse(execution.stderr), null, 2)}\n`);
  });

  it("bounds content and reports source truncation even when redaction shortens it", () => {
    const secret = `sk-${"s".repeat(700)}`;
    const result = redactProviderError(`token=${secret}`);
    expect(result).toEqual({ message: "[REDACTED]", truncated: true });
  });
});
