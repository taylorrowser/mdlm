import path from "node:path";
import { expect, it } from "vitest";
import { loadProcessPackage } from "../src/index.js";

it("routes MAP corrections with exact open product Question indexing", async () => {
  const loaded = await loadProcessPackage(path.join(process.cwd(), ".lifecycle/process"));
  expect(loaded.ok, loaded.ok ? "" : JSON.stringify(loaded.diagnostics)).toBe(true);
  if (!loaded.ok) return;

  const obligation = loaded.package.obligations[
    "wayfinding-map-review-correction-required"
  ]!;
  expect((obligation.resolve_with as {
    scenario: string;
    inputs: { open_product_questions: { source: string } };
  })).toMatchObject({
    scenario: "revise-wayfinding-map-after-review@1",
    inputs: {
      open_product_questions: {
        source: 'select("open-phase-0-gate-product-questions@1", {})',
      },
    },
  });

  const scenario = loaded.package.scenarios["revise-wayfinding-map-after-review"]!;
  expect(scenario.outputs).toEqual([
    expect.objectContaining({
      name: "replacement",
      types: ["MAP"],
      identity_from: { input: "subject" },
      required_links: expect.arrayContaining([
        { link: "indexes", target: { input: "open_product_questions" } },
        { link: "corrects-review", target: { input: "failed_reviews" } },
      ]),
    }),
  ]);
});
