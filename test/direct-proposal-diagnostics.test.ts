import { expect, it } from "vitest";
import { parseDirectProposal } from "../src/direct-proposal.js";

const candidate = () => ({
  localId: "chg", type: "CHG", payload: { title: "Private authored value" },
  links: [{ type: "changes", target: "REQ-0000000001-r00001" }], body: "",
});
const proposal = (second: unknown) => JSON.stringify({
  operation: "change-001", action: "request-change@12",
  package: { reference: "example@1", digest: "sha256:example", language: "mdlm-expression@1" },
  snapshot: "sha256:example", candidates: [{ ...candidate(), localId: "first" }, second],
});

it("identifies the candidate and link with the shape required for rel/to rejection", () => {
  const malformed = { ...candidate(), links: [{ rel: "changes", to: "Private exact target" }] };
  expect(() => parseDirectProposal(proposal(malformed))).toThrow(
    "Invalid candidate datum at candidates[1].links[0]: expected an object containing only string fields type and target",
  );
});

it("accepts unchanged valid candidate fields and type/target links", () => {
  const valid = { ...candidate(), predecessor: "CHG-0000000001-r00001" };
  expect(parseDirectProposal(proposal(valid)).candidates[1]).toEqual(valid);
});

it.each([
  [null, "candidates[1]", "expected object"],
  [{ ...candidate(), unexpected: "private" }, "candidates[1].unexpected", "unexpected field"],
  [{ ...candidate(), localId: "invalid.id" }, "candidates[1].localId", "expected string matching"],
  [{ ...candidate(), type: 1 }, "candidates[1].type", "expected string"],
  [{ ...candidate(), payload: [] }, "candidates[1].payload", "expected object"],
  [{ ...candidate(), links: {} }, "candidates[1].links", "expected array"],
  [{ ...candidate(), body: null }, "candidates[1].body", "expected string"],
  [{ ...candidate(), predecessor: 1 }, "candidates[1].predecessor", "expected string when supplied"],
])("keeps malformed candidate field refusal for case %#", (malformed, field, expected) => {
  expect(() => parseDirectProposal(proposal(malformed))).toThrow(`Invalid candidate datum at ${field}: ${expected}`);
});

it.each([
  null,
  { type: "changes" },
  { target: "REQ-0000000001-r00001" },
  { type: 1, target: "REQ-0000000001-r00001" },
  { type: "changes", target: 1 },
  { type: "changes", target: "REQ-0000000001-r00001", extra: "private" },
])("keeps malformed link refusal and required shape for case %#", malformed => {
  expect(() => parseDirectProposal(proposal({ ...candidate(), links: [candidate().links[0], malformed] }))).toThrow(
    "Invalid candidate datum at candidates[1].links[1]: expected an object containing only string fields type and target",
  );
});
