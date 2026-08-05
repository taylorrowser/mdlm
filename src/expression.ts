import { dependencyChangeExpressionPaths } from "./dependency-changes.js";
import type { ProcessDiagnostic, VersionedDefinition } from "./index.js";
import { structuralValuesEqual } from "./structural-equality.js";

type ValueType = "array" | "boolean" | "entity" | "null" | "number" | "object" | "string" | "unknown";
type ExpectedType = ValueType | "any";
type ComparisonOperator = "eq" | "ne" | "gt" | "gte" | "in" | "lt" | "lte";
type LogicalOperator = "and" | "or";
type SelectorOperation = "count" | "exists" | "none" | "one" | "select";

const comparisonOperatorByToken: Record<string, ComparisonOperator> = {
  "==": "eq",
  "!=": "ne",
  ">": "gt",
  ">=": "gte",
  "in": "in",
  "<": "lt",
  "<=": "lte",
};

const expressionOperators = [
  "!",
  "!=",
  "&&",
  "<",
  "<=",
  "==",
  ">",
  ">=",
  "in",
  "||",
] as const;

const expressionHostFunctions = [
  "count",
  "every",
  "exists",
  "none",
  "one",
  "policy",
  "present",
  "select",
  "state",
] as const;

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

interface StateNode extends NodeBase {
  kind: "state";
  dimension: string;
  subject: ExpressionNode;
}

interface PolicyNode extends NodeBase {
  kind: "policy";
  reference: string;
  arguments: ObjectNode;
  field: string;
}

interface EveryNode extends NodeBase {
  kind: "every";
  reference: string;
  arguments: ObjectNode;
  binding: string;
  predicate: ExpressionNode;
}

type ExpressionNode =
  | ArrayNode
  | ComparisonNode
  | EveryNode
  | LiteralNode
  | LogicalNode
  | NegationNode
  | ObjectNode
  | PathNode
  | PresenceNode
  | PolicyNode
  | SelectorNode
  | StateNode
  | VariableNode;

export interface CompiledTextExpression {
  kind: "mdlm-expression";
  source: string;
  root: ExpressionNode;
  span: SourceSpan;
  contract?: {
    definitionPath: string;
    expectedType: ExpectedType;
    bindings: Record<string, Binding>;
  };
}

export interface CompiledExpressionShape {
  valueType: ValueType;
  domainKind?: string;
  lifecycleTypes?: string[];
}

interface Binding {
  valueType: ValueType;
  domainKind?: string;
  lifecycleTypes?: string[];
  paths?: Record<string, ValueType>;
}

type Bindings = Record<string, Binding>;
type DefinitionCatalog = Record<string, VersionedDefinition>;

export interface ExpressionDefinitionCatalogs {
  selectors: DefinitionCatalog;
  states: DefinitionCatalog;
  policies: DefinitionCatalog;
  scenarios: DefinitionCatalog;
}

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
    const operator = source.slice(offset).match(/^(=>|==|!=|>=|<=|&&|\|\||>|<|!)/)?.[0];
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
    private readonly selectors: DefinitionCatalog,
    private readonly states: DefinitionCatalog,
    private readonly policies: DefinitionCatalog,
    private readonly expectedType: ExpectedType = "boolean",
  ) {}

  parse(): CompiledTextExpression {
    const root = this.parseOr();
    this.take("eof", "Expected the expression to end");
    if (this.expectedType !== "any" && root.valueType !== this.expectedType) {
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
    if (token.kind === "identifier" && token.text === "every") {
      return this.parseEveryCall();
    }
    if (
      token.kind === "identifier" &&
      ["count", "exists", "none", "one", "select"].includes(token.text)
    ) {
      return this.parseSelectorCall(token.text as SelectorOperation);
    }
    if (token.kind === "identifier" && token.text === "state") {
      return this.parseStateCall();
    }
    if (token.kind === "identifier" && token.text === "policy") {
      return this.parsePolicyCall();
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

  private parseEveryCall(): EveryNode {
    const functionToken = this.take("identifier", "Expected 'every'");
    this.take("left-parenthesis", "Expected '(' after 'every'");
    const referenceToken = this.take(
      "string",
      "Expected a versioned Selector reference string",
    );
    this.take("comma", "Expected ',' after Selector reference");
    const argumentsNode = this.parseObject();
    this.take("comma", "Expected ',' before universal predicate binding");
    const bindingToken = this.take(
      "identifier",
      "Expected a universal predicate binding",
    );
    const arrow = this.take("operator", "Expected '=>' after predicate binding");
    if (arrow.text !== "=>") {
      throw new ExpressionFailure(
        "expression-syntax",
        "Expected '=>' after predicate binding",
        arrow.span,
      );
    }
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
    this.checkDefinitionArguments(
      "Selector",
      "expression-selector-arguments",
      definition,
      argumentsNode,
      referenceToken.span,
    );
    const binding = this.selectorResultBinding(definition);
    const priorBinding = this.bindings[bindingToken.text];
    this.bindings[bindingToken.text] = binding;
    let predicate: ExpressionNode;
    try {
      predicate = this.parseOr();
    } finally {
      if (priorBinding) this.bindings[bindingToken.text] = priorBinding;
      else delete this.bindings[bindingToken.text];
    }
    if (predicate.valueType !== "boolean") {
      throw new ExpressionFailure(
        "expression-predicate-type",
        `Universal predicate must return boolean, received ${predicate.valueType}`,
        predicate.span,
      );
    }
    const closing = this.take(
      "right-parenthesis",
      "Expected ')' after universal predicate",
    );
    return {
      kind: "every",
      reference,
      arguments: argumentsNode,
      binding: bindingToken.text,
      predicate,
      valueType: "boolean",
      span: { start: functionToken.span.start, end: closing.span.end },
    };
  }

  private selectorResultBinding(definition: VersionedDefinition): Binding {
    const domainKind = typeof definition.result_kind === "string"
      ? definition.result_kind
      : "record";
    if (domainKind === "record") {
      return {
        valueType: "object",
        domainKind,
        paths: dependencyChangeExpressionPaths,
      };
    }
    if (!["baseline", "revision", "stable-datum"].includes(domainKind)) {
      return { valueType: "object", domainKind };
    }
    const lifecycleTypes = this.selectorLifecycleTypes(definition);
    return {
      valueType: "entity",
      domainKind,
      ...(lifecycleTypes === undefined ? {} : { lifecycleTypes }),
      paths: entityPaths,
    };
  }

  private parsePolicyCall(): PolicyNode {
    const functionToken = this.take("identifier", "Expected 'policy'");
    this.take("left-parenthesis", "Expected '(' after 'policy'");
    const referenceToken = this.take(
      "string",
      "Expected a versioned Policy reference string",
    );
    this.take("comma", "Expected ',' after Policy reference");
    const argumentsNode = this.parseObject();
    this.take("right-parenthesis", "Expected ')' after Policy arguments");
    this.take("dot", "Expected a selected Policy result field");
    const fieldToken = this.take(
      "identifier",
      "Expected a Policy result field after '.'",
    );
    const reference = String(referenceToken.value);
    const match = /^([a-z][a-z0-9-]*)@([1-9][0-9]*)$/.exec(reference);
    const definition = match?.[1] ? this.policies[match[1]] : undefined;
    if (!definition || definition.version !== Number(match?.[2])) {
      throw new ExpressionFailure(
        "expression-unknown-policy",
        `Unknown Policy '${reference}'`,
        referenceToken.span,
      );
    }
    this.checkDefinitionArguments(
      "Policy",
      "expression-policy-arguments",
      definition,
      argumentsNode,
      referenceToken.span,
    );
    const resultSchema = typeof definition.result_schema === "object" &&
        definition.result_schema !== null
      ? definition.result_schema as Record<string, unknown>
      : {};
    const properties = typeof resultSchema.properties === "object" &&
        resultSchema.properties !== null
      ? resultSchema.properties as Record<string, unknown>
      : {};
    const property = typeof properties[fieldToken.text] === "object" &&
        properties[fieldToken.text] !== null
      ? properties[fieldToken.text] as Record<string, unknown>
      : undefined;
    if (!property) {
      throw new ExpressionFailure(
        "expression-policy-result",
        `Policy '${reference}' has no result field '${fieldToken.text}'`,
        fieldToken.span,
      );
    }
    return {
      kind: "policy",
      reference,
      arguments: argumentsNode,
      field: fieldToken.text,
      valueType: this.schemaValueType(property.type),
      span: { start: functionToken.span.start, end: fieldToken.span.end },
    };
  }

  private parseStateCall(): StateNode {
    const functionToken = this.take("identifier", "Expected 'state'");
    this.take("left-parenthesis", "Expected '(' after 'state'");
    const subject = this.parseOr();
    this.take("comma", "Expected ',' after Computed State subject");
    const dimensionToken = this.take(
      "string",
      "Expected a Computed State dimension string",
    );
    const closing = this.take(
      "right-parenthesis",
      "Expected ')' after Computed State dimension",
    );
    const dimension = String(dimensionToken.value);
    const definition = this.states[dimension];
    if (!definition) {
      throw new ExpressionFailure(
        "expression-unknown-state",
        `Unknown Computed State dimension '${dimension}'`,
        dimensionToken.span,
      );
    }
    if (
      subject.valueType !== "entity" ||
      (subject.domainKind !== undefined &&
        !["baseline", "revision"].includes(subject.domainKind))
    ) {
      throw new ExpressionFailure(
        "expression-state-subject",
        `Computed State subject must be a revision, received ${this.describeNode(subject)}`,
        subject.span,
      );
    }
    return {
      kind: "state",
      dimension,
      subject,
      valueType: definition.cardinality === "zero-or-more" ? "array" : "string",
      span: { start: functionToken.span.start, end: closing.span.end },
    };
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
    this.checkDefinitionArguments(
      "Selector",
      "expression-selector-arguments",
      definition,
      argumentsNode,
      referenceToken.span,
    );
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

  private checkDefinitionArguments(
    definitionKind: "Policy" | "Selector",
    diagnosticCode: string,
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
          diagnosticCode,
          `${definitionKind} '${definition.id}@${definition.version}' has no argument '${name}'`,
          argumentsNode.span,
        );
      }
    }
    for (const parameter of parameters) {
      const name = String(parameter.name);
      const argument = supplied[name];
      if (!argument) {
        throw new ExpressionFailure(
          diagnosticCode,
          `${definitionKind} '${definition.id}@${definition.version}' requires argument '${name}'`,
          sourceSpan,
        );
      }
      const expectedKind = String(parameter.kind);
      const expectedType = expectedKind === "scalar"
        ? this.scalarType(String(parameter.scalar_type))
        : ["baseline", "revision", "stable-datum"].includes(expectedKind)
          ? "entity"
          : "object";
      const compatibleKinds = expectedKind === "revision"
        ? ["baseline", "revision"]
        : [expectedKind];
      const kindMismatch = expectedType === "entity" &&
        argument.valueType === "entity" &&
        argument.domainKind !== undefined &&
        !compatibleKinds.includes(argument.domainKind);
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
          diagnosticCode,
          `${definitionKind} argument '${name}' requires ${expectedKind === "scalar" ? expectedType : this.describeRequiredKind(expectedKind, expectedLifecycleTypes)}, received ${this.describeNode(argument)}`,
          argument.span,
        );
      }
    }
  }

  private schemaValueType(value: unknown): ValueType {
    const types = Array.isArray(value) ? value : [value];
    const type = types.find((item) => item !== "null");
    if (type === "integer" || type === "number") return "number";
    if (["array", "boolean", "null", "object", "string"].includes(String(type))) {
      return type as ValueType;
    }
    return "unknown";
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
    return comparisonOperatorByToken[operator];
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
  execution: {
    valueType: "object",
    domainKind: "execution",
    paths: { "integrity.contract_valid": "boolean" },
  },
};

export interface ExpressionLanguageCapabilities {
  contextRoots: {
    id: string;
    paths: { path: string; type: ValueType }[];
  }[];
  operators: string[];
  hostFunctions: string[];
}

export function expressionLanguageCapabilities(): ExpressionLanguageCapabilities {
  return {
    contextRoots: Object.entries(baseBindings)
      .map(([id, binding]) => ({
        id,
        paths: Object.entries(binding.paths ?? {})
          .map(([path, type]) => ({ path, type }))
          .sort((left, right) => left.path.localeCompare(right.path)),
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    operators: [...expressionOperators],
    hostFunctions: [...expressionHostFunctions],
  };
}

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
  selectors: DefinitionCatalog,
  states: DefinitionCatalog,
  policies: DefinitionCatalog,
  definitionPath: string,
  expectedType: ExpectedType = "boolean",
): { expression?: CompiledTextExpression; diagnostics: ProcessDiagnostic[] } {
  try {
    const expression = new ExpressionParser(
      source,
      tokenize(source),
      bindings,
      selectors,
      states,
      policies,
      expectedType,
    ).parse();
    expression.contract = {
      definitionPath,
      expectedType,
      bindings: structuredClone(bindings),
    };
    return { expression, diagnostics: [] };
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

function entityBinding(
  domainKind: string,
  lifecycleTypes?: string[],
): Binding {
  if (domainKind === "record") {
    return {
      valueType: "object",
      domainKind,
      paths: dependencyChangeExpressionPaths,
    };
  }
  return {
    valueType: "entity",
    domainKind,
    ...(lifecycleTypes === undefined ? {} : { lifecycleTypes }),
    paths: entityPaths,
  };
}

function referencedSelector(
  value: unknown,
  selectors: DefinitionCatalog,
): VersionedDefinition | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^([a-z][a-z0-9-]*)@([1-9][0-9]*)$/.exec(value);
  const definition = match?.[1] ? selectors[match[1]] : undefined;
  return definition?.version === Number(match?.[2]) ? definition : undefined;
}

function selectorResultKind(
  value: unknown,
  selectors: DefinitionCatalog,
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
  selectors: DefinitionCatalog,
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
  catalogs: ExpressionDefinitionCatalogs,
  diagnostics: ProcessDiagnostic[],
  expectedType: ExpectedType = "boolean",
): CompiledTextExpression | undefined {
  const source = owner[field];
  if (typeof source !== "string") return undefined;
  const result = compile(
    source,
    bindings,
    catalogs.selectors,
    catalogs.states,
    catalogs.policies,
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
  catalogs: ExpressionDefinitionCatalogs,
  diagnostics: ProcessDiagnostic[],
): void {
  const rules = Array.isArray(definition.rules) ? definition.rules : [];
  rules.forEach((value, index) => {
    if (typeof value !== "object" || value === null) return;
    const rule = value as Record<string, unknown>;
    compileField(
      rule,
      "when",
      `${filePath}#rules[${index}].when`,
      bindings,
      catalogs,
      diagnostics,
    );
    compileField(
      rule,
      "explanation_evidence",
      `${filePath}#rules[${index}].explanation_evidence`,
      bindings,
      catalogs,
      diagnostics,
      "any",
    );
  });
}

function compileStringValues(
  owner: unknown,
  definitionPath: string,
  bindings: Bindings,
  catalogs: ExpressionDefinitionCatalogs,
  diagnostics: ProcessDiagnostic[],
): void {
  if (typeof owner !== "object" || owner === null || Array.isArray(owner)) return;
  for (const key of Object.keys(owner)) {
    compileField(
      owner as Record<string, unknown>,
      key,
      `${definitionPath}.${key}`,
      bindings,
      catalogs,
      diagnostics,
      "any",
    );
  }
}

function compileSelectorDefinition(
  definition: VersionedDefinition,
  filePath: string,
  catalogs: ExpressionDefinitionCatalogs,
  diagnostics: ProcessDiagnostic[],
): void {
  if (typeof definition.query !== "object" || definition.query === null) return;
  const query = definition.query as Record<string, unknown>;
  const bindings = definitionBindings(definition);
  const from = typeof query.from === "object" && query.from !== null
    ? query.from as Record<string, unknown>
    : undefined;
  if (from) {
    compileField(
      from,
      "of",
      `${filePath}#query.from.of`,
      bindings,
      catalogs,
      diagnostics,
      "entity",
    );
    compileStringValues(
      from.arguments,
      `${filePath}#query.from.arguments`,
      bindings,
      catalogs,
      diagnostics,
    );
  }
  if (typeof query.as === "string") {
    bindings[query.as] = entityBinding(
      queryResultKind(query, catalogs.selectors),
    );
  }
  compileField(
    query,
    "where",
    `${filePath}#query.where`,
    bindings,
    catalogs,
    diagnostics,
  );
}

function compileObligationDefinition(
  definition: VersionedDefinition,
  filePath: string,
  catalogs: ExpressionDefinitionCatalogs,
  diagnostics: ProcessDiagnostic[],
): void {
  const bindings: Bindings = { ...baseBindings };
  const textualForEach = typeof definition.for_each === "string";
  const compiledForEach = compileField(
    definition,
    "for_each",
    `${filePath}#for_each`,
    bindings,
    catalogs,
    diagnostics,
    "array",
  );
  if (textualForEach && !compiledForEach) return;
  const subjectKind = selectorResultKind(
    definition.for_each,
    catalogs.selectors,
  );
  if (typeof definition.subject_as === "string" && subjectKind) {
    bindings[definition.subject_as] = entityBinding(
      subjectKind,
      compiledForEach?.root.lifecycleTypes,
    );
  }
  compileField(
    definition,
    "satisfied_when",
    `${filePath}#satisfied_when`,
    bindings,
    catalogs,
    diagnostics,
  );
  const statusRules = Array.isArray(definition.status_rules)
    ? definition.status_rules
    : [];
  statusRules.forEach((value, index) => {
    if (typeof value !== "object" || value === null) return;
    const rule = value as Record<string, unknown>;
    compileField(
      rule,
      "when",
      `${filePath}#status_rules[${index}].when`,
      bindings,
      catalogs,
      diagnostics,
    );
    const blockers = Array.isArray(rule.blocked_by) ? rule.blocked_by : [];
    blockers.forEach((blockerValue, blockerIndex) => {
      if (typeof blockerValue !== "object" || blockerValue === null) return;
      compileField(
        blockerValue as Record<string, unknown>,
        "subjects",
        `${filePath}#status_rules[${index}].blocked_by[${blockerIndex}].subjects`,
        bindings,
        catalogs,
        diagnostics,
        "array",
      );
    });
  });

  const resolver = typeof definition.resolve_with === "object" &&
      definition.resolve_with !== null
    ? definition.resolve_with as Record<string, unknown>
    : undefined;
  const dispatch = typeof resolver?.dispatch === "object" &&
      resolver.dispatch !== null
    ? resolver.dispatch as Record<string, unknown>
    : undefined;
  if (dispatch) {
    compileField(
      dispatch,
      "for_each",
      `${filePath}#resolve_with.dispatch.for_each`,
      bindings,
      catalogs,
      diagnostics,
      "array",
    );
    const dispatchKind = selectorResultKind(
      dispatch.for_each,
      catalogs.selectors,
    );
    if (typeof dispatch.as === "string" && dispatchKind) {
      const compiledDispatch = isCompiledTextExpression(dispatch.for_each)
        ? dispatch.for_each
        : undefined;
      bindings[dispatch.as] = entityBinding(
        dispatchKind,
        compiledDispatch?.root.lifecycleTypes,
      );
    }
  }
  compileStringValues(
    resolver?.inputs,
    `${filePath}#resolve_with.inputs`,
    bindings,
    catalogs,
    diagnostics,
  );
}

function definitionEntityBindings(
  values: unknown,
  cardinalityAware: boolean,
): Bindings {
  const bindings: Bindings = { ...baseBindings };
  for (const value of Array.isArray(values) ? values : []) {
    if (typeof value !== "object" || value === null) continue;
    const item = value as Record<string, unknown>;
    if (typeof item.name !== "string") continue;
    const lifecycleTypes = Array.isArray(item.types)
      ? item.types.filter((type): type is string => typeof type === "string")
      : undefined;
    const many = cardinalityAware &&
      ["one-or-more", "zero-or-more"].includes(String(item.cardinality));
    bindings[item.name] = many
      ? { valueType: "array", ...(lifecycleTypes ? { lifecycleTypes } : {}) }
      : {
          valueType: "entity",
          domainKind: "revision",
          ...(lifecycleTypes ? { lifecycleTypes } : {}),
          paths: entityPaths,
        };
  }
  return bindings;
}

function compileScenarioDefinition(
  definition: VersionedDefinition,
  filePath: string,
  catalogs: ExpressionDefinitionCatalogs,
  diagnostics: ProcessDiagnostic[],
): void {
  const conditionBindings = definitionEntityBindings(definition.inputs, false);
  const inputs = Array.isArray(definition.inputs) ? definition.inputs : [];
  inputs.forEach((value, index) => {
    if (typeof value !== "object" || value === null) return;
    compileField(
      value as Record<string, unknown>,
      "conditions",
      `${filePath}#inputs[${index}].conditions`,
      conditionBindings,
      catalogs,
      diagnostics,
    );
  });
  const completionBindings = {
    ...definitionEntityBindings(definition.inputs, true),
    ...definitionEntityBindings(definition.outputs, true),
  };
  compileField(
    definition,
    "completion",
    `${filePath}#completion`,
    completionBindings,
    catalogs,
    diagnostics,
  );
}

function compileAliasDefinition(
  definition: VersionedDefinition,
  filePath: string,
  catalogs: ExpressionDefinitionCatalogs,
  diagnostics: ProcessDiagnostic[],
): void {
  const argumentsValue = typeof definition.arguments === "object" &&
      definition.arguments !== null && !Array.isArray(definition.arguments)
    ? definition.arguments as Record<string, unknown>
    : {};
  const argumentPaths: Record<string, ValueType> = {};
  const reservedArguments = new Set([
    "adapter",
    "initiate",
    "input",
    "json",
    "obligation",
  ]);
  for (const [name, value] of Object.entries(argumentsValue)) {
    if (reservedArguments.has(name)) {
      diagnostics.push({
        code: "alias-reserved-argument",
        path: `${filePath}#arguments.${name}`,
        message: `Package Command Alias argument '${name}' conflicts with a kernel-owned invocation option`,
      });
    }
    const argument = typeof value === "object" && value !== null
      ? value as Record<string, unknown>
      : {};
    argumentPaths[name] = ["one-or-more", "zero-or-more"].includes(
        String(argument.cardinality),
      )
      ? "array"
      : "string";
  }
  const bindings: Bindings = {
    args: { valueType: "object", domainKind: "command-arguments", paths: argumentPaths },
  };
  const scenarioMatch = typeof definition.scenario === "string"
    ? /^([a-z][a-z0-9-]*)@([1-9][0-9]*)$/.exec(definition.scenario)
    : undefined;
  const scenario = scenarioMatch?.[1]
    ? catalogs.scenarios[scenarioMatch[1]]
    : undefined;
  if (!scenario || scenario.version !== Number(scenarioMatch?.[2])) return;
  const scenarioInputs = new Map(
    (Array.isArray(scenario.inputs) ? scenario.inputs : []).flatMap((value) => {
      if (typeof value !== "object" || value === null) return [];
      const input = value as Record<string, unknown>;
      return typeof input.name === "string" ? [[input.name, input] as const] : [];
    }),
  );
  const inputs = typeof definition.inputs === "object" &&
      definition.inputs !== null && !Array.isArray(definition.inputs)
    ? definition.inputs as Record<string, unknown>
    : {};
  for (const name of Object.keys(inputs)) {
    const contract = scenarioInputs.get(name);
    if (!contract) {
      diagnostics.push({
        code: "alias-unknown-scenario-input",
        path: `${filePath}#inputs.${name}`,
        message: `Package Command Alias '${definition.id}' binds unknown Scenario input '${name}'`,
      });
      continue;
    }
    const compiled = compileField(
      inputs,
      name,
      `${filePath}#inputs.${name}`,
      bindings,
      catalogs,
      diagnostics,
      ["one-or-more", "zero-or-more"].includes(String(contract.cardinality))
        ? "array"
        : "string",
    );
    if (compiled && expressionDependencies(compiled.root).length > 0) {
      diagnostics.push({
        code: "alias-host-function-forbidden",
        path: `${filePath}#inputs.${name}`,
        message: "Package Command Alias expressions may bind declared arguments and literals but may not invoke evaluator host functions",
      });
    }
  }
}

function compilePhaseDefinition(
  definition: VersionedDefinition,
  filePath: string,
  catalogs: ExpressionDefinitionCatalogs,
  diagnostics: ProcessDiagnostic[],
): void {
  compileField(
    definition,
    "entry",
    `${filePath}#entry`,
    { ...baseBindings },
    catalogs,
    diagnostics,
  );
  if (typeof definition.gate !== "object" || definition.gate === null) return;
  const gate = definition.gate as Record<string, unknown>;
  compileField(
    gate,
    "candidate_selector",
    `${filePath}#gate.candidate_selector`,
    { ...baseBindings },
    catalogs,
    diagnostics,
    "array",
  );
  const bindings: Bindings = { ...baseBindings };
  const candidateKind = selectorResultKind(
    gate.candidate_selector,
    catalogs.selectors,
  );
  if (typeof gate.candidate_as === "string" && candidateKind) {
    bindings[gate.candidate_as] = entityBinding(candidateKind);
  }
  compileField(
    gate,
    "completion",
    `${filePath}#gate.completion`,
    bindings,
    catalogs,
    diagnostics,
  );
}

export function compileDefinitionExpressions(
  definition: VersionedDefinition,
  filePath: string,
  catalogs: ExpressionDefinitionCatalogs,
): ProcessDiagnostic[] {
  const diagnostics: ProcessDiagnostic[] = [];
  if (definition.kind === "selector-definition") {
    compileSelectorDefinition(definition, filePath, catalogs, diagnostics);
  } else if (definition.kind === "obligation-definition") {
    compileObligationDefinition(definition, filePath, catalogs, diagnostics);
  } else if (definition.kind === "scenario-definition") {
    compileScenarioDefinition(definition, filePath, catalogs, diagnostics);
  } else if (definition.kind === "phase-definition") {
    compilePhaseDefinition(definition, filePath, catalogs, diagnostics);
  } else if (definition.kind === "command-alias-definition") {
    compileAliasDefinition(definition, filePath, catalogs, diagnostics);
  } else {
    compileRules(
      definition,
      filePath,
      definitionBindings(definition),
      catalogs,
      diagnostics,
    );
  }
  return diagnostics;
}

type ExpressionDependency =
  | `policy:${string}`
  | `selector:${string}`
  | `state:${string}`;

function expressionDependencies(node: ExpressionNode): ExpressionDependency[] {
  switch (node.kind) {
    case "literal":
    case "path":
    case "variable":
      return [];
    case "array":
      return node.elements.flatMap(expressionDependencies);
    case "every":
      return [
        `selector:${node.reference.split("@")[0] ?? node.reference}`,
        ...expressionDependencies(node.arguments),
        ...expressionDependencies(node.predicate),
      ];
    case "object":
      return Object.values(node.properties).flatMap(expressionDependencies);
    case "comparison":
    case "logical":
      return [
        ...expressionDependencies(node.left),
        ...expressionDependencies(node.right),
      ];
    case "not":
    case "present":
      return expressionDependencies(node.operand);
    case "selector":
      return [
        `selector:${node.reference.split("@")[0] ?? node.reference}`,
        ...expressionDependencies(node.arguments),
      ];
    case "state":
      return [
        `state:${node.dimension}`,
        ...expressionDependencies(node.subject),
      ];
    case "policy":
      return [
        `policy:${node.reference.split("@")[0] ?? node.reference}`,
        ...expressionDependencies(node.arguments),
      ];
  }
}

function definitionDependencies(
  definition: VersionedDefinition,
): ExpressionDependency[] {
  const dependencies = new Set<ExpressionDependency>();
  const visit = (value: unknown): void => {
    if (isCompiledTextExpression(value)) {
      for (const dependency of expressionDependencies(value.root)) {
        dependencies.add(dependency);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== "object" || value === null) return;
    Object.values(value).forEach(visit);
  };
  visit(definition);
  if (definition.kind === "selector-definition") {
    const query = typeof definition.query === "object" && definition.query !== null
      ? definition.query as Record<string, unknown>
      : undefined;
    const from = typeof query?.from === "object" && query.from !== null
      ? query.from as Record<string, unknown>
      : undefined;
    if (typeof from?.selector === "string") {
      dependencies.add(
        `selector:${from.selector.split("@")[0] ?? from.selector}`,
      );
    }
  }
  return [...dependencies];
}

function dependencyLabel(
  dependency: ExpressionDependency,
  catalogs: ExpressionDefinitionCatalogs,
): string {
  const [kind, id] = dependency.split(":") as [
    "policy" | "selector" | "state",
    string,
  ];
  if (kind === "state") return `Computed State '${id}'`;
  const catalog = kind === "policy" ? catalogs.policies : catalogs.selectors;
  const version = catalog[id]?.version;
  const label = kind === "policy" ? "Policy" : "Selector";
  return `${label} '${id}${version === undefined ? "" : `@${version}`}'`;
}

export function validateExpressionDependencyCycles(
  catalogs: ExpressionDefinitionCatalogs,
): ProcessDiagnostic[] {
  const graph = new Map<ExpressionDependency, ExpressionDependency[]>();
  for (const id of Object.keys(catalogs.selectors).sort()) {
    graph.set(`selector:${id}`, definitionDependencies(catalogs.selectors[id]!));
  }
  for (const id of Object.keys(catalogs.states).sort()) {
    graph.set(`state:${id}`, definitionDependencies(catalogs.states[id]!));
  }
  for (const id of Object.keys(catalogs.policies).sort()) {
    graph.set(`policy:${id}`, definitionDependencies(catalogs.policies[id]!));
  }

  const visited = new Set<ExpressionDependency>();
  const visiting = new Set<ExpressionDependency>();
  const stack: ExpressionDependency[] = [];
  let cycle: ExpressionDependency[] | undefined;
  const visit = (node: ExpressionDependency): void => {
    if (cycle || visited.has(node)) return;
    if (visiting.has(node)) {
      const start = stack.indexOf(node);
      cycle = [...stack.slice(start), node];
      return;
    }
    visiting.add(node);
    stack.push(node);
    for (const dependency of graph.get(node) ?? []) {
      if (graph.has(dependency)) visit(dependency);
    }
    stack.pop();
    visiting.delete(node);
    visited.add(node);
  };
  for (const node of graph.keys()) visit(node);
  if (!cycle) return [];
  const detected = cycle as ExpressionDependency[];
  const members = detected.slice(0, -1);
  const first = members.reduce(
    (best, item, index) =>
      dependencyLabel(item, catalogs).localeCompare(
          dependencyLabel(members[best]!, catalogs),
        ) < 0
        ? index
        : best,
    0,
  );
  const ordered = [
    ...members.slice(first),
    ...members.slice(0, first),
  ];
  const completeCycle = [...ordered, ordered[0]!];
  return [{
    code: "expression-dependency-cycle",
    path: completeCycle[0] ?? "expressions",
    message: `Expression dependency cycle: ${completeCycle.map((item) => dependencyLabel(item, catalogs)).join(" -> ")}`,
  }];
}

export function isCompiledTextExpression(
  value: unknown,
): value is CompiledTextExpression {
  return typeof value === "object" && value !== null &&
    (value as { kind?: unknown }).kind === "mdlm-expression";
}

export function compiledExpressionShape(
  value: unknown,
): CompiledExpressionShape | undefined {
  if (!isCompiledTextExpression(value)) return undefined;
  return {
    valueType: value.root.valueType,
    ...(value.root.domainKind === undefined
      ? {}
      : { domainKind: value.root.domainKind }),
    ...(value.root.lifecycleTypes === undefined
      ? {}
      : { lifecycleTypes: [...value.root.lifecycleTypes] }),
  };
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
  policy(reference: string, argumentsValue: Record<string, unknown>): unknown;
  select(reference: string, argumentsValue: Record<string, unknown>): unknown[];
  state(subject: unknown, dimension: string): unknown;
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
    case "every": {
      const argumentsValue = evaluateNode(node.arguments, context, host);
      const results = host.select(
        node.reference,
        typeof argumentsValue === "object" && argumentsValue !== null
          ? argumentsValue as Record<string, unknown>
          : {},
      );
      return results.every((result) =>
        evaluateNode(
          node.predicate,
          { ...context, [node.binding]: result },
          host,
        ) === true
      );
    }
    case "policy": return readPath(
      host.policy(
        node.reference,
        evaluateNode(node.arguments, context, host) as Record<string, unknown>,
      ),
      [node.field],
    );
    case "state": return host.state(
      evaluateNode(node.subject, context, host),
      node.dimension,
    );
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
  return structuralValuesEqual(left, right);
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
