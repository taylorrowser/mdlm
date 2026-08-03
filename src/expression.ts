import type { ProcessDiagnostic, VersionedDefinition } from "./index.js";

type ValueType = "array" | "boolean" | "entity" | "null" | "number" | "object" | "string" | "unknown";
type ComparisonOperator = "eq" | "ne" | "gt" | "gte" | "in" | "lt" | "lte";
type LogicalOperator = "and" | "or";

interface SourcePosition {
  offset: number;
  line: number;
  column: number;
}

interface SourceSpan {
  start: SourcePosition;
  end: SourcePosition;
}

interface NodeBase {
  valueType: ValueType;
  span: SourceSpan;
}

interface LiteralNode extends NodeBase {
  kind: "literal";
  value: unknown;
}

interface VariableNode extends NodeBase {
  kind: "variable";
  variable: string;
}

interface PathNode extends NodeBase {
  kind: "path";
  variable: string;
  segments: string[];
}

interface ComparisonNode extends NodeBase {
  kind: "comparison";
  operator: ComparisonOperator;
  left: ExpressionNode;
  right: ExpressionNode;
}

interface LogicalNode extends NodeBase {
  kind: "logical";
  operator: LogicalOperator;
  left: ExpressionNode;
  right: ExpressionNode;
}

interface NegationNode extends NodeBase {
  kind: "not";
  operand: ExpressionNode;
}

interface PresenceNode extends NodeBase {
  kind: "present";
  operand: ExpressionNode;
}

interface ArrayNode extends NodeBase {
  kind: "array";
  elements: ExpressionNode[];
}

interface ObjectNode extends NodeBase {
  kind: "object";
  properties: Record<string, ExpressionNode>;
}

type ExpressionNode =
  | ArrayNode
  | ComparisonNode
  | LiteralNode
  | LogicalNode
  | NegationNode
  | ObjectNode
  | PathNode
  | PresenceNode
  | VariableNode;

export interface CompiledTextExpression {
  kind: "mdlm-expression";
  source: string;
  root: ExpressionNode;
  span: SourceSpan;
}

interface Binding {
  valueType: ValueType;
  paths?: Record<string, ValueType>;
}

type Bindings = Record<string, Binding>;

type TokenKind =
  | "boolean"
  | "colon"
  | "comma"
  | "dot"
  | "eof"
  | "identifier"
  | "left-brace"
  | "left-bracket"
  | "left-parenthesis"
  | "null"
  | "number"
  | "operator"
  | "right-brace"
  | "right-bracket"
  | "right-parenthesis"
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
    const operator = source.slice(offset).match(/^(==|!=|>=|<=|&&|\|\||>|<|!)/)?.[0];
    if (operator) {
      offset += operator.length;
      tokens.push({ kind: "operator", text: operator, span: span(source, start, offset) });
      continue;
    }

    const punctuation: Record<string, TokenKind> = {
      ":": "colon",
      ",": "comma",
      ".": "dot",
      "{": "left-brace",
      "[": "left-bracket",
      "(": "left-parenthesis",
      "}": "right-brace",
      "]": "right-bracket",
      ")": "right-parenthesis",
    };
    const punctuationKind = character === undefined ? undefined : punctuation[character];
    if (punctuationKind) {
      offset += 1;
      tokens.push({ kind: punctuationKind, text: character ?? "", span: span(source, start, offset) });
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
      } else if (identifier === "in") {
        tokens.push({ kind: "operator", text: identifier, span: tokenSpan });
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

class ExpressionParser {
  private index = 0;

  constructor(
    private readonly source: string,
    private readonly tokens: Token[],
    private readonly bindings: Bindings,
  ) {}

  parse(): CompiledTextExpression {
    const root = this.parseOr();
    this.take("eof", "Expected the expression to end");
    if (root.valueType !== "boolean") {
      throw new ExpressionFailure(
        "expression-result-type",
        `Rule condition must return boolean, received ${root.valueType}`,
        root.span,
      );
    }
    return {
      kind: "mdlm-expression",
      source: this.source,
      root,
      span: span(this.source, 0, this.source.length),
    };
  }

  private parseOr(): ExpressionNode {
    let left = this.parseAnd();
    while (this.current().kind === "operator" && this.current().text === "||") {
      const operator = this.take("operator", "Expected '||'");
      const right = this.parseAnd();
      this.requireBoolean(left, operator);
      this.requireBoolean(right, operator);
      left = {
        kind: "logical",
        operator: "or",
        left,
        right,
        valueType: "boolean",
        span: { start: left.span.start, end: right.span.end },
      };
    }
    return left;
  }

  private parseAnd(): ExpressionNode {
    let left = this.parseComparison();
    while (this.current().kind === "operator" && this.current().text === "&&") {
      const operator = this.take("operator", "Expected '&&'");
      const right = this.parseComparison();
      this.requireBoolean(left, operator);
      this.requireBoolean(right, operator);
      left = {
        kind: "logical",
        operator: "and",
        left,
        right,
        valueType: "boolean",
        span: { start: left.span.start, end: right.span.end },
      };
    }
    return left;
  }

  private parseComparison(): ExpressionNode {
    const left = this.parseUnary();
    const operatorToken = this.current();
    const operator = operatorToken.kind === "operator"
      ? this.comparisonOperator(operatorToken.text)
      : undefined;
    if (!operator) return left;
    this.index += 1;
    const right = this.parseUnary();
    this.checkComparisonOperands(operator, left, right, operatorToken.span);
    return {
      kind: "comparison",
      operator,
      left,
      right,
      valueType: "boolean",
      span: { start: left.span.start, end: right.span.end },
    };
  }

  private parseUnary(): ExpressionNode {
    const token = this.current();
    if (token.kind === "operator" && token.text === "!") {
      this.index += 1;
      const operand = this.parseUnary();
      this.requireBoolean(operand, token);
      return {
        kind: "not",
        operand,
        valueType: "boolean",
        span: { start: token.span.start, end: operand.span.end },
      };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): ExpressionNode {
    const token = this.current();
    if (token.kind === "left-bracket") return this.parseArray();
    if (token.kind === "left-brace") return this.parseObject();
    if (token.kind === "left-parenthesis") {
      this.index += 1;
      const expression = this.parseOr();
      this.take("right-parenthesis", "Expected ')' after expression");
      return expression;
    }
    if (token.kind === "identifier" && token.text === "present") {
      this.index += 1;
      this.take("left-parenthesis", "Expected '(' after 'present'");
      const operand = this.parseOr();
      const closing = this.take("right-parenthesis", "Expected ')' after presence check");
      return {
        kind: "present",
        operand,
        valueType: "boolean",
        span: { start: token.span.start, end: closing.span.end },
      };
    }
    return this.parseValue();
  }

  private parseArray(): ArrayNode {
    const opening = this.take("left-bracket", "Expected '['");
    const elements: ExpressionNode[] = [];
    while (this.current().kind !== "right-bracket") {
      elements.push(this.parseOr());
      if (this.current().kind !== "comma") break;
      this.index += 1;
    }
    const closing = this.take("right-bracket", "Expected ']' after array literal");
    return {
      kind: "array",
      elements,
      valueType: "array",
      span: { start: opening.span.start, end: closing.span.end },
    };
  }

  private parseObject(): ObjectNode {
    const opening = this.take("left-brace", "Expected '{'");
    const properties: Record<string, ExpressionNode> = {};
    while (this.current().kind !== "right-brace") {
      const key = this.current();
      if (key.kind !== "identifier" && key.kind !== "string") {
        throw new ExpressionFailure(
          "expression-syntax",
          "Expected an object property name",
          key.span,
        );
      }
      this.index += 1;
      this.take("colon", "Expected ':' after object property name");
      properties[String(key.value ?? key.text)] = this.parseOr();
      if (this.current().kind !== "comma") break;
      this.index += 1;
    }
    const closing = this.take("right-brace", "Expected '}' after object literal");
    return {
      kind: "object",
      properties,
      valueType: "object",
      span: { start: opening.span.start, end: closing.span.end },
    };
  }

  private parseValue(): ExpressionNode {
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

  private comparisonOperator(operator: string): ComparisonOperator | undefined {
    const operators: Record<string, ComparisonOperator> = {
      "==": "eq",
      "!=": "ne",
      ">": "gt",
      ">=": "gte",
      "in": "in",
      "<": "lt",
      "<=": "lte",
    };
    return operators[operator];
  }

  private checkComparisonOperands(
    operator: ComparisonOperator,
    left: ExpressionNode,
    right: ExpressionNode,
    operatorSpan: SourceSpan,
  ): void {
    if (operator === "in") {
      if (right.kind !== "array") {
        throw new ExpressionFailure(
          "expression-type",
          `Operator 'in' requires an array on the right, received ${right.valueType}`,
          operatorSpan,
        );
      }
      const elementTypes = new Set(right.elements.map((element) => element.valueType));
      if (
        elementTypes.size > 0 &&
        left.valueType !== "unknown" &&
        !elementTypes.has("unknown") &&
        !elementTypes.has("null") &&
        !elementTypes.has(left.valueType)
      ) {
        throw new ExpressionFailure(
          "expression-type",
          `Cannot test ${left.valueType} membership in array of ${[...elementTypes].join(" or ")}`,
          operatorSpan,
        );
      }
      return;
    }
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

  private requireBoolean(operand: ExpressionNode, operator: Token): void {
    if (operand.valueType !== "boolean") {
      throw new ExpressionFailure(
        "expression-type",
        `Operator '${operator.text}' requires boolean operands, received ${operand.valueType}`,
        operator.span,
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
      expression: new ExpressionParser(source, tokenize(source), bindings).parse(),
      diagnostics: [],
    };
  } catch (error) {
    if (error instanceof ExpressionFailure) {
      return { diagnostics: [diagnostic(error, definitionPath, source)] };
    }
    throw error;
  }
}

function definitionBindings(definition: VersionedDefinition): Bindings {
  const bindings: Bindings = { ...baseBindings };
  if (typeof definition.subject_as === "string") {
    bindings[definition.subject_as] = { valueType: "entity", paths: entityPaths };
  }
  for (const value of Array.isArray(definition.parameters) ? definition.parameters : []) {
    if (typeof value !== "object" || value === null) continue;
    const parameter = value as Record<string, unknown>;
    if (typeof parameter.name !== "string") continue;
    const scalarTypes: Record<string, ValueType> = {
      boolean: "boolean",
      integer: "number",
      number: "number",
      string: "string",
    };
    const valueType = parameter.kind === "scalar"
      ? scalarTypes[String(parameter.scalar_type)] ?? "unknown"
      : "entity";
    bindings[parameter.name] = valueType === "entity"
      ? { valueType, paths: entityPaths }
      : { valueType };
  }
  return bindings;
}

export function compileDefinitionExpressions(
  definition: VersionedDefinition,
  filePath: string,
): ProcessDiagnostic[] {
  const bindings = definitionBindings(definition);
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
    (value as { kind?: unknown }).kind === "mdlm-expression";
}

function readPath(root: unknown, segments: string[]): unknown {
  let value = root;
  for (const segment of segments) {
    if (typeof value !== "object" || value === null) return undefined;
    value = (value as Record<string, unknown>)[segment];
  }
  return value;
}

function evaluateNode(node: ExpressionNode, context: Record<string, unknown>): unknown {
  switch (node.kind) {
    case "literal": return node.value;
    case "array": return node.elements.map((element) => evaluateNode(element, context));
    case "object": return Object.fromEntries(
      Object.entries(node.properties).map(([key, value]) => [key, evaluateNode(value, context)]),
    );
    case "variable": return context[node.variable];
    case "path": return readPath(context[node.variable], node.segments);
    case "not": return !evaluateNode(node.operand, context);
    case "present": return evaluateNode(node.operand, context) !== undefined;
    case "logical": {
      const left = evaluateNode(node.left, context) === true;
      return node.operator === "and"
        ? left && evaluateNode(node.right, context) === true
        : left || evaluateNode(node.right, context) === true;
    }
    case "comparison": {
      const left = evaluateNode(node.left, context);
      const right = evaluateNode(node.right, context);
      switch (node.operator) {
        case "eq": return expressionValuesEqual(left, right);
        case "ne": return !expressionValuesEqual(left, right);
        case "gt": return typeof left === "number" && typeof right === "number" && left > right;
        case "gte": return typeof left === "number" && typeof right === "number" && left >= right;
        case "in": return Array.isArray(right) && right.some((item) => expressionValuesEqual(left, item));
        case "lt": return typeof left === "number" && typeof right === "number" && left < right;
        case "lte": return typeof left === "number" && typeof right === "number" && left <= right;
      }
    }
  }
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
  return evaluateNode(expression.root, context) === true;
}
