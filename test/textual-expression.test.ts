import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  evaluateLifecycle,
  loadProcessPackage,
  type LifecycleRecord,
} from "../src/index.js";

async function processPackageWithTextualProcessDrift(
  expression = "subject.provenance.process_ref != process.current_ref",
): Promise<string> {
  const temporaryRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "mdlm-text-expression-"),
  );
  const processRoot = path.join(temporaryRoot, "process");
  await fs.cp(path.join(process.cwd(), ".lifecycle/process"), processRoot, {
    recursive: true,
  });

  const statePath = path.join(
    processRoot,
    "states/relationship-overlays.yaml",
  );
  const state = await fs.readFile(statePath, "utf8");
  await fs.writeFile(
    statePath,
    state.replace(
      "    when: 'subject.provenance.process_ref != process.current_ref'",
      `    when: '${expression}'`,
    ),
  );

  return processRoot;
}

async function processPackageWithStateCycle(): Promise<string> {
  const processRoot = await processPackageWithTextualProcessDrift(
    'state(subject, "validity") == "valid"',
  );
  const validityPath = path.join(processRoot, "states/validity.yaml");
  const validity = await fs.readFile(validityPath, "utf8");
  await fs.writeFile(
    validityPath,
    validity.replace(
      "    when: 'policy(\"dependency-reassessment@1\", {subject: subject}).required == true'",
      "    when: 'state(subject, \"relationship-overlays\") == []'",
    ),
  );
  return processRoot;
}

async function processPackageWithStatePolicyCycle(): Promise<string> {
  const processRoot = await processPackageWithTextualProcessDrift(
    'policy("review-applicability@1", {subject: subject}).required == true',
  );
  const policyPath = path.join(
    processRoot,
    "policies/review-applicability.yaml",
  );
  const policy = await fs.readFile(policyPath, "utf8");
  await fs.writeFile(
    policyPath,
    policy.replace(
      "    when: 'subject.identity.type in [\"MAP\", \"PSP\", \"STK\", \"SYS\", \"VSP\", \"ENV\"]'",
      "    when: 'state(subject, \"relationship-overlays\") == []'",
    ),
  );
  return processRoot;
}

function pspCreatedUnder(processRef: string): LifecycleRecord {
  return {
    datum: {
      id: "PSP-7K3M9Q2D8F",
      revision: 1,
      revision_id: "PSP-7K3M9Q2D8F-r00001",
      type: "PSP",
      payload: {
        title: "Lifecycle manager",
        rationale: "Preserve lifecycle intent.",
        problem: "Lifecycle intent is lost between sessions.",
        users: ["product owner"],
        goals: ["preserve intent"],
        non_goals: [],
        success_measures: ["traceable intent"],
      },
      links: [],
      created_by: { process_ref: processRef },
      body: "",
    },
    storage: { editable: true, frozen: false },
    integrity: {
      parseable: true,
      schema_valid: true,
      identity_valid: true,
      references_valid: true,
      hash_valid: true,
    },
  };
}

describe("textual MDLM expressions", () => {
  it("loads and evaluates a textual comparison from a Process Package", async () => {
    const processRoot = await processPackageWithTextualProcessDrift();

    const loaded = await loadProcessPackage(processRoot);

    expect(
      loaded.ok,
      loaded.diagnostics.map((diagnostic) => diagnostic.message).join("\n"),
    ).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.package.manifest.language).toEqual({
      expressions: "mdlm-expression@1",
    });

    const evaluation = evaluateLifecycle(loaded.package, {
      processRef: "git:current",
      phaseId: "phase-0-wayfinding",
      records: [pspCreatedUnder("git:older-process")],
      dependencyComparisons: [],
    });

    expect(evaluation.diagnostics).toEqual([]);
    expect(
      evaluation.artifacts["PSP-7K3M9Q2D8F-r00001"]?.states[
        "relationship-overlays"
      ],
    ).toEqual(["process-drift"]);
  });

  it("evaluates typed entity paths, scalar literals, and bound variables", async () => {
    const pathPackage = await loadProcessPackage(
      await processPackageWithTextualProcessDrift(
        'subject.identity.type == "PSP"',
      ),
    );
    const variablePackage = await loadProcessPackage(
      await processPackageWithTextualProcessDrift("subject == subject"),
    );

    expect(pathPackage.ok).toBe(true);
    expect(variablePackage.ok).toBe(true);
    if (!pathPackage.ok || !variablePackage.ok) return;

    for (const processPackage of [pathPackage.package, variablePackage.package]) {
      const evaluation = evaluateLifecycle(processPackage, {
        processRef: "git:current",
        phaseId: "phase-0-wayfinding",
        records: [pspCreatedUnder("git:current")],
        dependencyComparisons: [],
      });

      expect(evaluation.diagnostics).toEqual([]);
      expect(
        evaluation.artifacts["PSP-7K3M9Q2D8F-r00001"]?.states[
          "relationship-overlays"
        ],
      ).toEqual(["process-drift"]);
    }
  });

  it("evaluates conjunction, disjunction, negation, presence, and parentheses", async () => {
    const processRoot = await processPackageWithTextualProcessDrift(
      "!(subject.integrity.parseable == true) && (present(subject.identity.id) || false) && !present(subject.payload.optional)",
    );

    const loaded = await loadProcessPackage(processRoot);

    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const record = pspCreatedUnder("git:current");
    record.integrity.parseable = false;
    const evaluation = evaluateLifecycle(loaded.package, {
      processRef: "git:current",
      phaseId: "phase-0-wayfinding",
      records: [record],
      dependencyComparisons: [],
    });

    expect(evaluation.diagnostics).toEqual([]);
    expect(
      evaluation.artifacts["PSP-7K3M9Q2D8F-r00001"]?.states[
        "relationship-overlays"
      ],
    ).toEqual(["process-drift"]);
  });

  it("types and evaluates every JSON-like literal", async () => {
    const processRoot = await processPackageWithTextualProcessDrift(
      'subject.identity.type in ["PSP", "STK"] && 7 > 3 && true != false && null == null && present(null) && {"ok": true, "count": 2} == {"ok": true, "count": 2}',
    );

    const loaded = await loadProcessPackage(processRoot);

    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const evaluation = evaluateLifecycle(loaded.package, {
      processRef: "git:current",
      phaseId: "phase-0-wayfinding",
      records: [pspCreatedUnder("git:current")],
      dependencyComparisons: [],
    });

    expect(evaluation.diagnostics).toEqual([]);
    expect(
      evaluation.artifacts["PSP-7K3M9Q2D8F-r00001"]?.states[
        "relationship-overlays"
      ],
    ).toEqual(["process-drift"]);
  });

  it("resolves Selector selection and cardinality operations", async () => {
    const selector = '"newer-revisions-for@1", {subject: subject}';
    const processRoot = await processPackageWithTextualProcessDrift(
      `select(${selector}) == [] && none(${selector}) && count(${selector}) == 0 && !exists(${selector}) && !present(one(${selector})) && present(one("review-required-revisions@1", {}))`,
    );

    const loaded = await loadProcessPackage(processRoot);

    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const evaluation = evaluateLifecycle(loaded.package, {
      processRef: "git:current",
      phaseId: "phase-0-wayfinding",
      records: [pspCreatedUnder("git:current")],
      dependencyComparisons: [],
    });

    expect(evaluation.diagnostics).toEqual([]);
    expect(
      evaluation.artifacts["PSP-7K3M9Q2D8F-r00001"]?.states[
        "relationship-overlays"
      ],
    ).toEqual(["process-drift"]);
  });

  it("evaluates a typed predicate for every finite Selector result", async () => {
    const processRoot = await processPackageWithTextualProcessDrift(
      'every("review-required-revisions@1", {}, member => state(member, "validity") == "valid")',
    );

    const loaded = await loadProcessPackage(processRoot);

    expect(
      loaded.ok,
      loaded.diagnostics.map((diagnostic) => diagnostic.message).join("\n"),
    ).toBe(true);
    if (!loaded.ok) return;
    const evaluation = evaluateLifecycle(loaded.package, {
      processRef: "git:current",
      phaseId: "phase-0-wayfinding",
      records: [pspCreatedUnder("git:current")],
      dependencyComparisons: [],
    });

    expect(evaluation.diagnostics).toEqual([]);
    expect(
      evaluation.artifacts["PSP-7K3M9Q2D8F-r00001"]?.states[
        "relationship-overlays"
      ],
    ).toEqual(["process-drift"]);

    const invalid = pspCreatedUnder("git:current");
    invalid.datum.id = "STK-X4N7AB2W6J";
    invalid.datum.revision_id = "STK-X4N7AB2W6J-r00001";
    invalid.datum.type = "STK";
    invalid.integrity.schema_valid = false;
    const failedPredicate = evaluateLifecycle(loaded.package, {
      processRef: "git:current",
      phaseId: "phase-0-wayfinding",
      records: [pspCreatedUnder("git:current"), invalid],
      dependencyComparisons: [],
    });

    expect(
      failedPredicate.artifacts["PSP-7K3M9Q2D8F-r00001"]?.states[
        "relationship-overlays"
      ],
    ).toEqual([]);
  });

  it("checks universal predicate bindings and Boolean return types at package load", async () => {
    const sources = {
      unknown:
        'every("review-required-revisions@1", {}, member => candidate == member)',
      kind:
        'every("dependency-changes-for@1", {subject: subject}, change => state(change, "validity") == "valid")',
      result:
        'every("review-required-revisions@1", {}, member => member.identity.type)',
    };
    const [unknown, kind, result] = await Promise.all(
      Object.values(sources).map(async (source) =>
        loadProcessPackage(
          await processPackageWithTextualProcessDrift(source),
        ),
      ),
    );

    expect(unknown?.ok).toBe(false);
    expect(unknown?.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "expression-unknown-binding",
          source: sources.unknown,
          message: "Unknown expression binding 'candidate'",
        }),
      ]),
    );
    expect(kind?.ok).toBe(false);
    expect(kind?.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "expression-state-subject",
          source: sources.kind,
          message:
            "Computed State subject must be a revision, received record",
        }),
      ]),
    );
    expect(result?.ok).toBe(false);
    expect(result?.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "expression-predicate-type",
          source: sources.result,
          message:
            "Universal predicate must return boolean, received string",
        }),
      ]),
    );
  });

  it("reads a typed Computed State value", async () => {
    const processRoot = await processPackageWithTextualProcessDrift(
      'state(subject, "validity") == "valid"',
    );

    const loaded = await loadProcessPackage(processRoot);

    expect(
      loaded.ok,
      loaded.diagnostics.map((diagnostic) => diagnostic.message).join("\n"),
    ).toBe(true);
    if (!loaded.ok) return;
    const evaluation = evaluateLifecycle(loaded.package, {
      processRef: "git:current",
      phaseId: "phase-0-wayfinding",
      records: [pspCreatedUnder("git:current")],
      dependencyComparisons: [],
    });

    expect(evaluation.diagnostics).toEqual([]);
    expect(
      evaluation.artifacts["PSP-7K3M9Q2D8F-r00001"]?.states[
        "relationship-overlays"
      ],
    ).toEqual(["process-drift"]);
  });

  it("reads a typed Policy result field", async () => {
    const processRoot = await processPackageWithTextualProcessDrift(
      'policy("review-applicability@1", {subject: subject}).required == true && policy("waiver-applicability@1", {obligation: "review-context-required@2", subject: subject, waiver: subject}).permitted == false',
    );

    const loaded = await loadProcessPackage(processRoot);

    expect(
      loaded.ok,
      loaded.diagnostics.map((diagnostic) => diagnostic.message).join("\n"),
    ).toBe(true);
    if (!loaded.ok) return;
    const evaluation = evaluateLifecycle(loaded.package, {
      processRef: "git:current",
      phaseId: "phase-0-wayfinding",
      records: [pspCreatedUnder("git:current")],
      dependencyComparisons: [],
    });

    expect(evaluation.diagnostics).toEqual([]);
    expect(
      evaluation.artifacts["PSP-7K3M9Q2D8F-r00001"]?.states[
        "relationship-overlays"
      ],
    ).toEqual(["process-drift"]);
  });

  it("rejects Computed State and Policy dependency cycles before evaluation", async () => {
    const [stateCycle, policyCycle] = await Promise.all([
      loadProcessPackage(await processPackageWithStateCycle()),
      loadProcessPackage(await processPackageWithStatePolicyCycle()),
    ]);

    expect(stateCycle.ok).toBe(false);
    expect(stateCycle.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "expression-dependency-cycle",
          message:
            "Expression dependency cycle: Computed State 'relationship-overlays' -> Computed State 'validity' -> Computed State 'relationship-overlays'",
        }),
      ]),
    );
    expect(policyCycle.ok).toBe(false);
    expect(policyCycle.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "expression-dependency-cycle",
          message:
            "Expression dependency cycle: Computed State 'relationship-overlays' -> Policy 'review-applicability@1' -> Computed State 'relationship-overlays'",
        }),
      ]),
    );
  });

  it("rejects invalid Policy references, arguments, result fields, and result types", async () => {
    const sources = {
      unknown: 'policy("missing@1", {subject: subject}).required == true',
      missing: 'policy("review-applicability@1", {}).required == true',
      kind: 'policy("review-applicability@1", {subject: process}).required == true',
      cardinality:
        'policy("review-applicability@1", {subject: select("review-required-revisions@1", {})}).required == true',
      scalar:
        'policy("waiver-applicability@1", {obligation: 7, subject: subject, waiver: subject}).permitted == false',
      field: 'policy("review-applicability@1", {subject: subject}).missing == true',
      type: 'policy("review-applicability@1", {subject: subject}).required == "yes"',
    };
    const results = await Promise.all(
      Object.values(sources).map(async (source) =>
        loadProcessPackage(
          await processPackageWithTextualProcessDrift(source),
        ),
      ),
    );

    for (const result of results) expect(result.ok).toBe(false);
    expect(results[0]?.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "expression-unknown-policy",
          source: sources.unknown,
          message: "Unknown Policy 'missing@1'",
        }),
      ]),
    );
    expect(results[1]?.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "expression-policy-arguments",
          source: sources.missing,
          message:
            "Policy 'review-applicability@1' requires argument 'subject'",
        }),
      ]),
    );
    expect(results[2]?.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "expression-policy-arguments",
          source: sources.kind,
          message:
            "Policy argument 'subject' requires revision, received process",
        }),
      ]),
    );
    expect(results[3]?.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "expression-policy-arguments",
          source: sources.cardinality,
          message:
            "Policy argument 'subject' requires revision, received selection",
        }),
      ]),
    );
    expect(results[4]?.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "expression-policy-arguments",
          source: sources.scalar,
          message:
            "Policy argument 'obligation' requires string, received number",
        }),
      ]),
    );
    expect(results[5]?.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "expression-policy-result",
          source: sources.field,
          message:
            "Policy 'review-applicability@1' has no result field 'missing'",
        }),
      ]),
    );
    expect(results[6]?.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "expression-type",
          source: sources.type,
          message: "Cannot compare boolean with string",
        }),
      ]),
    );
  });

  it("rejects unknown Computed State dimensions and invalid subjects", async () => {
    const unknownSource = 'state(subject, "missing") == "valid"';
    const subjectSource = 'state(process, "validity") == "valid"';
    const [unknown, subject] = await Promise.all([
      loadProcessPackage(
        await processPackageWithTextualProcessDrift(unknownSource),
      ),
      loadProcessPackage(
        await processPackageWithTextualProcessDrift(subjectSource),
      ),
    ]);

    expect(unknown.ok).toBe(false);
    expect(unknown.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "expression-unknown-state",
          source: unknownSource,
          line: 1,
          column: 16,
          message: "Unknown Computed State dimension 'missing'",
        }),
      ]),
    );
    expect(subject.ok).toBe(false);
    expect(subject.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "expression-state-subject",
          source: subjectSource,
          line: 1,
          column: 7,
          message: "Computed State subject must be a revision, received process",
        }),
      ]),
    );
  });

  it("rejects unknown Selectors and invalid named arguments at package load", async () => {
    const sources = {
      unknown: 'exists("missing-selector@1", {})',
      missing: 'exists("newer-revisions-for@1", {})',
      kind: 'none("candidate-members-missing-review@1", {candidate: subject})',
      cardinality:
        'exists("newer-revisions-for@1", {subject: select("candidate-baselines@1", {})})',
      types:
        'none("blocked-targets-for-question@1", {question: one("review-required-revisions@1", {})})',
      extra:
        'exists("newer-revisions-for@1", {subject: subject, surprise: true})',
    };

    const results = await Promise.all(
      Object.values(sources).map(async (source) =>
        loadProcessPackage(
          await processPackageWithTextualProcessDrift(source),
        ),
      ),
    );
    const unknown = results[0]!;
    const missing = results[1]!;
    const kind = results[2]!;
    const cardinality = results[3]!;
    const types = results[4]!;
    const extra = results[5]!;

    for (const result of results) {
      expect(result.ok).toBe(false);
      expect(result.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            line: 1,
            column: expect.any(Number),
          }),
        ]),
      );
    }
    expect(unknown.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "expression-unknown-selector",
          source: sources.unknown,
          message: "Unknown Selector 'missing-selector@1'",
        }),
      ]),
    );
    expect(missing.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "expression-selector-arguments",
          source: sources.missing,
          message:
            "Selector 'newer-revisions-for@1' requires argument 'subject'",
        }),
      ]),
    );
    expect(kind.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "expression-selector-arguments",
          source: sources.kind,
          message:
            "Selector argument 'candidate' requires baseline of type BSL, received revision",
        }),
      ]),
    );
    expect(cardinality.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "expression-selector-arguments",
          source: sources.cardinality,
          message: "Selector argument 'subject' requires revision, received selection",
        }),
      ]),
    );
    expect(types.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "expression-selector-arguments",
          source: sources.types,
          message:
            "Selector argument 'question' requires revision of type QST, received revision of types BSL, DEC, ENV, MAP, PSP, STK, SYS, VAI, VER, VSP",
        }),
      ]),
    );
    expect(extra.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "expression-selector-arguments",
          source: sources.extra,
          message:
            "Selector 'newer-revisions-for@1' has no argument 'surprise'",
        }),
      ]),
    );
  });

  it("preserves lifecycle behavior for migrated state and Policy rules", async () => {
    const loaded = await loadProcessPackage(
      path.join(process.cwd(), ".lifecycle/process"),
    );

    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const invalidRecord = pspCreatedUnder("git:current");
    invalidRecord.integrity.schema_valid = false;
    const invalidEvaluation = evaluateLifecycle(loaded.package, {
      processRef: "git:current",
      phaseId: "phase-0-wayfinding",
      records: [invalidRecord],
      dependencyComparisons: [],
    });
    const validEvaluation = evaluateLifecycle(loaded.package, {
      processRef: "git:current",
      phaseId: "phase-0-wayfinding",
      records: [pspCreatedUnder("git:current")],
      dependencyComparisons: [],
    });

    expect(invalidEvaluation.diagnostics).toEqual([]);
    expect(
      invalidEvaluation.artifacts["PSP-7K3M9Q2D8F-r00001"]?.states.validity,
    ).toBe("invalid");
    expect(
      validEvaluation.obligations.some(
        (obligation) =>
          obligation.obligation === "review-context-required" &&
          obligation.subject === "PSP-7K3M9Q2D8F-r00001",
      ),
    ).toBe(true);
  });

  it("locates Boolean operator and rule result-type errors", async () => {
    const operatorSource = "subject.identity.type && true";
    const membershipSource = 'subject.identity.type in {"PSP": true}';
    const resultSource = "subject.identity.type";

    const [operatorPackage, membershipPackage, resultPackage] = await Promise.all([
      loadProcessPackage(
        await processPackageWithTextualProcessDrift(operatorSource),
      ),
      loadProcessPackage(
        await processPackageWithTextualProcessDrift(membershipSource),
      ),
      loadProcessPackage(
        await processPackageWithTextualProcessDrift(resultSource),
      ),
    ]);

    expect(operatorPackage.ok).toBe(false);
    expect(operatorPackage.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "expression-type",
          line: 1,
          column: 23,
          source: operatorSource,
          message: "Operator '&&' requires boolean operands, received string",
        }),
      ]),
    );
    expect(membershipPackage.ok).toBe(false);
    expect(membershipPackage.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "expression-type",
          line: 1,
          column: 23,
          source: membershipSource,
          message: "Operator 'in' requires an array on the right, received object",
        }),
      ]),
    );
    expect(resultPackage.ok).toBe(false);
    expect(resultPackage.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "expression-result-type",
          line: 1,
          column: 1,
          source: resultSource,
          message: "Rule condition must return boolean, received string",
        }),
      ]),
    );
  });

  it("rejects invalid syntax at package load with its source location", async () => {
    const source = "subject.provenance.process_ref ? process.current_ref";

    const loaded = await loadProcessPackage(
      await processPackageWithTextualProcessDrift(source),
    );

    expect(loaded.ok).toBe(false);
    expect(loaded.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "expression-syntax",
          path: expect.stringContaining(
            "relationship-overlays.yaml#rules[2].when",
          ),
          line: 1,
          column: 32,
          source,
          message: "Unexpected character '?'",
        }),
      ]),
    );
  });

  it("rejects an unknown expression binding at package load", async () => {
    const source =
      "candidate.provenance.process_ref != process.current_ref";

    const loaded = await loadProcessPackage(
      await processPackageWithTextualProcessDrift(source),
    );

    expect(loaded.ok).toBe(false);
    expect(loaded.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "expression-unknown-binding",
          line: 1,
          column: 1,
          source,
          message: "Unknown expression binding 'candidate'",
        }),
      ]),
    );
  });

  it("rejects incompatible comparison operands at package load", async () => {
    const source = "subject.provenance.process_ref != 42";

    const loaded = await loadProcessPackage(
      await processPackageWithTextualProcessDrift(source),
    );

    expect(loaded.ok).toBe(false);
    expect(loaded.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "expression-type",
          line: 1,
          column: 32,
          source,
          message: "Cannot compare string with number",
        }),
      ]),
    );
  });
});
