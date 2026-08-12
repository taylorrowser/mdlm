import { createHash } from "node:crypto";

const ansiPattern = /\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

export function normalizeFailureEvidence({ commandIdentity, output }) {
  const normalizedOutput = String(output ?? "")
    .replace(ansiPattern, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\b/g, "<timestamp>")
    .replace(/\[(?:\d{4}-\d{2}-\d{2}T)?\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?\]/g, "<timestamp>")
    .replace(/^\s*(?:Duration|Start at|(?:ℹ\s+)?duration_ms)\b[^\n]*$/gim, "")
    .replace(/(?:\/private)?\/(?:tmp|var\/folders)\/[^\s:]+(?=\/(?:src|test|scripts)\/)/g, "<temp-root>")
    .replace(/\b(mdlm-[A-Za-z0-9_-]*?)[A-Za-z0-9]{6,}\b/g, "$1<run>")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== "")
    .join("\n");
  return `COMMAND: ${String(commandIdentity).trim()}\n${normalizedOutput}`;
}

export function failureFingerprint(evidence) {
  return createHash("sha256").update(normalizeFailureEvidence(evidence)).digest("hex");
}

export function recordFailureFingerprint(state, fingerprint) {
  const repeated = state.currentFailureFingerprint === fingerprint;
  return {
    previousFailureFingerprint: state.currentFailureFingerprint ?? null,
    currentFailureFingerprint: fingerprint,
    failureRepeatCount: repeated ? (state.failureRepeatCount ?? 0) + 1 : 0,
    failureRepeated: repeated,
  };
}
