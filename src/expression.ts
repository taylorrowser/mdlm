import { dependencyChangeExpressionPaths } from "./dependency-changes.js";
import type { ProcessDiagnostic, VersionedDefinition } from "./index.js";
import { structuralValuesEqual } from "./structural-equality.js";

type ValueType = "array" | "boolean" | "entity" | "integer" | "null" | "number" | "object" | "string" | "unknown";
type ExpectedType = ValueType | "any";
type ComparisonOperator = "eq" | "ne" | "gt" | "gte" | "in" | "lt" | "lte";
type LogicalOperator = "and" | "or";
type SelectorOperation = "count" | "exists" | "first" | "none" | "one" | "select";

function valueTypeCompatible(actual: ValueType, expected: ExpectedType): boolean {
  return expected === "any" || actual === "unknown" || actual === expected ||
    (actual === "integer" && expected === "number");
}

function numericValueType(value: ValueType): boolean {
  return value === "integer" || value === "number";
}

function displayedValueType(value: ValueType): ValueType {
  return value === "integer" ? "number" : value;
}

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
  "array_has_field",
  "array_fields_equal",
  "array_unique_field",
  "count",
  "every",
  "exists",
  "first",
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

interface ArrayHasFieldNode extends NodeBase {
  kind: "array-has-field";
  array: ExpressionNode;
  field: string;
  expected: ExpressionNode;
}

interface ArrayFieldsEqualNode extends NodeBase {
  kind: "array-fields-equal";
  left: ExpressionNode;
  right: ExpressionNode;
  fields: string[];
}

interface ArrayUniqueFieldNode extends NodeBase {
  kind: "array-unique-field";
  array: ExpressionNode;
  field: string;
}

type ExpressionNode =
  | ArrayFieldsEqualNode
  | ArrayUniqueFieldNode
  | ArrayHasFieldNode
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
  strictPayloadPaths?: boolean;
}

type Bindings = Record<string, Binding>;
type DefinitionCatalog = Record<string, VersionedDefinition>;

export interface ExpressionDefinitionCatalogs {
  templates: DefinitionCatalog;
  types: DefinitionCatalog;
  selectors: DefinitionCatalog;
  states: DefinitionCatalog;
  policies: DefinitionCatalog;
  exactBaselineType?: string;
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
    if (!valueTypeCompatible(root.valueType, this.expectedType)) {
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
    if (token.kind === "identifier" && token.text === "array_has_field") {
      return this.parseArrayHasFieldCall();
    }
    if (token.kind === "identifier" && token.text === "array_fields_equal") {
      return this.parseArrayFieldsEqualCall();
    }
    if (token.kind === "identifier" && token.text === "array_unique_field") {
      return this.parseArrayUniqueFieldCall();
    }
    if (
      token.kind === "identifier" &&
      ["count", "exists", "first", "none", "one", "select"].includes(token.text)
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

  private parseArrayHasFieldCall(): ArrayHasFieldNode {
    const functionToken = this.take("identifier", "Expected 'array_has_field'");
    this.take("left-parenthesis", "Expected '(' after 'array_has_field'");
    const array = this.parseOr();
    if (!["array", "unknown"].includes(array.valueType)) {
      throw new ExpressionFailure(
        "expression-type",
        `array_has_field requires an array operand, received ${array.valueType}`,
        array.span,
      );
    }
    this.take("comma", "Expected ',' after array operand");
    const fieldToken = this.take("string", "Expected an object field name string");
    this.take("comma", "Expected ',' after object field name");
    const expected = this.parseOr();
    const closing = this.take("right-parenthesis", "Expected ')' after array_has_field");
    return {
      kind: "array-has-field",
      array,
      field: String(fieldToken.value),
      expected,
      valueType: "boolean",
      span: { start: functionToken.span.start, end: closing.span.end },
    };
  }

  private parseArrayFieldsEqualCall(): ArrayFieldsEqualNode {
    const functionToken = this.take("identifier", "Expected 'array_fields_equal'");
    this.take("left-parenthesis", "Expected '(' after 'array_fields_equal'");
    const left = this.parseOr();
    this.take("comma", "Expected ',' after first array operand");
    const right = this.parseOr();
    for (const operand of [left, right]) {
      if (!["array", "unknown"].includes(operand.valueType)) {
        throw new ExpressionFailure(
          "expression-type",
          `array_fields_equal requires array operands, received ${operand.valueType}`,
          operand.span,
        );
      }
    }
    this.take("comma", "Expected ',' before object field names");
    const fields = this.parseArray();
    if (fields.elements.length === 0 || fields.elements.some((element) =>
      element.kind !== "literal" || typeof element.value !== "string"
    )) {
      throw new ExpressionFailure(
        "expression-type",
        "array_fields_equal requires a nonempty literal array of object field name strings",
        fields.span,
      );
    }
    const closing = this.take("right-parenthesis", "Expected ')' after array_fields_equal");
    return {
      kind: "array-fields-equal", left, right,
      fields: fields.elements.map((element) => String((element as LiteralNode).value)),
      valueType: "boolean",
      span: { start: functionToken.span.start, end: closing.span.end },
    };
  }

  private parseArrayUniqueFieldCall(): ArrayUniqueFieldNode {
    const functionToken = this.take("identifier", "Expected 'array_unique_field'");
    this.take("left-parenthesis", "Expected '(' after 'array_unique_field'");
    const array = this.parseOr();
    if (!["array", "unknown"].includes(array.valueType)) {
      throw new ExpressionFailure(
        "expression-type",
        `array_unique_field requires an array operand, received ${array.valueType}`,
        array.span,
      );
    }
    this.take("comma", "Expected ',' after array operand");
    const field = this.take("string", "Expected an object field name string");
    const closing = this.take("right-parenthesis", "Expected ')' after array_unique_field");
    return {
      kind: "array-unique-field", array, field: String(field.value),
      valueType: "boolean",
      span: { start: functionToken.span.start, end: closing.span.end },
    };
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
      count: "integer",
      exists: "boolean",
      first: "entity",
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
      ...(["first", "one", "select"].includes(operation) && typeof definition.result_kind === "string"
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
        !valueTypeCompatible(argument.valueType, expectedType) ||
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
    if (type === "integer") return "integer";
    if (type === "number") return "number";
    if (["array", "boolean", "null", "object", "string"].includes(String(type))) {
      return type as ValueType;
    }
    return "unknown";
  }

  private scalarType(type: string): ValueType {
    return type === "integer"
      ? "integer"
      : type === "number"
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
    const kind = node.domainKind ?? displayedValueType(node.valueType);
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
          ? Number.isInteger(token.value) ? "integer" : "number"
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
    const valueType = binding.paths?.[path] ??
      (path.startsWith("payload.") && !binding.strictPayloadPaths
        ? "unknown"
        : undefined);
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
        ![...elementTypes].some((elementType) =>
          valueTypeCompatible(left.valueType, elementType) ||
          valueTypeCompatible(elementType, left.valueType)
        )
      ) {
        throw new ExpressionFailure(
          "expression-type",
          `Cannot test ${displayedValueType(left.valueType)} membership in array of ${[...elementTypes].map(displayedValueType).join(" or ")}`,
          operatorSpan,
        );
      }
      return;
    }
    if (["gt", "gte", "lt", "lte"].includes(operator)) {
      if (!numericValueType(left.valueType) || !numericValueType(right.valueType)) {
        throw new ExpressionFailure(
          "expression-type",
          `Operator '${this.source.slice(operatorSpan.start.offset, operatorSpan.end.offset)}' requires number operands, received ${displayedValueType(left.valueType)} and ${displayedValueType(right.valueType)}`,
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
      !valueTypeCompatible(left.valueType, right.valueType) &&
      !valueTypeCompatible(right.valueType, left.valueType)
    ) {
      throw new ExpressionFailure(
        "expression-type",
        `Cannot compare ${displayedValueType(left.valueType)} with ${displayedValueType(right.valueType)}`,
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
  "identity.revision": "integer",
  "storage.editable": "boolean",
  "storage.frozen": "boolean",
  "integrity.parseable": "boolean",
  "integrity.schema_valid": "boolean",
  "integrity.identity_valid": "boolean",
  "integrity.references_valid": "boolean",
  "integrity.hash_valid": "boolean",
  "integrity.transaction_valid": "boolean",
  "provenance.process_ref": "string",
};

const scalarParameterValueTypes: Record<string, ValueType> = {
  boolean: "boolean",
  integer: "integer",
  number: "number",
  string: "string",
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

function policyParameterBinding(
  parameter: Record<string, unknown>,
  catalogs: ExpressionDefinitionCatalogs,
): Binding {
  const kind = String(parameter.kind);
  if (kind === "scalar") {
    return {
      valueType:
        scalarParameterValueTypes[String(parameter.scalar_type)] ?? "unknown",
    };
  }
  if (kind === "process") {
    return structuredClone(baseBindings[kind]!);
  }
  const lifecycleTypes = Array.isArray(parameter.types)
    ? parameter.types.filter((item): item is string => typeof item === "string")
    : undefined;
  return {
    valueType: "entity",
    domainKind: kind,
    ...(lifecycleTypes === undefined ? {} : { lifecycleTypes }),
    paths: {
      ...entityPaths,
      ...lifecyclePayloadPaths(lifecycleTypes, catalogs),
    },
    strictPayloadPaths: lifecycleTypes !== undefined,
  };
}

function definitionBindings(
  definition: VersionedDefinition,
  catalogs: ExpressionDefinitionCatalogs,
): Bindings {
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
    bindings[parameter.name] = policyParameterBinding(parameter, catalogs);
  }
  return bindings;
}

function entityBinding(
  domainKind: string,
  lifecycleTypes?: string[],
): Binding {
  if (domainKind === "process") {
    return structuredClone(baseBindings[domainKind]!);
  }
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
    if (
      value.root.kind === "selector" &&
      ["one", "select"].includes(value.root.operation)
    ) {
      return value.root.domainKind;
    }
    if (value.root.kind === "array" && value.root.elements.length > 0) {
      const kinds = value.root.elements.map((element) => element.domainKind);
      const first = kinds[0];
      return first !== undefined && kinds.every((kind) => kind === first)
        ? first
        : undefined;
    }
    return undefined;
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
  const bindings = definitionBindings(definition, catalogs);
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

function schemaExpressionType(schema: unknown): ValueType {
  if (typeof schema !== "object" || schema === null) return "unknown";
  const definition = schema as Record<string, unknown>;
  const alternatives = Array.isArray(definition.oneOf)
    ? definition.oneOf.map(schemaExpressionType)
    : [];
  if (
    alternatives.length > 0 &&
    alternatives.every((value) => value === alternatives[0])
  ) return alternatives[0]!;
  if (definition.type === "integer") return "integer";
  if (definition.type === "number") return "number";
  if (["array", "boolean", "object", "string"].includes(String(definition.type))) {
    return definition.type as ValueType;
  }
  if (Object.hasOwn(definition, "const")) {
    const value = definition.const;
    if (Number.isInteger(value)) return "integer";
    if (typeof value === "number") return "number";
    if (["boolean", "string"].includes(typeof value)) return typeof value as ValueType;
  }
  const enumValues = Array.isArray(definition.enum) ? definition.enum : [];
  const enumTypes = new Set(enumValues.map((value) =>
    Number.isInteger(value) ? "integer" : typeof value === "number" ? "number" : typeof value
  ));
  return enumTypes.size === 1 &&
      ["boolean", "integer", "number", "string"].includes([...enumTypes][0] ?? "")
    ? [...enumTypes][0] as ValueType
    : "unknown";
}

function schemaPropertyExpressionPaths(
  schema: Record<string, unknown>,
  prefix = "payload",
  parentRequired = true,
): Record<string, ValueType> {
  const alternatives = Array.isArray(schema.oneOf)
    ? schema.oneOf.flatMap((alternative) =>
        typeof alternative === "object" && alternative !== null
          ? [schemaPropertyExpressionPaths(
              alternative as Record<string, unknown>,
              prefix,
              parentRequired,
            )]
          : []
      )
    : [];
  if (alternatives.length > 0) {
    return Object.fromEntries(
      Object.entries(alternatives[0]!).filter(([path, valueType]) =>
        alternatives.every((candidate) => candidate[path] === valueType)
      ),
    );
  }
  const properties = typeof schema.properties === "object" &&
      schema.properties !== null
    ? schema.properties as Record<string, unknown>
    : {};
  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter((name): name is string => typeof name === "string")
      : [],
  );
  return Object.fromEntries(
    Object.entries(properties).flatMap(([name, propertySchema]) => {
      const path = `${prefix}.${name}`;
      const property = typeof propertySchema === "object" &&
          propertySchema !== null
        ? propertySchema as Record<string, unknown>
        : {};
      const schemaType = schemaExpressionType(property);
      const propertyRequired = parentRequired && required.has(name);
      const valueType = propertyRequired ? schemaType : "unknown";
      return [
        [path, valueType] as const,
        ...(schemaType === "object"
          ? Object.entries(
              schemaPropertyExpressionPaths(
                property,
                path,
                propertyRequired,
              ),
            )
          : []),
      ];
    }),
  );
}

function definitionPayloadPaths(
  definition: VersionedDefinition,
  catalogs: ExpressionDefinitionCatalogs,
  visited = new Set<string>(),
): Record<string, ValueType> {
  const key = `${definition.kind}:${definition.id}`;
  if (visited.has(key)) return {};
  const nextVisited = new Set(visited).add(key);
  const parentReference = typeof definition.extends === "string"
    ? /^([a-z][a-z0-9-]*)@/.exec(definition.extends)?.[1]
    : undefined;
  const parent = parentReference ? catalogs.templates[parentReference] : undefined;
  const inherited = parent
    ? definitionPayloadPaths(parent, catalogs, nextVisited)
    : {};
  const payloadSchema = typeof definition.payload_schema === "object" &&
      definition.payload_schema !== null
    ? definition.payload_schema as Record<string, unknown>
    : undefined;
  const authored = payloadSchema
    ? schemaPropertyExpressionPaths(payloadSchema)
    : {};
  return {
    ...inherited,
    ...Object.fromEntries(
      Object.entries(authored).map(([path, valueType]) => [
        path,
        valueType === "unknown" && inherited[path] !== undefined
          ? inherited[path]
          : valueType,
      ]),
    ),
  };
}

function lifecyclePayloadPaths(
  lifecycleTypes: string[] | undefined,
  catalogs: ExpressionDefinitionCatalogs,
): Record<string, ValueType> {
  const paths = (lifecycleTypes ?? []).flatMap((type) => {
    const definition = catalogs.types[type];
    return definition ? [definitionPayloadPaths(definition, catalogs)] : [];
  });
  if (paths.length === 0) return {};
  return Object.fromEntries(
    Object.entries(paths[0]!).filter(([path, valueType]) =>
      paths.every((candidate) => candidate[path] === valueType)
    ),
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
  } else if (definition.kind === "action-definition") {
    compileField(definition, "subjects", `${filePath}#subjects`, baseBindings, catalogs, diagnostics, "array");
    const bindings = { ...baseBindings, subject: entityBinding("revision") };
    compileStringValues(definition.inputs, `${filePath}#inputs`, bindings, catalogs, diagnostics);
    compileField(definition, "when", `${filePath}#when`, bindings, catalogs, diagnostics);
  } else {
    compileRules(
      definition,
      filePath,
      definitionBindings(definition, catalogs),
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

function expressionReferencesBinding(
  node: ExpressionNode,
  binding: string,
): boolean {
  switch (node.kind) {
    case "literal":
      return false;
    case "array-fields-equal":
      return expressionReferencesBinding(node.left, binding) ||
        expressionReferencesBinding(node.right, binding);
    case "array-unique-field":
      return expressionReferencesBinding(node.array, binding);
    case "array-has-field":
      return expressionReferencesBinding(node.array, binding) ||
        expressionReferencesBinding(node.expected, binding);
    case "path":
    case "variable":
      return node.variable === binding;
    case "array":
      return node.elements.some((element) =>
        expressionReferencesBinding(element, binding)
      );
    case "object":
      return Object.values(node.properties).some((property) =>
        expressionReferencesBinding(property, binding)
      );
    case "comparison":
    case "logical":
      return expressionReferencesBinding(node.left, binding) ||
        expressionReferencesBinding(node.right, binding);
    case "not":
    case "present":
      return expressionReferencesBinding(node.operand, binding);
    case "selector":
    case "policy":
      return expressionReferencesBinding(node.arguments, binding);
    case "state":
      return expressionReferencesBinding(node.subject, binding);
    case "every":
      return expressionReferencesBinding(node.arguments, binding) ||
        (node.binding !== binding &&
          expressionReferencesBinding(node.predicate, binding));
  }
}

export function compiledExpressionReferencesBinding(
  expression: CompiledTextExpression,
  binding: string,
): boolean {
  return expressionReferencesBinding(expression.root, binding);
}

function expressionDependencies(node: ExpressionNode): ExpressionDependency[] {
  switch (node.kind) {
    case "literal":
    case "path":
    case "variable":
      return [];
    case "array-fields-equal":
      return [...expressionDependencies(node.left), ...expressionDependencies(node.right)];
    case "array-unique-field":
      return expressionDependencies(node.array);
    case "array-has-field":
      return [
        ...expressionDependencies(node.array),
        ...expressionDependencies(node.expected),
      ];
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

export function findCompiledExpressionBindingReference(
  expression: CompiledTextExpression,
  binding: string,
  catalogs: ExpressionDefinitionCatalogs,
  visited = new Set<string>(),
): CompiledTextExpression | undefined {
  if (
    expressionReferencesBinding(expression.root, binding) &&
    (binding !== "execution" ||
      expression.contract?.bindings[binding]?.domainKind === "execution")
  ) return expression;
  for (const dependency of expressionDependencies(expression.root)) {
    const [kind, id] = dependency.split(":") as [
      "policy" | "selector" | "state",
      string,
    ];
    const referenced = kind === "policy"
      ? catalogs.policies[id]
      : kind === "selector"
      ? catalogs.selectors[id]
      : catalogs.states[id];
    const found = referenced
      ? findDefinitionExpressionBindingReference(
          referenced,
          binding,
          catalogs,
          visited,
        )
      : undefined;
    if (found) return found;
  }
  return undefined;
}

export function findDefinitionExpressionBindingReference(
  definition: VersionedDefinition,
  binding: string,
  catalogs: ExpressionDefinitionCatalogs,
  visited = new Set<string>(),
): CompiledTextExpression | undefined {
  const definitionKey = `${definition.kind}:${definition.id}`;
  if (visited.has(definitionKey)) return undefined;
  // One reachability search only needs to inspect each definition once. Sharing
  // the visited set avoids rewalking every path through a converging Selector
  // graph while still exploring every reachable definition.
  visited.add(definitionKey);
  const expressions: CompiledTextExpression[] = [];
  const visit = (value: unknown): void => {
    if (isCompiledTextExpression(value)) {
      expressions.push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value === "object" && value !== null) {
      Object.values(value).forEach(visit);
    }
  };
  visit(definition);
  for (const expression of expressions) {
    const found = findCompiledExpressionBindingReference(
      expression,
      binding,
      catalogs,
      visited,
    );
    if (found) return found;
  }
  for (const dependency of definitionDependencies(definition)) {
    const [kind, id] = dependency.split(":") as [
      "policy" | "selector" | "state",
      string,
    ];
    const referenced = kind === "policy"
      ? catalogs.policies[id]
      : kind === "selector"
      ? catalogs.selectors[id]
      : catalogs.states[id];
    const found = referenced
      ? findDefinitionExpressionBindingReference(
          referenced,
          binding,
          catalogs,
          visited,
        )
      : undefined;
    if (found) return found;
  }
  return undefined;
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

export interface DirectIdentityEquality {
  left: string;
  right: string;
}

export interface CompiledExpressionPath {
  binding: string;
  segments: string[];
}

export interface CompiledPathEquality {
  left: CompiledExpressionPath;
  right: CompiledExpressionPath;
}

export interface CompiledFinitePathMembership {
  path: CompiledExpressionPath;
  values: string[];
}

export interface CompiledSelectorCall {
  operation: SelectorOperation | "every";
  reference: string;
  emptyArguments: boolean;
}

export interface CompiledSelectorAdmission {
  source: string;
  target: string;
}

export interface CompiledExpressionFacts {
  pathEqualities: CompiledPathEquality[];
  finitePathMemberships: CompiledFinitePathMembership[];
  selectorCalls: CompiledSelectorCall[];
  selectorAdmissions: CompiledSelectorAdmission[];
  opaque: boolean;
}

/**
 * Extract the small structural facts used by package contract compilation.
 * This deliberately recognizes no implication or Boolean equivalence beyond
 * direct nodes and conjunction nesting.
 */
export function compiledExpressionFacts(
  value: unknown,
): CompiledExpressionFacts | undefined {
  if (!isCompiledTextExpression(value)) return undefined;
  const pathEqualities: CompiledPathEquality[] = [];
  const finitePathMemberships: CompiledFinitePathMembership[] = [];
  const selectorCalls: CompiledSelectorCall[] = [];
  const selectorAdmissions: CompiledSelectorAdmission[] = [];
  let opaque = false;
  const asPath = (node: ExpressionNode): CompiledExpressionPath | undefined =>
    node.kind === "path"
      ? { binding: node.variable, segments: [...node.segments] }
      : undefined;
  const literalStrings = (node: ExpressionNode): string[] | undefined => {
    if (node.kind !== "array") return undefined;
    const values = node.elements.map((element) =>
      element.kind === "literal" && typeof element.value === "string"
        ? element.value
        : undefined
    );
    return values.every((item): item is string => item !== undefined)
      ? values
      : undefined;
  };
  const hasAdmission = (
    node: ExpressionNode,
    candidateBinding: string,
  ): string | undefined => {
    if (node.kind === "logical" && node.operator === "and") {
      return hasAdmission(node.left, candidateBinding) ??
        hasAdmission(node.right, candidateBinding);
    }
    if (node.kind !== "not" || node.operand.kind !== "every") return undefined;
    const admitted = node.operand;
    const predicate = admitted.predicate;
    if (predicate.kind !== "comparison" || predicate.operator !== "ne") {
      return undefined;
    }
    const leftIsAdmission = predicate.left.kind === "variable" &&
      predicate.left.variable === admitted.binding &&
      predicate.right.kind === "variable" &&
      predicate.right.variable === candidateBinding;
    const rightIsAdmission = predicate.right.kind === "variable" &&
      predicate.right.variable === admitted.binding &&
      predicate.left.kind === "variable" &&
      predicate.left.variable === candidateBinding;
    return leftIsAdmission || rightIsAdmission ? admitted.reference : undefined;
  };
  const visit = (node: ExpressionNode): void => {
    if (node.kind === "comparison") {
      if (node.operator === "eq") {
        const left = asPath(node.left);
        const right = asPath(node.right);
        if (left && right) pathEqualities.push({ left, right });
      } else if (node.operator === "in") {
        const path = asPath(node.left);
        const values = literalStrings(node.right);
        if (path && values) finitePathMemberships.push({ path, values });
      }
      visit(node.left);
      visit(node.right);
      return;
    }
    if (node.kind === "logical") {
      if (node.operator === "and") {
        visit(node.left);
        visit(node.right);
      }
      return;
    }
    if (node.kind === "not") return;
    if (node.kind === "present") return;
    if (node.kind === "array-fields-equal") {
      visit(node.left);
      visit(node.right);
      return;
    }
    if (node.kind === "array-unique-field") {
      visit(node.array);
      return;
    }
    if (node.kind === "array-has-field") {
      visit(node.array);
      visit(node.expected);
      return;
    }
    if (node.kind === "array") {
      node.elements.forEach(visit);
      return;
    }
    if (node.kind === "object") {
      Object.values(node.properties).forEach(visit);
      return;
    }
    if (node.kind === "selector") {
      selectorCalls.push({
        operation: node.operation,
        reference: node.reference,
        emptyArguments: node.arguments.kind === "object" &&
          Object.keys(node.arguments.properties).length === 0,
      });
      visit(node.arguments);
      return;
    }
    if (node.kind === "every") {
      selectorCalls.push({
        operation: "every",
        reference: node.reference,
        emptyArguments: node.arguments.kind === "object" &&
          Object.keys(node.arguments.properties).length === 0,
      });
      const target = hasAdmission(node.predicate, node.binding);
      if (target) selectorAdmissions.push({ source: node.reference, target });
      visit(node.arguments);
      visit(node.predicate);
      return;
    }
    if (node.kind === "policy") {
      opaque = true;
      visit(node.arguments);
      return;
    }
    if (node.kind === "state") visit(node.subject);
  };
  visit(value.root);
  return {
    pathEqualities,
    finitePathMemberships,
    selectorCalls,
    selectorAdmissions,
    opaque,
  };
}

export function directIdentityEqualities(
  value: unknown,
): DirectIdentityEquality[] {
  return compiledExpressionFacts(value)?.pathEqualities.flatMap((equality) => {
    const identityBinding = (path: CompiledExpressionPath) =>
      path.segments.length === 2 &&
        path.segments[0] === "identity" &&
        path.segments[1] === "id"
        ? path.binding
        : undefined;
    const left = identityBinding(equality.left);
    const right = identityBinding(equality.right);
    return left && right ? [{ left, right }] : [];
  }) ?? [];
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
    case "array-fields-equal": {
      const left = evaluateNode(node.left, context, host);
      const right = evaluateNode(node.right, context, host);
      return Array.isArray(left) && Array.isArray(right) &&
        left.length === right.length && left.every((item, index) => {
          const other = right[index];
          return typeof item === "object" && item !== null && !Array.isArray(item) &&
            typeof other === "object" && other !== null && !Array.isArray(other) &&
            node.fields.every((field) => Object.hasOwn(item, field) &&
              Object.hasOwn(other, field) && expressionValuesEqual(item[field], other[field]));
        });
    }
    case "array-unique-field": {
      const array = evaluateNode(node.array, context, host);
      if (!Array.isArray(array)) return false;
      const values: unknown[] = [];
      for (const item of array) {
        if (typeof item !== "object" || item === null || Array.isArray(item) ||
          !Object.hasOwn(item, node.field)) return false;
        const value = item[node.field];
        if (values.some((previous) => expressionValuesEqual(previous, value))) return false;
        values.push(value);
      }
      return true;
    }
    case "array-has-field": {
      const array = evaluateNode(node.array, context, host);
      const expected = evaluateNode(node.expected, context, host);
      return Array.isArray(array) && array.some((item) =>
        typeof item === "object" && item !== null &&
        Object.hasOwn(item, node.field) &&
        expressionValuesEqual((item as Record<string, unknown>)[node.field], expected)
      );
    }
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
        case "first": return results[0];
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

export function compileExpressionValue(source: string, catalogs: ExpressionDefinitionCatalogs, bindings: Record<string, "entity" | "array" | "string" | "boolean"> = {}): { expression?: CompiledTextExpression; diagnostics: ProcessDiagnostic[] } {
  const diagnostics: ProcessDiagnostic[] = [];
  const holder: Record<string, unknown> = { value: source };
  const context: Bindings = { ...baseBindings };
  for (const [name, valueType] of Object.entries(bindings)) context[name] = valueType === "entity" ? entityBinding("revision") : { valueType };
  const expression = compileField(holder, "value", "expression#value", context, catalogs, diagnostics);
  return { ...(expression ? { expression } : {}), diagnostics };
}
