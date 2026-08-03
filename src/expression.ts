import type { ProcessDiagnostic, VersionedDefinition } from "./index.js";

type ValueType = "boolean" | "entity" | "null" | "number" | "object" | "string" | "unknown";
type ComparisonOperator = "eq" | "ne" | "gt" | "gte" | "lt" | "lte";

interface SourcePosition {
  offset: number;
  line: number;
  column: number;
}

interface SourceSpan {
  start: SourcePosition;
  end: SourcePosition;
}

interface CompiledValue {
  kind: "literal" | "path" | "variable";
  value?: unknown;
  variable?: string;
  segments?: string[];
  valueType: ValueType;
  span: SourceSpan;
}

export interface CompiledTextExpression {
  kind: "mdlm-comparison";
  source: string;
  operator: ComparisonOperator;
  left: CompiledValue;
  right: CompiledValue;
  span: SourceSpan;
}

interface Binding {
  valueType: ValueType;
  paths?: Record<string, ValueType>;
}

type Bindings = Record<string, Binding>;

type TokenKind =
  | "boolean"
  | "dot"
  | "eof"
  | "identifier"
  | "null"
  | "number"
  | "operator"
  | "string";

interface Token {
  kind: TokenKind;
  text: string;
  value?: unknown;
  span: SourceSpan;
}

class ExpressionFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly span: SourceSpan,
  ) {
    super(message);
  }
}

function position(source: string, offset: number): SourcePosition {
  const before = source.slice(0, offset);
  const lines = before.split("\n");
  return {
    offset,
    line: lines.length,
    column: (lines.at(-1)?.length ?? 0) + 1,
  };
}

function span(source: string, start: number, end: number): SourceSpan {
  return { start: position(source, start), end: position(source, end) };
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let offset = 0;

  while (offset < source.length) {
    const character = source[offset];
    if (/\s/.test(character ?? "")) {
      offset += 1;
      continue;
    }

    const start = offset;
    const operator = source.slice(offset).match(/^(==|!=|>=|<=|>|<)/)?.[0];
    if (operator) {
      offset += operator.length;
      tokens.push({ kind: "operator", text: operator, span: span(source, start, offset) });
      continue;
    }

    if (character === ".") {
      offset += 1;
      tokens.push({ kind: "dot", text: character, span: span(source, start, offset) });
      continue;
    }

    if (character === '"') {
      offset += 1;
      let escaped = false;
      while (offset < source.length) {
        const current = source[offset];
        offset += 1;
        if (current === '"' && !escaped) break;
        escaped = current === "\\" && !escaped;
        if (current !== "\\") escaped = false;
      }
      const text = source.slice(start, offset);
      if (!text.endsWith('"')) {
        throw new ExpressionFailure(
          "expression-syntax",
          "Unterminated string literal",
          span(source, start, offset),
        );
      }
      try {
        tokens.push({
          kind: "string",
          text,
          value: JSON.parse(text),
          span: span(source, start, offset),
        });
      } catch {
        throw new ExpressionFailure(
          "expression-syntax",
          "Invalid string literal",
          span(source, start, offset),
        );
      }
      continue;
    }

    const numberMatch = source.slice(offset).match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?/);
    if (numberMatch?.[0]) {
      offset += numberMatch[0].length;
      tokens.push({
        kind: "number",
        text: numberMatch[0],
        value: Number(numberMatch[0]),
        span: span(source, start, offset),
      });
      continue;
    }

    const identifier = source.slice(offset).match(/^[A-Za-z_][A-Za-z0-9_-]*/)?.[0];
    if (identifier) {
      offset += identifier.length;
      const tokenSpan = span(source, start, offset);
      if (identifier === "true" || identifier === "false") {
        tokens.push({ kind: "boolean", text: identifier, value: identifier === "true", span: tokenSpan });
      } else if (identifier === "null") {
        tokens.push({ kind: "null", text: identifier, value: null, span: tokenSpan });
      } else {
        tokens.push({ kind: "identifier", text: identifier, span: tokenSpan });
      }
      continue;
    }

    throw new ExpressionFailure(
      "expression-syntax",
      `Unexpected character '${character}'`,
      span(source, start, start + 1),
    );
  }

  tokens.push({ kind: "eof", text: "", span: span(source, offset, offset) });
  return tokens;
}

class ComparisonParser {
  private index = 0;

  constructor(
    private readonly source: string,
    private readonly tokens: Token[],
    private readonly bindings: Bindings,
  ) {}

  parse(): CompiledTextExpression {
    const left = this.parseValue();
    const operatorToken = this.take("operator", "Expected a comparison operator");
    const right = this.parseValue();
    this.take("eof", "Expected the expression to end after the comparison");
    const operator = this.operator(operatorToken);
    this.checkOperands(operator, left, right, operatorToken.span);
    return {
      kind: "mdlm-comparison",
      source: this.source,
      operator,
      left,
      right,
      span: { start: left.span.start, end: right.span.end },
    };
  }

  private parseValue(): CompiledValue {
    const token = this.current();
    if (["boolean", "null", "number", "string"].includes(token.kind)) {
      this.index += 1;
      const valueType: ValueType = token.kind === "boolean"
        ? "boolean"
        : token.kind === "number"
          ? "number"
          : token.kind === "string"
            ? "string"
            : "null";
      return { kind: "literal", value: token.value, valueType, span: token.span };
    }

    const variableToken = this.take("identifier", "Expected a literal or bound variable");
    const binding = this.bindings[variableToken.text];
    if (!binding) {
      throw new ExpressionFailure(
        "expression-unknown-binding",
        `Unknown expression binding '${variableToken.text}'`,
        variableToken.span,
      );
    }

    const segments: string[] = [];
    let end = variableToken.span.end;
    while (this.current().kind === "dot") {
      this.index += 1;
      const segment = this.take("identifier", "Expected a path segment after '.'");
      segments.push(segment.text);
      end = segment.span.end;
    }

    if (segments.length === 0) {
      return {
        kind: "variable",
        variable: variableToken.text,
        valueType: binding.valueType,
        span: { start: variableToken.span.start, end },
      };
    }

    const path = segments.join(".");
    const valueType = binding.paths?.[path] ?? (path.startsWith("payload.") ? "unknown" : undefined);
    if (!valueType) {
      throw new ExpressionFailure(
        "expression-unknown-path",
        `Unknown path '${variableToken.text}.${path}'`,
        { start: variableToken.span.start, end },
      );
    }
    return {
      kind: "path",
      variable: variableToken.text,
      segments,
      valueType,
      span: { start: variableToken.span.start, end },
    };
  }

  private operator(token: Token): ComparisonOperator {
    const operators: Record<string, ComparisonOperator> = {
      "==": "eq",
      "!=": "ne",
      ">": "gt",
      ">=": "gte",
      "<": "lt",
      "<=": "lte",
    };
    const operator = operators[token.text];
    if (!operator) {
      throw new ExpressionFailure(
        "expression-syntax",
        `Unsupported comparison operator '${token.text}'`,
        token.span,
      );
    }
    return operator;
  }

  private checkOperands(
    operator: ComparisonOperator,
    left: CompiledValue,
    right: CompiledValue,
    operatorSpan: SourceSpan,
  ): void {
    if (["gt", "gte", "lt", "lte"].includes(operator)) {
      if (left.valueType !== "number" || right.valueType !== "number") {
        throw new ExpressionFailure(
          "expression-type",
          `Operator '${this.source.slice(operatorSpan.start.offset, operatorSpan.end.offset)}' requires number operands, received ${left.valueType} and ${right.valueType}`,
          operatorSpan,
        );
      }
      return;
    }
    if (
      left.valueType !== "unknown" &&
      right.valueType !== "unknown" &&
      left.valueType !== "null" &&
      right.valueType !== "null" &&
      left.valueType !== right.valueType
    ) {
      throw new ExpressionFailure(
        "expression-type",
        `Cannot compare ${left.valueType} with ${right.valueType}`,
        operatorSpan,
      );
    }
  }

  private current(): Token {
    return this.tokens[this.index] ?? this.tokens[this.tokens.length - 1]!;
  }

  private take(kind: TokenKind, message: string): Token {
    const token = this.current();
    if (token.kind !== kind) {
      throw new ExpressionFailure("expression-syntax", message, token.span);
    }
    this.index += 1;
    return token;
  }
}

const entityPaths: Record<string, ValueType> = {
  "identity.id": "string",
  "identity.revision_id": "string",
  "identity.type": "string",
  "identity.revision": "number",
  "storage.editable": "boolean",
  "storage.frozen": "boolean",
  "integrity.parseable": "boolean",
  "integrity.schema_valid": "boolean",
  "integrity.identity_valid": "boolean",
  "integrity.references_valid": "boolean",
  "integrity.hash_valid": "boolean",
  "provenance.process_ref": "string",
};

const baseBindings: Bindings = {
  process: {
    valueType: "object",
    paths: {
      current_ref: "string",
      "integrity.package_valid": "boolean",
    },
  },
  phase: { valueType: "object", paths: { id: "string" } },
};

function diagnostic(
  failure: ExpressionFailure,
  definitionPath: string,
  source: string,
): ProcessDiagnostic {
  return {
    code: failure.code,
    path: definitionPath,
    line: failure.span.start.line,
    column: failure.span.start.column,
    source,
    message: failure.message,
  };
}

function compile(
  source: string,
  bindings: Bindings,
  definitionPath: string,
): { expression?: CompiledTextExpression; diagnostics: ProcessDiagnostic[] } {
  try {
    return {
      expression: new ComparisonParser(source, tokenize(source), bindings).parse(),
      diagnostics: [],
    };
  } catch (error) {
    if (error instanceof ExpressionFailure) {
      return { diagnostics: [diagnostic(error, definitionPath, source)] };
    }
    throw error;
  }
}

export function compileStateExpressions(
  definition: VersionedDefinition,
  filePath: string,
): ProcessDiagnostic[] {
  const subjectAs = typeof definition.subject_as === "string"
    ? definition.subject_as
    : "subject";
  const bindings: Bindings = {
    ...baseBindings,
    [subjectAs]: { valueType: "entity", paths: entityPaths },
  };
  const diagnostics: ProcessDiagnostic[] = [];
  const rules = Array.isArray(definition.rules) ? definition.rules : [];

  rules.forEach((value, index) => {
    if (typeof value !== "object" || value === null) return;
    const rule = value as Record<string, unknown>;
    if (typeof rule.when !== "string") return;
    const definitionPath = `${filePath}#rules[${index}].when`;
    const result = compile(rule.when, bindings, definitionPath);
    diagnostics.push(...result.diagnostics);
    if (result.expression) rule.when = result.expression;
  });

  return diagnostics;
}

export function isCompiledTextExpression(
  value: unknown,
): value is CompiledTextExpression {
  return typeof value === "object" && value !== null &&
    (value as { kind?: unknown }).kind === "mdlm-comparison";
}

function readPath(root: unknown, segments: string[]): unknown {
  let value = root;
  for (const segment of segments) {
    if (typeof value !== "object" || value === null) return undefined;
    value = (value as Record<string, unknown>)[segment];
  }
  return value;
}

function compiledValue(value: CompiledValue, context: Record<string, unknown>): unknown {
  if (value.kind === "literal") return value.value;
  const root = context[value.variable ?? ""];
  return value.kind === "variable" ? root : readPath(root, value.segments ?? []);
}

export function expressionValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (
    (Array.isArray(left) && Array.isArray(right)) ||
    (typeof left === "object" && left !== null && typeof right === "object" && right !== null)
  ) {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  return false;
}

export function evaluateCompiledTextExpression(
  expression: CompiledTextExpression,
  context: Record<string, unknown>,
): boolean {
  const left = compiledValue(expression.left, context);
  const right = compiledValue(expression.right, context);
  switch (expression.operator) {
    case "eq": return expressionValuesEqual(left, right);
    case "ne": return !expressionValuesEqual(left, right);
    case "gt": return typeof left === "number" && typeof right === "number" && left > right;
    case "gte": return typeof left === "number" && typeof right === "number" && left >= right;
    case "lt": return typeof left === "number" && typeof right === "number" && left < right;
    case "lte": return typeof left === "number" && typeof right === "number" && left <= right;
  }
}
