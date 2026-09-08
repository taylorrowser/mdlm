import { describe, expect, it } from "vitest";
import { compileDefinitionExpressions, isCompiledTextExpression, evaluateCompiledTextExpression } from "../src/expression.js";

describe("bounded array predicates", () => {
  function compile(source: string) {
    const rule: Record<string, unknown> = { when: source };
    const diagnostics = compileDefinitionExpressions(
      { kind: "policy-definition", id: "case-shape", version: 1, rules: [rule] },
      "case-shape.yaml",
      { templates: {}, types: {}, selectors: {}, states: {}, policies: {}, scenarios: {} },
    );
    return { diagnostics, expression: rule.when };
  }

  it("requires unique own IDs and an exact ordered case/input capture", () => {
    const expected = [{ id: "A", stdin: "a", stdout: "1" }, { id: "B", stdin: "b", stdout: "2" }];
    const changedOutput = expected.map((row) => ({ ...row, stdout: "wrong" }));
    const cases: Array<[string, boolean]> = [
      [`array_unique_field(${JSON.stringify(expected)}, "id")`, true],
      [`array_unique_field(${JSON.stringify([expected[0], { ...expected[1], id: "A" }])}, "id")`, false],
      ['array_unique_field([{}], "id")', false],
      ['array_unique_field([{}], "__proto__")', false],
      ['array_unique_field([{"id":{"a":1,"b":2}},{"id":{"b":2,"a":1}}], "id")', false],
      ...[
        [changedOutput, true],
        [expected.slice(0, 1), false],
        [[...expected, expected[0]], false],
        [[...expected].reverse(), false],
        [[{ ...expected[0], id: "C" }, expected[1]], false],
        [[{ ...expected[0], stdin: "changed" }, expected[1]], false],
        [[{ id: "A" }, expected[1]], false],
      ].map(([actual, accepted]): [string, boolean] => [
        `array_fields_equal(${JSON.stringify(expected)}, ${JSON.stringify(actual)}, ["id", "stdin"])`,
        accepted as boolean,
      ]),
    ];
    for (const [source, accepted] of cases) {
      const { diagnostics, expression } = compile(source);
      expect(diagnostics, source).toEqual([]);
      expect(isCompiledTextExpression(expression), source).toBe(true);
      if (!isCompiledTextExpression(expression)) continue;
      expect(evaluateCompiledTextExpression(expression, {}, {
        select: () => [], policy: () => undefined, state: () => undefined,
      }), source).toBe(accepted);
    }
  });

  it("rejects malformed bounded array predicate arguments during compilation", () => {
    for (const source of [
      'array_unique_field(1, "id")',
      'array_unique_field([], 1)',
      'array_fields_equal([], 1, ["id"])',
      'array_fields_equal([], [], [])',
      'array_fields_equal([], [], [1])',
    ]) {
      expect(compile(source).diagnostics, source).not.toEqual([]);
    }
  });
});
