import { expect, it } from "vitest";
import {
  evaluateLifecycle,
  type LifecycleRecord,
} from "../src/index.js";
import { canonicalProcessPackage } from "./helpers/canonical-process-package-fixture.js";
import { frozenLifecycleRecord } from "./helpers/lifecycle-scenarios.js";

const processRef = "mdlm-bootstrap@0.74.0#coherent-phase-2-readiness";

function datum(
  type: string,
  id: string,
  payload: Record<string, unknown>,
  links: { type: string; target: string }[] = [],
): LifecycleRecord {
  return frozenLifecycleRecord(processRef, type, id, payload, { links });
}

it("groups one coherent stakeholder context into one ASP and DWP readiness route", async () => {
  const processPackage = await canonicalProcessPackage();

  const product = datum("PSP", "PSP-0COHERENT1", {
    title: "Coherent product",
    rationale: "Exercise grouped Phase 2 readiness.",
  });
  const requirement = (id: string, statement: string) => datum("STK", id, {
    title: statement,
    rationale: "One shared product responsibility.",
    statement,
    verification_intent: "Observe the shared product boundary.",
    stakeholder: "operator",
    priority: "must",
    system_context: "product",
  }, [{ type: "derived-from", target: product.datum.id }]);
  const first = requirement("STK-0COHERENT1", "Accept one valid value");
  const second = requirement("STK-0COHERENT2", "Reject one invalid value");
  const accepted = datum("BSL", "BSL-0COHERENT1", {
    title: "Accepted coherent intent",
    kind: "intent-approved",
    role: "accepted",
    scope: "coherent-product",
    group: "DEFAULT",
    definition_members: [product, first, second].map(
      (item) => item.datum.revision_id,
    ),
    evidence: [],
  });
  accepted.datum.created_by.scenario = "accept-phase-0-intent@1";

  const architecture = datum("ASP", "ASP-0COHERENT1", {
    title: "Shared product architecture",
    rationale: "One responsibility context owns both behaviors.",
  }, [first, second].map((item) => ({
    type: "governs",
    target: item.datum.revision_id,
  })));
  const interfaceSpec = datum("ICSP", "ICSP-0COHERENT1", {
    title: "Controlled product boundary",
    rationale: "One actual shared boundary.",
    architecture_revision: architecture.datum.revision_id,
  }, [{
    type: "defines-interface-for",
    target: architecture.datum.revision_id,
  }]);
  const strategy = datum("VSP", "VSP-0COHERENT1", {
    title: "Shared verification strategy",
    rationale: "One black-box strategy covers both behaviors.",
  }, [first, second].flatMap((item) => [
    { type: "governs", target: item.datum.id },
    { type: "governs-revision", target: item.datum.revision_id },
  ]));

  const snapshot = (records: LifecycleRecord[]) => evaluateLifecycle(
    processPackage,
    {
      processRef,
      phaseId: "phase-2-system-definition",
      records: [product, first, second, accepted, ...records],
      dependencyComparisons: [],
    },
  );
  const ready = (records: LifecycleRecord[], obligation: string) => snapshot(
    records,
  ).obligations.filter((item) =>
    item.obligation === obligation && item.status === "ready"
  );

  expect({
    architecture: ready([], "system-architecture-required"),
    planning: ready(
      [architecture, interfaceSpec, strategy],
      "decomposition-planning-required",
    ),
  }).toEqual({
    architecture: [expect.objectContaining({
      subject: first.datum.revision_id,
      actionableResolver: "define-system-architecture@3",
    })],
    planning: [expect.objectContaining({
      subject: first.datum.revision_id,
      actionableResolver: "define-decomposition-work-package@3",
    })],
  });
}, 420_000);
