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
const maximumProviderErrorInspectionLength = 4096;
const maximumEscapedSerializationQuoteWidth = 63;
// Each JSON serialization changes a delimiter's slash width from 0 to 1, 3, 7, and so on.
const escapedSerializationQuoteWidths = new Set([1, 3, 7, 15, 31, 63]);
const serializedCredentialNamePattern = /(?:x[-_ ]?api[-_ ]?key|api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token|client[-_ ]?secret|authorization|token|secret|password)/giu;
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

interface EscapedQuote {
  end: number;
  quote: "\"" | "'";
  width: number;
}

function escapedQuoteAt(value: string, start: number): EscapedQuote | null {
  if (start > 0 && value[start - 1] === "\\") return null;
  let cursor = start;
  while (value[cursor] === "\\" && cursor - start <= maximumEscapedSerializationQuoteWidth) cursor += 1;
  const width = cursor - start;
  const quote = value[cursor];
  return escapedSerializationQuoteWidths.has(width) && (quote === "\"" || quote === "'")
    ? { end: cursor + 1, quote, width }
    : null;
}

function escapedOpeningQuoteBefore(value: string, end: number): (EscapedQuote & { start: number }) | null {
  if (value[end - 1] !== "\"" && value[end - 1] !== "'") return null;
  let start = end - 1;
  while (start > 0 && value[start - 1] === "\\" && end - start <= maximumEscapedSerializationQuoteWidth) start -= 1;
  const quote = escapedQuoteAt(value, start);
  return quote === null || quote.end !== end ? null : { ...quote, start };
}

function redactEscapedSerializedCredentials(value: string): string {
  const ranges: Array<{ start: number; end: number }> = [];
  let skipBefore = 0;
  for (const match of value.matchAll(serializedCredentialNamePattern)) {
    const nameStart = match.index;
    if (nameStart < skipBefore) continue;
    const nameEnd = nameStart + match[0].length;
    const openingNameQuote = escapedOpeningQuoteBefore(value, nameStart);
    const closingNameQuote = escapedQuoteAt(value, nameEnd);
    if (openingNameQuote === null || closingNameQuote === null ||
      openingNameQuote.width !== closingNameQuote.width ||
      openingNameQuote.quote !== closingNameQuote.quote) continue;

    let cursor = closingNameQuote.end;
    while (/\s/u.test(value[cursor] ?? "")) cursor += 1;
    if (value[cursor] !== ":" && value[cursor] !== "=") continue;
    cursor += 1;
    while (/\s/u.test(value[cursor] ?? "")) cursor += 1;

    const openingValueQuote = escapedQuoteAt(value, cursor);
    if (openingValueQuote === null || openingValueQuote.width !== openingNameQuote.width) continue;
    cursor = openingValueQuote.end;
    let closingValueQuote: EscapedQuote | null = null;
    while (cursor < value.length) {
      if (value[cursor] !== "\\") {
        cursor += 1;
        continue;
      }
      const candidate = escapedQuoteAt(value, cursor);
      if (candidate !== null && candidate.width === openingValueQuote.width &&
        candidate.quote === openingValueQuote.quote) {
        closingValueQuote = candidate;
        break;
      }
      cursor += 1;
    }
    if (closingValueQuote === null) {
      ranges.push({ start: openingNameQuote.start, end: value.length });
      break;
    }
    ranges.push({ start: openingNameQuote.start, end: closingValueQuote.end });
    skipBefore = closingValueQuote.end;
  }

  if (ranges.length === 0) return value;
  let redacted = "";
  let cursor = 0;
  for (const range of ranges) {
    if (range.start < cursor) continue;
    redacted += `${value.slice(cursor, range.start)}[REDACTED]`;
    cursor = range.end;
  }
  return redacted + value.slice(cursor);
}

export function redactProviderError(value: string): RedactedProviderError {
  const sourceExceededBound = value.length > maximumProviderErrorLength;
  let message = redactEscapedSerializedCredentials(value.slice(0, maximumProviderErrorInspectionLength))
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
