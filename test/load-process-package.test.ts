import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadProcessPackage } from "../src/index.js";

async function copiedProcessPackage(): Promise<string> {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-process-"));
  const processRoot = path.join(temporaryRoot, "process");
  await fs.cp(path.join(process.cwd(), ".lifecycle/process"), processRoot, {
    recursive: true,
  });
  return processRoot;
}

describe("loadProcessPackage", () => {
  it("loads and validates the bootstrap process package", async () => {
    const result = await loadProcessPackage(
      path.join(process.cwd(), ".lifecycle/process"),
    );

    expect(result.ok, result.diagnostics.map((item) => item.message).join("\n")).toBe(
      true,
    );
    if (!result.ok) return;

    expect(result.package.manifest.version).toBe("0.10.0");
    expect(Object.keys(result.package.types)).toHaveLength(7);
    expect(Object.keys(result.package.templates)).toHaveLength(3);
    expect(Object.keys(result.package.selectors)).toHaveLength(24);
    expect(Object.keys(result.package.policies)).toHaveLength(2);
    expect(result.diagnostics).toEqual([]);
  });

  it("rejects every legacy YAML expression-tree family", async () => {
    const legacyForms = {
      literal: "literal: true",
      var: "var: subject",
      path: "path: {var: subject, field: identity.type}",
      state: "state: {dimension: validity, subject: {var: subject}}",
      policy:
        "policy: {ref: review-applicability@1, arguments: {subject: {var: subject}}, field: required}",
      count:
        "count: {selector: review-required-revisions@1, arguments: {}}",
      compare:
        "compare: {left: {literal: true}, operator: eq, right: {literal: true}}",
      all: "all: [{present: {var: subject}}]",
      any: "any: [{present: {var: subject}}]",
      not: "not: {present: {var: subject}}",
      exists:
        "exists: {selector: review-required-revisions@1, arguments: {}}",
      none: "none: {selector: review-required-revisions@1, arguments: {}}",
      every:
        "every: {selector: review-required-revisions@1, arguments: {}, as: item, satisfies: {present: {var: item}}}",
      present: "present: {var: subject}",
    };

    const results = await Promise.all(
      Object.values(legacyForms).map(async (legacySource) => {
        const processRoot = await copiedProcessPackage();
        const statePath = path.join(
          processRoot,
          "states/relationship-overlays.yaml",
        );
        const state = await fs.readFile(statePath, "utf8");
        await fs.writeFile(
          statePath,
          state.replace(
            "    when: 'subject.provenance.process_ref != process.current_ref'",
            `    when:\n      ${legacySource}`,
          ),
        );
        return loadProcessPackage(processRoot);
      }),
    );

    for (const result of results) {
      expect(result.ok).toBe(false);
      expect(result.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "legacy-expression-authoring",
            path: expect.stringContaining(
              "relationship-overlays.yaml#rules[2].when",
            ),
            message:
              "Expression-bearing fields require mdlm-expression@1 textual source; legacy YAML expression trees are not accepted",
          }),
          expect.objectContaining({
            code: "meta-schema",
            path: expect.stringContaining(
              "relationship-overlays.yaml/rules/2/when",
            ),
            message: "must be string",
          }),
        ]),
      );
    }
  });

  it("rejects a legacy structural Selector invocation", async () => {
    const processRoot = await copiedProcessPackage();
    const obligationPath = path.join(
      processRoot,
      "obligations/candidate-gate-signoff.yaml",
    );
    const obligation = await fs.readFile(obligationPath, "utf8");
    await fs.writeFile(
      obligationPath,
      obligation.replace(
        'for_each: \'select("candidate-baselines@1", {})\'',
        "for_each: {selector: candidate-baselines@1, arguments: {}}",
      ),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "legacy-expression-authoring",
          path: expect.stringContaining(
            "candidate-gate-signoff.yaml#for_each",
          ),
        }),
      ]),
    );
  });

  it("rejects a package that does not pin mdlm-expression@1", async () => {
    const processRoot = await copiedProcessPackage();
    const manifestPath = path.join(processRoot, "manifest.yaml");
    const manifest = await fs.readFile(manifestPath, "utf8");
    await fs.writeFile(
      manifestPath,
      manifest.replace("mdlm-expression@1", "mdlm-expression@2"),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "meta-schema",
          path: expect.stringContaining("manifest.yaml/language/expressions"),
          message: "must be equal to constant",
        }),
      ]),
    );
  });

  it("rejects an obligation that references an unknown selector", async () => {
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-process-"));
    const processRoot = path.join(temporaryRoot, "process");
    await fs.cp(path.join(process.cwd(), ".lifecycle/process"), processRoot, {
      recursive: true,
    });
    const obligationPath = path.join(
      processRoot,
      "obligations/review-context-required.yaml",
    );
    const obligation = await fs.readFile(obligationPath, "utf8");
    await fs.writeFile(
      obligationPath,
      obligation.replace("review-required-revisions@1", "missing-selector@1"),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "expression-unknown-selector",
          path: expect.stringContaining(
            "review-context-required.yaml#for_each",
          ),
          line: 1,
          column: 8,
          message: "Unknown Selector 'missing-selector@1'",
        }),
      ]),
    );
  });

  it("rejects a duplicate inherited outgoing-link ID", async () => {
    const processRoot = await copiedProcessPackage();
    const templatePath = path.join(
      processRoot,
      "templates/requirement.yaml",
    );
    const template = await fs.readFile(templatePath, "utf8");
    const duplicateLink = `outgoing_links:
  - id: derived-from
    description: Generic inherited provenance.
    targets:
      - {kind: datum, types: [PSP], identity: stable}
    cardinality: {minimum: 1, maximum: 1}
    freeze_resolution: exact-revision
    inverse_label: derives
`;
    await fs.writeFile(
      templatePath,
      template.replace("outgoing_links: []\n", duplicateLink),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "duplicate-inherited-link",
          path: "types.STK.outgoing_links",
          message:
            "Lifecycle type 'STK' redeclares inherited outgoing link 'derived-from'",
        }),
      ]),
    );
  });

  it("rejects changing an inherited property to an incompatible type", async () => {
    const processRoot = await copiedProcessPackage();
    const childPath = path.join(
      processRoot,
      "templates/rationale-bearing.yaml",
    );
    const child = await fs.readFile(childPath, "utf8");
    await fs.writeFile(
      childPath,
      child.replace(
        "    rationale: {type: string, minLength: 1}",
        "    rationale: {type: string, minLength: 1}\n    title: {type: number, minimum: 1}",
      ),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "incompatible-inherited-property",
          path:
            "templates.rationale-bearing.payload_schema.properties.title.type",
          message:
            "Payload Template 'rationale-bearing' changes inherited property 'title' from type string to number",
        }),
      ]),
    );
  });

  it("rejects widening an inherited payload constraint", async () => {
    const processRoot = await copiedProcessPackage();
    const parentPath = path.join(
      processRoot,
      "templates/titled-datum.yaml",
    );
    const parent = await fs.readFile(parentPath, "utf8");
    await fs.writeFile(
      parentPath,
      parent.replace("minLength: 1", "minLength: 5"),
    );
    const childPath = path.join(
      processRoot,
      "templates/rationale-bearing.yaml",
    );
    const child = await fs.readFile(childPath, "utf8");
    await fs.writeFile(
      childPath,
      child.replace(
        "    rationale: {type: string, minLength: 1}",
        "    rationale: {type: string, minLength: 1}\n    title: {type: string, minLength: 2}",
      ),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unsafe-schema-widening",
          path:
            "templates.rationale-bearing.payload_schema.properties.title.minLength",
          message:
            "Payload Template 'rationale-bearing' widens inherited constraint 'title.minLength' from 5 to 2",
        }),
      ]),
    );
  });

  it("rejects removal of a required field from an inherited property schema", async () => {
    const processRoot = await copiedProcessPackage();
    const parentPath = path.join(
      processRoot,
      "templates/titled-datum.yaml",
    );
    const parent = await fs.readFile(parentPath, "utf8");
    await fs.writeFile(
      parentPath,
      parent.replace(
        "    title: {type: string, minLength: 1}",
        "    title:\n      type: object\n      required: [text]\n      properties:\n        text: {type: string, minLength: 1}",
      ),
    );
    const childPath = path.join(
      processRoot,
      "templates/rationale-bearing.yaml",
    );
    const child = await fs.readFile(childPath, "utf8");
    await fs.writeFile(
      childPath,
      child.replace(
        "    rationale: {type: string, minLength: 1}",
        "    rationale: {type: string, minLength: 1}\n    title:\n      type: object\n      required: []\n      properties:\n        text: {type: string, minLength: 1}",
      ),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "inherited-required-field-removed",
          path:
            "templates.rationale-bearing.payload_schema.properties.title.required",
          message:
            "Payload Template 'rationale-bearing' removes inherited required fields from 'title': text",
        }),
      ]),
    );
  });

  it("rejects a type that extends an unknown template", async () => {
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-process-"));
    const processRoot = path.join(temporaryRoot, "process");
    await fs.cp(path.join(process.cwd(), ".lifecycle/process"), processRoot, {
      recursive: true,
    });
    const typePath = path.join(processRoot, "types/STK.yaml");
    const typeDefinition = await fs.readFile(typePath, "utf8");
    await fs.writeFile(
      typePath,
      typeDefinition.replace("requirement@1", "missing-template@1"),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unknown-reference",
          message: expect.stringContaining("missing-template@1"),
        }),
      ]),
    );
  });

  it("rejects a template inheritance cycle before any type is resolved", async () => {
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-process-"));
    const processRoot = path.join(temporaryRoot, "process");
    await fs.cp(path.join(process.cwd(), ".lifecycle/process"), processRoot, {
      recursive: true,
    });
    const templatePath = path.join(processRoot, "templates/titled-datum.yaml");
    const templateDefinition = await fs.readFile(templatePath, "utf8");
    await fs.writeFile(
      templatePath,
      templateDefinition.replace(
        "description: Payload fields",
        "extends: requirement@1\ndescription: Payload fields",
      ),
    );

    const result = await loadProcessPackage(processRoot);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "reference-cycle",
          message: expect.stringContaining("template"),
        }),
      ]),
    );
  });
});
