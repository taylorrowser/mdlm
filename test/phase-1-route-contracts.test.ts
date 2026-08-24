import { promises as fs } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import type { ProcessPackage } from "../src/index.js";
import { canonicalProcessPackage } from "./helpers/canonical-process-package-fixture.js";

type Route = {
  route: string;
  selectors: string[];
  obligations: string[];
  participation: { policies: string[] };
  resolvers: string[];
  next: string[];
};

type Matrix = {
  rows: Array<{ id: string; routes: Route[] }>;
};

function exactDefinition(
  catalog: Record<string, { id: string; version: number }>,
  reference: string,
) {
  const match = /^(.*)@([1-9][0-9]*)$/.exec(reference);
  const definition = match?.[1] ? catalog[match[1]] : undefined;
  expect(definition, reference).toBeDefined();
  expect(`${definition?.id}@${definition?.version}`, reference).toBe(reference);
  return definition!;
}

describe("Phase 1 route contracts", () => {
  let processPackage: ProcessPackage;
  let routes: Route[];

  beforeAll(async () => {
    processPackage = await canonicalProcessPackage();
    const matrix = parse(await fs.readFile(
      path.join(process.cwd(), "docs/phase-hardening-matrix.yaml"),
      "utf8",
    )) as Matrix;
    routes = matrix.rows
      .filter((row) => ["phase-1-assurance", "phase-1-public-command-evidence"].includes(row.id))
      .flatMap((row) => row.routes);
  });

  it("binds every Phase 1 route to exact compiled package definitions", () => {
    expect(routes.map((route) => route.route)).toEqual([
      "VSP creation",
      "ENV qualification",
      "pilot VER",
      "passing independent Review",
      "first VSP correction",
      "second VSP correction",
      "exhausted VSP correction",
      "failed ENV qualification correction",
      "passing replacement ENV qualification",
      "exhausted failed ENV qualification correction",
      "ordinary ENV correction",
      "exhausted ENV correction",
      "ordinary pilot VER correction",
      "exhausted pilot VER correction",
      "stakeholder-owned failure",
      "malformed replacement",
      "multiple VSP boundary",
      "multiple ENV boundary",
      "multiple pilot target boundary",
      "target registration",
      "source-independent VAI",
      "run",
      "malformed command matrix",
      "VAI correction",
      "timeout aggregation",
    ]);

    for (const route of routes) {
      for (const reference of route.selectors) {
        exactDefinition(processPackage.selectors, reference);
      }
      for (const reference of route.obligations) {
        exactDefinition(processPackage.obligations, reference);
      }
      for (const reference of route.participation.policies) {
        exactDefinition(processPackage.policies, reference);
      }
      for (const reference of route.resolvers) {
        const scenario = exactDefinition(processPackage.scenarios, reference) as Record<string, unknown>;
        expect(scenario.outputs, `${route.route}: outputs`).toEqual(expect.any(Array));
        expect(scenario.completion, `${route.route}: compiled completion`).toEqual(expect.any(Object));
      }
    }
  });

  it("keeps correction authority and unsupported multiplicity explicit", () => {
    expect(exactDefinition(
      processPackage.policies,
      "phase-1-assurance-correction-participation@1",
    )).toMatchObject({
      default: expect.objectContaining({ authority_mode: "attended" }),
      rules: expect.arrayContaining([
        expect.objectContaining({
          result: expect.objectContaining({ authority_mode: "autonomous" }),
        }),
      ]),
    });

    expect(exactDefinition(
      processPackage.policies,
      "environment-qualification-correction-participation@1",
    )).toMatchObject({
      default: expect.objectContaining({ authority_mode: "attended" }),
      rules: expect.arrayContaining([
        expect.objectContaining({
          result: expect.objectContaining({ authority_mode: "autonomous" }),
        }),
      ]),
    });

    const profile = processPackage.profiles.bootstrap as Record<string, unknown>;
    expect(JSON.stringify(profile.terminal_outcomes)).toContain("phase-1");
    const boundaryRoutes = routes.filter((route) => route.route.startsWith("multiple "));
    expect(boundaryRoutes.map((route) => route.route)).toEqual([
      "multiple VSP boundary",
      "multiple ENV boundary",
      "multiple pilot target boundary",
    ]);
    expect(boundaryRoutes.every((route) =>
      route.next[0] === "profile-boundary-reached"
    )).toBe(true);
  });
});
