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

  it.each([
    ['nested JSON apiKey', '{"provider":{"credentials":{"apiKey":"nested-api-secret"}}}', 'nested-api-secret'],
    ['nested JSON accessToken', '{"auth":{"accessToken":"nested-access-secret"}}', 'nested-access-secret'],
    ['nested JSON clientSecret', '{"oauth":{"clientSecret":"nested-client-secret"}}', 'nested-client-secret'],
    ['nested JSON password', '{"connection":{"password":"nested-password-secret"}}', 'nested-password-secret'],
    ['nested JSON authorization', '{"headers":{"authorization":"Basic c2hvcnQtc2VjcmV0"}}', 'c2hvcnQtc2VjcmV0'],
    ['nested JSON x-api-key', '{"headers":{"x-api-key":"nested-header-secret"}}', 'nested-header-secret'],
    ['snake case', '{"access_token":"snake-access-secret"}', 'snake-access-secret'],
    ['kebab case', '{"client-secret":"kebab-client-secret"}', 'kebab-client-secret'],
    ['environment prefix', '{"OPENAI_API_KEY":"environment-secret"}', 'environment-secret'],
    ['single quoted camel case', "{'refreshToken':'refresh-secret'}", 'refresh-secret'],
  ])("redacts quoted credential values in %s", (_name, source, secret) => {
    const result = redactProviderError(`provider rejected ${source}`);
    expect(result.message).not.toContain(secret);
    expect(result.message).toContain("[REDACTED]");
    expect(result.message.length).toBeLessThanOrEqual(512);
  });

  it.each([
    [
      "one escaped serialization layer",
      String.raw`provider rejected {\"credentials\":{\"apiKey\":\"nested-api-secret\",\"accessToken\":\"nested-access-secret\",\"clientSecret\":\"nested-client-secret\",\"password\":\"nested-password-secret\"},\"headers\":{\"x-api-key\":\"nested-header-secret\",\"authorization\":\"Bearer nested-authorization-secret\"},\"enabled\":true,\"retry\":false,\"fallback\":null}`,
      [
        "nested-api-secret",
        "nested-access-secret",
        "nested-client-secret",
        "nested-password-secret",
        "nested-header-secret",
        "nested-authorization-secret",
      ],
    ],
    [
      "multiple escaped serialization layers",
      String.raw`provider rejected {\\\"credentials\\\":{\\\"apiKey\\\":\\\"deep-api-secret\\\",\\\"clientSecret\\\":\\\"deep-client-secret\\\"},\\\"headers\\\":{\\\"accessToken\\\":\\\"deep-access-secret\\\",\\\"x-api-key\\\":\\\"deep-header-secret\\\",\\\"password\\\":\\\"deep-password-secret\\\",\\\"authorization\\\":\\\"Basic deep-authorization-secret\\\"},\\\"enabled\\\":true,\\\"retry\\\":false,\\\"fallback\\\":null}`,
      [
        "deep-api-secret",
        "deep-client-secret",
        "deep-access-secret",
        "deep-header-secret",
        "deep-password-secret",
        "deep-authorization-secret",
      ],
    ],
  ])("redacts nested credentials through %s", (_name, source, secrets) => {
    const result = redactProviderError(source);
    for (const secret of secrets) expect(result.message).not.toContain(secret);
    expect(result.message).not.toMatch(/apiKey|accessToken|x-api-key|clientSecret|password|authorization/iu);
    expect(result.message).toContain("true");
    expect(result.message).toContain("false");
    expect(result.message).toContain("null");
    expect(result.message.length).toBeLessThanOrEqual(512);

    const telemetry = operationalFailureDocument({
      code: "PI_PROVIDER_FAILED",
      message: source,
    });
    expect(JSON.parse(JSON.stringify(telemetry))).toEqual(telemetry);
    expect(telemetry.error.message.length).toBeLessThanOrEqual(256);
  });

  it("consumes an escaped quoted secret assigned to an unquoted shell key", () => {
    const source = String.raw`provider rejected apiKey=\"opaque-value\" unrelated=true`;

    expect(redactProviderError(source)).toEqual({
      message: "provider rejected [REDACTED] unrelated=true",
      truncated: false,
    });
  });

  const shellCredentialCases = [1, 3, 7, 15, 31, 63].flatMap((quoteWidth) =>
    ["apiKey", "accessToken", "x-api-key", "clientSecret", "password", "authorization"].flatMap((credentialName) =>
      [
        { context: "direct", format: (assignment: string) => `provider command ${assignment}` },
        { context: "nested", format: (assignment: string) => `provider credentials.${assignment}` },
        { context: "header", format: (assignment: string) => `provider --header ${assignment}` },
      ].map(({ context, format }) => {
        const escapedQuote = `${"\\".repeat(quoteWidth)}\"`;
        const secret = `opaque-${credentialName}-${quoteWidth}-value`;
        const source = `${format(`${credentialName}=${escapedQuote}${secret}${escapedQuote}`)} unrelated=true retry=false fallback=null`;
        const expected = `${format("[REDACTED]")} unrelated=true retry=false fallback=null`;
        return { context, credentialName, expected, quoteWidth, secret, source };
      }),
    ),
  );

  it.each(shellCredentialCases)(
    "redacts $context shell credential $credentialName at escaped quote width $quoteWidth",
    ({ credentialName, expected, secret, source }) => {
      const result = redactProviderError(source);
      expect(result).toEqual({ message: expected, truncated: false });
      expect(result.message).not.toContain(credentialName);
      expect(result.message).not.toContain(secret);
      expect(result.message).toContain("unrelated=true");
      expect(result.message).toContain("retry=false");
      expect(result.message).toContain("fallback=null");
      expect(result.message.length).toBeLessThanOrEqual(512);

      const document = operationalFailureDocument({ code: "PI_PROVIDER_FAILED", message: source });
      expect(document.error.message).toBe(expected);
      expect(document.error.message.length).toBeLessThanOrEqual(256);
    },
  );

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
