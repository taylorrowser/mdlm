export const operationalFailureContract = "mdlm-pi-operational-failure@1";

export type PiStopReason =
  | "stop"
  | "length"
  | "toolUse"
  | "error"
  | "aborted"
  | "deferred";

export interface RedactedProviderError {
  message: string;
  truncated: boolean;
}

export interface PiTerminalTelemetry {
  stopReason: PiStopReason | null;
  providerError: RedactedProviderError | null;
  retriesConsumed: number | null;
  provider: string | null;
  model: string | null;
  completeAssignmentObserved: boolean | null;
}

export interface PiOperationalFailureDocument {
  contract: typeof operationalFailureContract;
  status: "operational-failure";
  error: {
    code: string;
    message: string;
  };
  telemetry: PiTerminalTelemetry;
}

const maximumProviderErrorLength = 512;
const secretPatterns = [
  /["']?(?:x[-_ ]?api[-_ ]?key|api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token|client[-_ ]?secret|authorization|token|secret|password)["']?\s*[:=]\s*"(?:\\.|[^"\\\r\n])*"/giu,
  /["']?(?:x[-_ ]?api[-_ ]?key|api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token|client[-_ ]?secret|authorization|token|secret|password)["']?\s*[:=]\s*'(?:\\.|[^'\\\r\n])*'/giu,
  /\bBearer\s+[^\s,;]+/giu,
  /(?:x[-_ ]?api[-_ ]?key|api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token|client[-_ ]?secret|authorization|token|secret|password)\s*[:=]\s*[^\s,"';}]+/giu,
  /\b(?:sk|rk|pk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{8,}/gu,
  /\b(?:AKIA|ASIA|AIDA|AROA|AIPA|ANPA|ANVA|A3T)[A-Z0-9]{16}\b/gu,
  /\b(?:glpat-|npm_|AIza)[A-Za-z0-9_-]{16,}/gu,
  /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{8,}\b/gu,
  /\b[A-Za-z0-9+/]{32,}={0,2}\b/gu,
];

export function operationalFailureDocument(
  error: { code: string; message: string; telemetry?: PiTerminalTelemetry | undefined },
): PiOperationalFailureDocument {
  return {
    contract: operationalFailureContract,
    status: "operational-failure",
    error: { code: error.code, message: redactOperationalErrorMessage(error.message) },
    telemetry: error.telemetry ?? unavailableTerminalTelemetry(),
  };
}

export function redactOperationalErrorMessage(value: string): string {
  return redactProviderError(value).message.slice(0, 256);
}

export function unavailableTerminalTelemetry(
  completeAssignmentObserved: boolean | null = null,
): PiTerminalTelemetry {
  return {
    stopReason: null,
    providerError: null,
    retriesConsumed: null,
    provider: null,
    model: null,
    completeAssignmentObserved,
  };
}

export function redactProviderError(value: string): RedactedProviderError {
  const sourceExceededBound = value.length > maximumProviderErrorLength;
  let message = value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, " ")
    .replace(/\b[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s]+/gu, "[REDACTED_URL]");
  for (const pattern of secretPatterns) message = message.replace(pattern, "[REDACTED]");
  const truncated = sourceExceededBound || message.length > maximumProviderErrorLength;
  if (message.length > maximumProviderErrorLength) {
    message = message.slice(0, maximumProviderErrorLength);
  }
  return { message, truncated };
}

export function observedPiIdentity(value: unknown): string | null {
  return typeof value === "string" && value.length >= 1 && value.length <= 128 &&
    /^[A-Za-z0-9._:/-]+$/u.test(value)
    ? value
    : null;
}

export function isPiStopReason(value: unknown): value is PiStopReason {
  return value === "stop"
    || value === "length"
    || value === "toolUse"
    || value === "error"
    || value === "aborted"
    || value === "deferred";
}
