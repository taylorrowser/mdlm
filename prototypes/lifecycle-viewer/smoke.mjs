#!/usr/bin/env node

// Deterministic artifact checks only. This is a throwaway prototype, not a production suite.
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const artifact = resolve(process.argv[2] ?? "prototypes/lifecycle-viewer/trial.html");
const html = readFileSync(artifact, "utf8");
const match = html.match(/<script id="mdlm-viewer-data" type="application\/json">([^<]+)<\/script>/);
if (!match) throw new Error("embedded viewer bundle is missing");
const bundle = JSON.parse(match[1]);

const checks = [
  [bundle.records.length === 6, `expected 6 map records, found ${bundle.records.length}`],
  [bundle.records.filter(record => record.type === "PSP").length === 1, "expected 1 PSP"],
  [bundle.records.filter(record => record.type === "STK").length === 4, "expected 4 STK"],
  [bundle.records.filter(record => record.type === "SYS").length === 1, "expected 1 SYS"],
  [bundle.relations.length === 49, `expected 49 direct relations, found ${bundle.relations.length}`],
  [bundle.related.length === 18, `expected 18 related endpoint stubs, found ${bundle.related.length}`],
  [statSync(artifact).size < 4_000_000, "artifact exceeds 4,000,000 bytes"],
  [!/<(?:script|link|img)[^>]+(?:src|href)=["'](?:https?:)?\/\//i.test(html), "external asset reference found"],
  [html.includes("?variant=A|B|C") && html.includes("function VariantA()") && html.includes("function VariantB()") && html.includes("function VariantC()"), "variant hooks are missing"],
  [html.includes('event.key === "ArrowLeft"') && html.includes('event.key === "ArrowRight"'), "arrow-key switcher hooks are missing"],
  [html.includes('id="previous"') && html.includes('id="next"'), "click switcher hooks are missing"],
  [html.includes("window.__MDLM_VIEWER__"), "browser inspection hook is missing"],
];

const failed = checks.filter(([passed]) => !passed);
if (failed.length) throw new Error(failed.map(([, message]) => message).join("\n"));
process.stdout.write(JSON.stringify({
  artifact,
  records: bundle.records.length,
  relations: bundle.relations.length,
  related: bundle.related.length,
  bytes: statSync(artifact).size,
  externalAssets: 0,
  variants: ["A", "B", "C"],
}) + "\n");
