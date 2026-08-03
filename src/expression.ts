import type { ProcessDiagnostic, VersionedDefinition } from "./index.js";

type ValueType = "array" | "boolean" | "entity" | "null" | "number" | "object" | "string" | "unknown";
type ComparisonOperator = "eq" | "ne" | "gt" | "gte" | "in" | "lt" | "lte";
type LogicalOperator = "and" | "or";
type SelectorOperation = "count" | "exists" | "none" | "one" | "select";

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
  domainKind?: string;
  lifecycleTypes?: string[];
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

interface SelectorNode extends NodeBase {
  kind: "selector";
  operation: SelectorOperation;
  reference: string;
  arguments: ObjectNode;
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
  | SelectorNode
  | VariableNode;

export interface CompiledTextExpression {
  kind: "mdlm-expression";
  source: string;
  root: ExpressionNode;
  span: SourceSpan;
}

interface Binding {
  valueType: ValueType;
  domainKind?: string;
  lifecycleTypes?: string[];
  paths?: Record<string, ValueType>;
}

type Bindings = Record<string, Binding>;
type SelectorDefinitions = Record<string, VersionedDefinition>;

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
    private readonly selectors: SelectorDefinitions,
    private readonly expectedType: ValueType = "boolean",
  ) {}

  parse(): CompiledTextExpression {
    const root = this.parseOr();
    this.take("eof", "Expected the expression to end");
    if (root.valueType !== this.expectedType) {
      throw new ExpressionFailure(
        "expression-result-type",
        `${this.expectedType === "boolean" ? "Rule condition" : "Expression"} must return ${this.expectedType}, received ${root.valueType}`,
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
    if (
      token.kind === "identifier" &&
      ["count", "exists", "none", "one", "select"].includes(token.text)
    ) {
      return this.parseSelectorCall(token.text as SelectorOperation);
    }
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

  private parseSelectorCall(operation: SelectorOperation): SelectorNode {
    const functionToken = this.take("identifier", `Expected '${operation}'`);
    this.take("left-parenthesis", `Expected '(' after '${operation}'`);
    const referenceToken = this.take("string", "Expected a versioned Selector reference string");
    this.take("comma", "Expected ',' after Selector reference");
    const argumentsNode = this.parseObject();
    const closing = this.take("right-parenthesis", "Expected ')' after Selector arguments");
    const reference = String(referenceToken.value);
    const match = /^([a-z][a-z0-9-]*)@([1-9][0-9]*)$/.exec(reference);
    const definition = match?.[1] ? this.selectors[match[1]] : undefined;
    if (!definition || definition.version !== Number(match?.[2])) {
      throw new ExpressionFailure(
        "expression-unknown-selector",
        `Unknown Selector '${reference}'`,
        referenceToken.span,
      );
    }
    this.checkSelectorArguments(definition, argumentsNode, referenceToken.span);
    const valueTypes: Record<SelectorOperation, ValueType> = {
      count: "number",
      exists: "boolean",
      none: "boolean",
      one: "entity",
      select: "array",
    };
    const lifecycleTypes = this.selectorLifecycleTypes(definition);
    return {
      kind: "selector",
      operation,
      reference,
      arguments: argumentsNode,
      valueType: valueTypes[operation],
      ...(["one", "select"].includes(operation) && typeof definition.result_kind === "string"
        ? { domainKind: definition.result_kind }
        : {}),
      ...(lifecycleTypes === undefined ? {} : { lifecycleTypes }),
      span: { start: functionToken.span.start, end: closing.span.end },
    };
  }

  private checkSelectorArguments(
    definition: VersionedDefinition,
    argumentsNode: ObjectNode,
    sourceSpan: SourceSpan,
  ): void {
    const supplied = argumentsNode.properties;
    const parameters = (Array.isArray(definition.parameters) ? definition.parameters : [])
      .filter((value): value is Record<string, unknown> => typeof value === "object" && value !== null);
    const expectedNames = new Set(parameters.map((parameter) => String(parameter.name)));
    for (const name of Object.keys(supplied)) {
      if (!expectedNames.has(name)) {
        throw new ExpressionFailure(
          "expression-selector-arguments",
          `Selector '${definition.id}@${definition.version}' has no argument '${name}'`,
          argumentsNode.span,
        );
      }
    }
    for (const parameter of parameters) {
      const name = String(parameter.name);
      const argument = supplied[name];
      if (!argument) {
        throw new ExpressionFailure(
          "expression-selector-arguments",
          `Selector '${definition.id}@${definition.version}' requires argument '${name}'`,
          sourceSpan,
        );
      }
      const expectedKind = String(parameter.kind);
      const expectedType = expectedKind === "scalar"
        ? this.scalarType(String(parameter.scalar_type))
        : ["baseline", "revision", "stable-datum"].includes(expectedKind)
          ? "entity"
          : "object";
      const kindMismatch = expectedType === "entity" &&
        argument.valueType === "entity" &&
        argument.domainKind !== undefined &&
        argument.domainKind !== expectedKind;
      const expectedLifecycleTypes = Array.isArray(parameter.types)
        ? parameter.types.filter((value): value is string => typeof value === "string")
        : [];
      const lifecycleTypeMismatch = expectedLifecycleTypes.length > 0 &&
        argument.lifecycleTypes !== undefined &&
        !argument.lifecycleTypes.some((type) => expectedLifecycleTypes.includes(type));
      if (
        (argument.valueType !== expectedType && argument.valueType !== "unknown") ||
        kindMismatch ||
        lifecycleTypeMismatch
      ) {
        throw new ExpressionFailure(
          "expression-selector-arguments",
          `Selector argument '${name}' requires ${expectedKind === "scalar" ? expectedType : this.describeRequiredKind(expectedKind, expectedLifecycleTypes)}, received ${this.describeNode(argument)}`,
          argument.span,
        );
      }
    }
  }

  private scalarType(type: string): ValueType {
    return type === "integer" || type === "number"
      ? "number"
      : type === "boolean"
        ? "boolean"
        : type === "string"
          ? "string"
          : "unknown";
  }

  private describeRequiredKind(kind: string, lifecycleTypes: string[]): string {
    if (lifecycleTypes.length === 0) return kind;
    return `${kind} of ${lifecycleTypes.length === 1 ? "type" : "types"} ${[...lifecycleTypes].sort().join(", ")}`;
  }

  private describeNode(node: ExpressionNode): string {
    if (node.kind === "selector" && node.operation === "select") return "selection";
    const kind = node.domainKind ?? node.valueType;
    if (!node.lifecycleTypes || node.lifecycleTypes.length === 0) return kind;
    return `${kind} of ${node.lifecycleTypes.length === 1 ? "type" : "types"} ${[...node.lifecycleTypes].sort().join(", ")}`;
  }

  private selectorLifecycleTypes(
    definition: VersionedDefinition,
    seen = new Set<string>(),
  ): string[] | undefined {
    if (seen.has(definition.id)) return undefined;
    seen.add(definition.id);
    const query = typeof definition.query === "object" && definition.query !== null
      ? definition.query as Record<string, unknown>
      : undefined;
    const from = typeof query?.from === "object" && query.from !== null
      ? query.from as Record<string, unknown>
      : undefined;
    const types = Array.isArray(from?.types)
      ? from.types.filter((value): value is string => typeof value === "string")
      : [];
    if (types.length > 0) return types;
    const selected = typeof from?.selector === "string"
      ? /^([a-z][a-z0-9-]*)@/.exec(from.selector)?.[1]
      : undefined;
    const parent = selected ? this.selectors[selected] : undefined;
    return parent ? this.selectorLifecycleTypes(parent, seen) : undefined;
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
        ...(binding.domainKind === undefined ? {} : { domainKind: binding.domainKind }),
        ...(binding.lifecycleTypes === undefined
          ? {}
          : { lifecycleTypes: binding.lifecycleTypes }),
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
    domainKind: "process",
    paths: {
      current_ref: "string",
      "integrity.package_valid": "boolean",
    },
  },
  phase: { valueType: "object", domainKind: "phase", paths: { id: "string" } },
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
  selectors: SelectorDefinitions,
  definitionPath: string,
  expectedType: ValueType = "boolean",
): { expression?: CompiledTextExpression; diagnostics: ProcessDiagnostic[] } {
  try {
    return {
      expression: new ExpressionParser(
        source,
        tokenize(source),
        bindings,
        selectors,
        expectedType,
      ).parse(),
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
    bindings[definition.subject_as] = {
      valueType: "entity",
      domainKind: "revision",
      paths: entityPaths,
    };
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
    const kind = String(parameter.kind);
    const valueType = kind === "scalar"
      ? scalarTypes[String(parameter.scalar_type)] ?? "unknown"
      : ["baseline", "revision", "stable-datum"].includes(kind)
        ? "entity"
        : "object";
    const lifecycleTypes = Array.isArray(parameter.types)
      ? parameter.types.filter((item): item is string => typeof item === "string")
      : undefined;
    bindings[parameter.name] = valueType === "entity"
      ? {
          valueType,
          domainKind: kind,
          ...(lifecycleTypes === undefined ? {} : { lifecycleTypes }),
          paths: entityPaths,
        }
      : { valueType, ...(kind === "scalar" ? {} : { domainKind: kind }) };
  }
  return bindings;
}

function entityBinding(domainKind: string): Binding {
  return { valueType: "entity", domainKind, paths: entityPaths };
}

function referencedSelector(
  value: unknown,
  selectors: SelectorDefinitions,
): VersionedDefinition | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^([a-z][a-z0-9-]*)@([1-9][0-9]*)$/.exec(value);
  const definition = match?.[1] ? selectors[match[1]] : undefined;
  return definition?.version === Number(match?.[2]) ? definition : undefined;
}

function selectorResultKind(
  value: unknown,
  selectors: SelectorDefinitions,
): string | undefined {
  if (isCompiledTextExpression(value)) {
    return value.root.kind === "selector" &&
      ["one", "select"].includes(value.root.operation)
      ? value.root.domainKind
      : undefined;
  }
  if (typeof value !== "object" || value === null) return undefined;
  const reference = (value as Record<string, unknown>).selector;
  const selector = referencedSelector(reference, selectors);
  return typeof selector?.result_kind === "string"
    ? selector.result_kind
    : undefined;
}

function queryResultKind(
  query: Record<string, unknown>,
  selectors: SelectorDefinitions,
): string {
  const from = typeof query.from === "object" && query.from !== null
    ? query.from as Record<string, unknown>
    : {};
  if (from.collection === "baselines") return "baseline";
  if (from.collection === "stable-data") return "stable-datum";
  if (from.collection === "revisions") return "revision";
  const selected = referencedSelector(from.selector, selectors);
  if (typeof selected?.result_kind === "string") return selected.result_kind;
  if (from.emit === "record") return "record";
  return "revision";
}

function compileField(
  owner: Record<string, unknown>,
  field: string,
  definitionPath: string,
  bindings: Bindings,
  selectors: SelectorDefinitions,
  diagnostics: ProcessDiagnostic[],
  expectedType: ValueType = "boolean",
): CompiledTextExpression | undefined {
  const source = owner[field];
  if (typeof source !== "string") return undefined;
  const result = compile(
    source,
    bindings,
    selectors,
    definitionPath,
    expectedType,
  );
  diagnostics.push(...result.diagnostics);
  if (result.expression) owner[field] = result.expression;
  return result.expression;
}

function compileRules(
  definition: VersionedDefinition,
  filePath: string,
  bindings: Bindings,
  selectors: SelectorDefinitions,
  diagnostics: ProcessDiagnostic[],
): void {
  const rules = Array.isArray(definition.rules) ? definition.rules : [];
  rules.forEach((value, index) => {
    if (typeof value !== "object" || value === null) return;
    compileField(
      value as Record<string, unknown>,
      "when",
      `${filePath}#rules[${index}].when`,
      bindings,
      selectors,
      diagnostics,
    );
  });
}

function compileSelectorDefinition(
  definition: VersionedDefinition,
  filePath: string,
  selectors: SelectorDefinitions,
  diagnostics: ProcessDiagnostic[],
): void {
  if (typeof definition.query !== "object" || definition.query === null) return;
  const query = definition.query as Record<string, unknown>;
  const bindings = definitionBindings(definition);
  if (typeof query.as === "string") {
    bindings[query.as] = entityBinding(queryResultKind(query, selectors));
  }
  compileField(
    query,
    "where",
    `${filePath}#query.where`,
    bindings,
    selectors,
    diagnostics,
  );
}

function compileObligationDefinition(
  definition: VersionedDefinition,
  filePath: string,
  selectors: SelectorDefinitions,
  diagnostics: ProcessDiagnostic[],
): void {
  const bindings: Bindings = { ...baseBindings };
  const textualForEach = typeof definition.for_each === "string";
  const compiledForEach = compileField(
    definition,
    "for_each",
    `${filePath}#for_each`,
    bindings,
    selectors,
    diagnostics,
    "array",
  );
  if (textualForEach && !compiledForEach) return;
  const subjectKind = selectorResultKind(definition.for_each, selectors);
  if (typeof definition.subject_as === "string" && subjectKind) {
    bindings[definition.subject_as] = entityBinding(subjectKind);
  }
  compileField(
    definition,
    "satisfied_when",
    `${filePath}#satisfied_when`,
    bindings,
    selectors,
    diagnostics,
  );
  const statusRules = Array.isArray(definition.status_rules)
    ? definition.status_rules
    : [];
  statusRules.forEach((value, index) => {
    if (typeof value !== "object" || value === null) return;
    compileField(
      value as Record<string, unknown>,
      "when",
      `${filePath}#status_rules[${index}].when`,
      bindings,
      selectors,
      diagnostics,
    );
  });
}

export function compileDefinitionExpressions(
  definition: VersionedDefinition,
  filePath: string,
  selectors: SelectorDefinitions,
): ProcessDiagnostic[] {
  const diagnostics: ProcessDiagnostic[] = [];
  if (definition.kind === "selector-definition") {
    compileSelectorDefinition(definition, filePath, selectors, diagnostics);
  } else if (definition.kind === "obligation-definition") {
    compileObligationDefinition(definition, filePath, selectors, diagnostics);
  } else {
    compileRules(
      definition,
      filePath,
      definitionBindings(definition),
      selectors,
      diagnostics,
    );
  }
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

export interface ExpressionHost {
  select(reference: string, argumentsValue: Record<string, unknown>): unknown[];
}

function evaluateNode(
  node: ExpressionNode,
  context: Record<string, unknown>,
  host: ExpressionHost,
): unknown {
  switch (node.kind) {
    case "literal": return node.value;
    case "array": return node.elements.map((element) => evaluateNode(element, context, host));
    case "object": return Object.fromEntries(
      Object.entries(node.properties).map(([key, value]) => [key, evaluateNode(value, context, host)]),
    );
    case "variable": return context[node.variable];
    case "path": return readPath(context[node.variable], node.segments);
    case "not": return !evaluateNode(node.operand, context, host);
    case "present": return evaluateNode(node.operand, context, host) !== undefined;
    case "selector": {
      const argumentsValue = evaluateNode(node.arguments, context, host);
      const results = host.select(
        node.reference,
        typeof argumentsValue === "object" && argumentsValue !== null
          ? argumentsValue as Record<string, unknown>
          : {},
      );
      switch (node.operation) {
        case "select": return results;
        case "exists": return results.length > 0;
        case "none": return results.length === 0;
        case "count": return results.length;
        case "one": return results.length === 1 ? results[0] : undefined;
      }
    }
    case "logical": {
      const left = evaluateNode(node.left, context, host) === true;
      return node.operator === "and"
        ? left && evaluateNode(node.right, context, host) === true
        : left || evaluateNode(node.right, context, host) === true;
    }
    case "comparison": {
      const left = evaluateNode(node.left, context, host);
      const right = evaluateNode(node.right, context, host);
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

export function evaluateCompiledTextValue(
  expression: CompiledTextExpression,
  context: Record<string, unknown>,
  host: ExpressionHost,
): unknown {
  return evaluateNode(expression.root, context, host);
}

export function evaluateCompiledTextExpression(
  expression: CompiledTextExpression,
  context: Record<string, unknown>,
  host: ExpressionHost,
): boolean {
  return evaluateCompiledTextValue(expression, context, host) === true;
}
