#!/usr/bin/env node

// THROWAWAY PROTOTYPE: three MDLM hierarchy layouts, switchable via ?variant=.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

const defaults = {
  repo: "/home/ubuntu/.pi/worktrees/mdlm-strip-leading-plus-pi-glm-178-direct",
  mdlm: "/home/ubuntu/git/mdlm-successor-demos/.packages/installs/aff9bd404fdb461759683873dc350592bcf157c3-94fd78e57ccd1f4c0889b1893df8930006f8c65f/node_modules/.bin/mdlm",
  output: resolve("prototypes/lifecycle-viewer/trial.html"),
};

const options = { ...defaults };
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index]?.replace(/^--/, "");
  if (!(key in options) || !process.argv[index + 1]) {
    throw new Error("Usage: node generate.mjs [--repo PATH] [--mdlm PATH] [--output PATH]");
  }
  options[key] = resolve(process.argv[index + 1]);
}

const response = JSON.parse(execFileSync(options.mdlm, ["list", "--json"], {
  cwd: options.repo,
  encoding: "utf8",
  maxBuffer: 20 * 1024 * 1024,
}));

if (!response.ok || !Array.isArray(response.data)) {
  throw new Error("mdlm list --json did not return a valid current-data response");
}

const head = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: options.repo,
  encoding: "utf8",
}).trim();

const all = response.data.map((entry) => ({
  datum: entry.lifecycleDatum.datum,
  backlinks: entry.projections.backlinks,
}));
const mapTypes = new Set(["PSP", "STK", "SYS"]);
const selected = all.filter(({ datum }) => mapTypes.has(datum.type));
const selectedIdentities = new Set(selected.flatMap(({ datum }) => [datum.id, datum.revision_id]));

const relationKey = ({ source, type, target }) => `${source}\u0000${type}\u0000${target}`;
const relationsByKey = new Map();
for (const { backlinks } of all) {
  for (const relation of backlinks) {
    if (selectedIdentities.has(relation.source) || selectedIdentities.has(relation.target)) {
      relationsByKey.set(relationKey(relation), relation);
    }
  }
}
const relations = [...relationsByKey.values()].sort((a, b) =>
  relationKey(a).localeCompare(relationKey(b)),
);

const datumByIdentity = new Map();
for (const { datum } of all) {
  datumByIdentity.set(datum.id, datum);
  datumByIdentity.set(datum.revision_id, datum);
}

const records = selected.map(({ datum }) => ({
  id: datum.id,
  revision: datum.revision,
  revisionId: datum.revision_id,
  type: datum.type,
  title: datum.payload.title ?? datum.body,
  payload: datum.payload,
  body: datum.body,
}));

const related = [...new Set(relations.flatMap(({ source, target }) => [source, target]))]
  .filter((identity) => !selectedIdentities.has(identity))
  .map((identity) => {
    const datum = datumByIdentity.get(identity);
    return {
      identity,
      type: datum?.type ?? identity.split("-")[0],
      title: datum?.payload.title ?? datum?.body ?? identity,
    };
  })
  .sort((a, b) => a.identity.localeCompare(b.identity));

const bundle = {
  format: "mdlm-viewer-prototype@1",
  source: { name: basename(options.repo), revision: head },
  process: { reference: response.package.reference, digest: response.package.digest },
  records,
  relations,
  related,
};

const embedded = JSON.stringify(bundle).replaceAll("<", "\\u003c");
const html = `<!doctype html>
<!-- THROWAWAY UI PROTOTYPE for MDLM issue #528. Three variants via ?variant=A|B|C. -->
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MDLM lifecycle map — ${escapeMarkup(bundle.source.name)}</title>
  <style>
    :root {
      color-scheme: light;
      --paper: #f6f1e7;
      --ink: #25221e;
      --muted: #6e665c;
      --accent: #a3422d;
      --line: #d8cfc0;
      --panel: #fffaf1;
      --small: 13px;
      --body: 17px;
      --title: clamp(30px, 5vw, 54px);
      --shadow: 0 18px 55px rgba(55, 42, 28, .16);
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--paper); color: var(--ink); font: var(--body)/1.55 Georgia, "Times New Roman", serif; }
    button { color: inherit; }
    button, .eyebrow, .meta, .type, .switcher { font: var(--small)/1.4 ui-monospace, SFMono-Regular, Consolas, monospace; }
    button:focus-visible { outline: 3px solid #d49b8e; outline-offset: 3px; }
    .page { width: min(1180px, calc(100% - 44px)); margin: auto; padding: 50px 0 120px; }
    .masthead { display: grid; grid-template-columns: 1fr auto; gap: 28px; align-items: end; border-top: 6px solid var(--accent); padding-top: 24px; margin-bottom: 44px; }
    .eyebrow { display: block; color: var(--accent); letter-spacing: .08em; text-transform: uppercase; }
    h1 { max-width: 760px; margin: 10px 0 14px; font-size: var(--title); font-weight: 500; line-height: 1.02; letter-spacing: -.03em; }
    .lede, .source-note, .muted { color: var(--muted); }
    .lede { max-width: 650px; margin: 0; }
    .source-note { max-width: 340px; margin: 0; text-align: right; font: var(--small)/1.55 ui-monospace, SFMono-Regular, Consolas, monospace; overflow-wrap: anywhere; }
    .canvas { min-height: 560px; }
    .node { border: 1px solid var(--line); background: rgba(255, 250, 241, .72); cursor: pointer; text-align: left; transition: border-color .15s, transform .15s, background .15s; }
    .node:hover { border-color: var(--accent); background: var(--panel); transform: translateY(-2px); }
    .node .type { display: block; color: var(--accent); letter-spacing: .07em; margin-bottom: 7px; }
    .node .title { display: block; font: 600 16px/1.3 Georgia, "Times New Roman", serif; }
    .node .count { display: block; margin-top: 9px; color: var(--muted); font: 12px/1.4 ui-monospace, SFMono-Regular, Consolas, monospace; }

    /* A — a vertical requirement tree. */
    .tree { width: min(900px, 100%); margin: auto; }
    .tree .level { display: grid; gap: 14px; }
    .tree .root, .tree .system { width: min(520px, 100%); margin: auto; padding: 20px 22px; }
    .tree .stakeholders { grid-template-columns: repeat(4, 1fr); }
    .tree .stakeholders .node { min-height: 175px; padding: 17px; }
    .tree .rail { width: 1px; height: 45px; margin: auto; background: var(--accent); position: relative; }
    .tree .rail::after { content: ""; position: absolute; bottom: -1px; left: -4px; width: 7px; height: 7px; border: solid var(--accent); border-width: 0 1px 1px 0; transform: rotate(45deg); }
    .variant-heading { display: flex; gap: 18px; align-items: baseline; margin: 0 0 24px; border-bottom: 1px solid var(--line); padding-bottom: 13px; }
    .variant-heading h2 { margin: 0; font-size: 22px; font-weight: 500; }

    /* B — four horizontal trace lanes. */
    .lanes { display: grid; gap: 8px; }
    .lane-labels, .lane { display: grid; grid-template-columns: minmax(170px, .8fr) 32px minmax(260px, 1.35fr) 32px minmax(190px, 1fr); align-items: stretch; }
    .lane-labels { color: var(--muted); text-transform: uppercase; letter-spacing: .06em; font: var(--small)/1.4 ui-monospace, SFMono-Regular, Consolas, monospace; }
    .lane-labels span:nth-child(3), .lane-labels span:nth-child(5) { padding-left: 12px; }
    .lane .node { padding: 16px; }
    .lane .repeat { opacity: .72; }
    .lane-arrow { display: grid; place-items: center; color: var(--accent); font-size: 20px; pointer-events: none; }

    /* C — a compact requirements ledger. */
    .ledger { border-top: 2px solid var(--ink); }
    .ledger-row { display: grid; grid-template-columns: 70px minmax(240px, 1.5fr) minmax(180px, .8fr) 95px; gap: 18px; align-items: center; min-height: 76px; border-bottom: 1px solid var(--line); }
    .ledger-head { min-height: 42px; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; font: 11px/1.4 ui-monospace, SFMono-Regular, Consolas, monospace; }
    .ledger .node:hover > span { color: var(--accent); }
    .ledger-title { font-weight: 600; }
    .ledger-id, .ledger-parent, .ledger-count { color: var(--muted); overflow-wrap: anywhere; font: 12px/1.45 ui-monospace, SFMono-Regular, Consolas, monospace; }
    .ledger-row[data-type="STK"] .ledger-title { padding-left: 24px; }
    .ledger-row[data-type="SYS"] .ledger-title { padding-left: 48px; }

    .scrim { position: fixed; inset: 0; z-index: 20; background: rgba(37, 34, 30, .24); opacity: 0; pointer-events: none; transition: opacity .18s; }
    .scrim.open { opacity: 1; pointer-events: auto; }
    .drawer { position: fixed; inset: 0 0 0 auto; z-index: 21; width: min(600px, 92vw); overflow: auto; background: var(--panel); border-left: 1px solid var(--line); box-shadow: var(--shadow); transform: translateX(102%); transition: transform .22s ease; }
    .drawer.open { transform: translateX(0); }
    .drawer-inner { padding: 34px 38px 100px; }
    .drawer-close { position: sticky; top: 18px; float: right; width: 42px; height: 42px; border: 1px solid var(--line); border-radius: 50%; background: var(--panel); cursor: pointer; font-size: 22px; }
    .drawer h2 { margin: 10px 54px 10px 0; font-size: 30px; font-weight: 500; line-height: 1.1; }
    .drawer h3 { margin: 35px 0 12px; padding-top: 18px; border-top: 1px solid var(--line); font-size: 16px; }
    .datum-body { padding: 15px 0 15px 19px; border-left: 3px solid var(--accent); }
    .payload { display: grid; grid-template-columns: minmax(110px, .35fr) 1fr; gap: 8px 18px; margin: 0; }
    .payload dt { color: var(--muted); overflow-wrap: anywhere; font: 12px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace; }
    .payload dd { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
    .relation-group { margin: 20px 0; }
    .relation-group h4 { margin: 0 0 8px; color: var(--accent); font: 12px/1.4 ui-monospace, SFMono-Regular, Consolas, monospace; text-transform: uppercase; letter-spacing: .06em; }
    .relation-list { display: grid; gap: 7px; }
    .relation { padding: 11px 12px; background: var(--paper); border-left: 2px solid var(--line); }
    .relation strong { display: block; font-size: 14px; }
    .relation small { display: block; color: var(--muted); overflow-wrap: anywhere; font: 11px/1.4 ui-monospace, SFMono-Regular, Consolas, monospace; }
    .switcher { position: fixed; z-index: 30; bottom: 18px; left: 50%; display: flex; align-items: center; gap: 8px; transform: translateX(-50%); padding: 7px; border-radius: 999px; background: var(--ink); color: var(--paper); box-shadow: 0 8px 28px rgba(0,0,0,.25); }
    .switcher button { width: 38px; height: 36px; border: 0; border-radius: 50%; background: transparent; color: inherit; cursor: pointer; font-size: 20px; }
    .switcher button:hover { background: rgba(255,255,255,.12); }
    .switcher-label { min-width: 180px; text-align: center; }
    [hidden] { display: none !important; }
    @media (max-width: 760px) {
      .page { width: min(100% - 28px, 1180px); padding-top: 28px; }
      .masthead { grid-template-columns: 1fr; margin-bottom: 30px; }
      .source-note { text-align: left; }
      .tree .stakeholders { grid-template-columns: 1fr; }
      .tree .stakeholders .node { min-height: auto; }
      .lane-labels { display: none; }
      .lane { grid-template-columns: 1fr; border-bottom: 1px solid var(--line); padding-bottom: 18px; }
      .lane-arrow { height: 28px; transform: rotate(90deg); }
      .lane .repeat { opacity: 1; }
      .ledger-row { grid-template-columns: 52px 1fr 70px; gap: 10px; }
      .ledger-parent { display: none; }
      .ledger-row[data-type="STK"] .ledger-title, .ledger-row[data-type="SYS"] .ledger-title { padding-left: 0; }
      .drawer { width: 100%; }
      .drawer-inner { padding: 22px 20px 100px; }
      .payload { grid-template-columns: 1fr; }
      .payload dd { margin-bottom: 9px; }
    }
    @media print { .switcher, .drawer, .scrim { display: none; } body { background: white; } .page { width: 100%; padding: 0; } }
  </style>
</head>
<body>
  <main class="page">
    <header class="masthead">
      <div>
        <span class="eyebrow">MDLM lifecycle map · throwaway prototype</span>
        <h1>See the requirement backbone at a glance.</h1>
        <p class="lede">Select any current PSP, STK, or SYS Lifecycle Datum to read its content and every direct relation.</p>
      </div>
      <p class="source-note" id="sourceNote"></p>
    </header>
    <section class="canvas" id="canvas" aria-live="polite"></section>
  </main>

  <div class="scrim" id="scrim"></div>
  <aside class="drawer" id="drawer" aria-label="Lifecycle Datum detail" aria-hidden="true">
    <div class="drawer-inner" id="drawerInner"></div>
  </aside>

  <nav class="switcher" aria-label="Prototype variants">
    <button type="button" id="previous" aria-label="Previous variant">←</button>
    <span class="switcher-label" id="switcherLabel"></span>
    <button type="button" id="next" aria-label="Next variant">→</button>
  </nav>

  <script id="mdlm-viewer-data" type="application/json">${embedded}</script>
  <script>
    const bundle = JSON.parse(document.querySelector("#mdlm-viewer-data").textContent);
    const records = bundle.records;
    const recordByIdentity = new Map(records.flatMap(record => [[record.id, record], [record.revisionId, record]]));
    const relatedByIdentity = new Map(bundle.related.map(item => [item.identity, item]));
    const variants = [
      { key: "A", name: "Tree" },
      { key: "B", name: "Trace lanes" },
      { key: "C", name: "Ledger" }
    ];
    const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\\\"": "&quot;", "'": "&#039;" })[character]);
    const psp = records.find(record => record.type === "PSP");
    const stks = records.filter(record => record.type === "STK");
    const sys = records.find(record => record.type === "SYS");
    let drawerInvoker = null;

    document.querySelector("#sourceNote").textContent = bundle.source.name + " · " + bundle.source.revision.slice(0, 12) + " · " + bundle.process.reference;

    function directRelations(record) {
      const identities = new Set([record.id, record.revisionId]);
      return bundle.relations.filter(relation => identities.has(relation.source) || identities.has(relation.target));
    }

    function node(record, className = "") {
      return '<button class="node ' + className + '" type="button" data-record="' + escapeHtml(record.id) + '">' +
        '<span class="type">' + escapeHtml(record.type + " · " + record.id) + '</span>' +
        '<span class="title">' + escapeHtml(record.title) + '</span>' +
        '<span class="count">' + directRelations(record).length + ' direct relations</span></button>';
    }

    function heading(kicker, title) {
      return '<header class="variant-heading"><span class="eyebrow">' + escapeHtml(kicker) + '</span><h2>' + escapeHtml(title) + '</h2></header>';
    }

    function VariantA() {
      return heading("Variant A", "One tree, three levels") +
        '<div class="tree"><div class="level">' + node(psp, "root") + '</div><div class="rail"></div>' +
        '<div class="level stakeholders">' + stks.map(record => node(record)).join("") + '</div><div class="rail"></div>' +
        '<div class="level">' + node(sys, "system") + '</div></div>';
    }

    function VariantB() {
      return heading("Variant B", "Follow each commitment across") +
        '<div class="lanes"><div class="lane-labels"><span>Product</span><span></span><span>Stakeholder</span><span></span><span>System</span></div>' +
        stks.map(stk => '<div class="lane">' + node(psp, "repeat") + '<span class="lane-arrow">→</span>' + node(stk) + '<span class="lane-arrow">→</span>' + node(sys, "repeat") + '</div>').join("") + '</div>';
    }

    function parentLabel(record) {
      if (record.type === "PSP") return "—";
      if (record.type === "STK") return psp.id;
      return stks.map(stk => stk.id).join(", ");
    }

    function VariantC() {
      const rows = [psp, ...stks, sys];
      return heading("Variant C", "Requirements ledger") +
        '<div class="ledger"><div class="ledger-row ledger-head"><span>Type</span><span>Lifecycle Datum</span><span>Parent</span><span>Relations</span></div>' +
        rows.map(record => '<button class="node ledger-row" data-type="' + record.type + '" type="button" data-record="' + record.id + '">' +
          '<span class="ledger-id">' + record.type + '</span><span class="ledger-title">' + escapeHtml(record.title) + '</span>' +
          '<span class="ledger-parent">' + escapeHtml(parentLabel(record)) + '</span><span class="ledger-count">' + directRelations(record).length + '</span></button>').join("") + '</div>';
    }

    function currentVariant() {
      const requested = new URLSearchParams(location.search).get("variant")?.toUpperCase();
      return variants.some(variant => variant.key === requested) ? requested : "A";
    }

    function renderVariant() {
      const key = currentVariant();
      document.querySelector("#canvas").innerHTML = ({ A: VariantA, B: VariantB, C: VariantC })[key]();
      const variant = variants.find(item => item.key === key);
      document.querySelector("#switcherLabel").textContent = variant.key + " · " + variant.name;
      document.documentElement.dataset.variant = key;
    }

    function endpoint(identity) {
      const record = recordByIdentity.get(identity);
      if (record) return { type: record.type, title: record.title };
      return relatedByIdentity.get(identity) ?? { type: identity.split("-")[0], title: identity };
    }

    function relationMarkup(relation, incoming) {
      const otherIdentity = incoming ? relation.source : relation.target;
      const other = endpoint(otherIdentity);
      const label = incoming ? relation.inverseLabel : relation.type;
      const direction = incoming ? "incoming" : "outgoing";
      return '<div class="relation"><strong>' + escapeHtml(label + " · " + other.type + " · " + other.title) + '</strong>' +
        '<small>' + escapeHtml(direction + " · " + relation.type + " · " + otherIdentity) + '</small></div>';
    }

    function payloadValue(value) {
      if (Array.isArray(value)) return value.map(item => typeof item === "object" ? JSON.stringify(item, null, 2) : "• " + item).join("\\n");
      if (value && typeof value === "object") return JSON.stringify(value, null, 2);
      return String(value);
    }

    function openDrawer(record, invoker = document.activeElement) {
      drawerInvoker = invoker instanceof HTMLElement ? invoker : null;
      const identities = new Set([record.id, record.revisionId]);
      const incoming = bundle.relations.filter(relation => identities.has(relation.target));
      const outgoing = bundle.relations.filter(relation => identities.has(relation.source));
      document.querySelector("#drawerInner").innerHTML =
        '<button class="drawer-close" type="button" aria-label="Close detail">×</button>' +
        '<span class="eyebrow">' + escapeHtml(record.type + " · Revision " + record.revision) + '</span><h2>' + escapeHtml(record.title) + '</h2>' +
        '<p class="meta muted">' + escapeHtml(record.revisionId) + '</p><p class="datum-body">' + escapeHtml(record.body) + '</p>' +
        '<h3>Payload</h3><dl class="payload">' + Object.entries(record.payload).map(([key, value]) => '<dt>' + escapeHtml(key) + '</dt><dd>' + escapeHtml(payloadValue(value)) + '</dd>').join("") + '</dl>' +
        '<h3>Direct relations · ' + (incoming.length + outgoing.length) + '</h3>' +
        '<section class="relation-group"><h4>Incoming · ' + incoming.length + '</h4><div class="relation-list">' + (incoming.map(relation => relationMarkup(relation, true)).join("") || '<p class="muted">None</p>') + '</div></section>' +
        '<section class="relation-group"><h4>Outgoing · ' + outgoing.length + '</h4><div class="relation-list">' + (outgoing.map(relation => relationMarkup(relation, false)).join("") || '<p class="muted">None</p>') + '</div></section>';
      document.querySelector("#drawer").classList.add("open");
      document.querySelector("#drawer").setAttribute("aria-hidden", "false");
      document.querySelector("#scrim").classList.add("open");
      document.querySelector(".drawer-close").focus();
    }

    function closeDrawer() {
      document.querySelector("#drawer").classList.remove("open");
      document.querySelector("#drawer").setAttribute("aria-hidden", "true");
      document.querySelector("#scrim").classList.remove("open");
      if (drawerInvoker?.isConnected) drawerInvoker.focus();
      drawerInvoker = null;
    }

    function cycle(delta) {
      const index = variants.findIndex(variant => variant.key === currentVariant());
      const nextVariant = variants[(index + delta + variants.length) % variants.length];
      const url = new URL(location.href);
      url.searchParams.set("variant", nextVariant.key);
      history.replaceState({}, "", url);
      closeDrawer();
      renderVariant();
    }

    document.querySelector("#canvas").addEventListener("click", event => {
      const button = event.target.closest("[data-record]");
      if (button) openDrawer(recordByIdentity.get(button.dataset.record), button);
    });
    document.querySelector("#drawer").addEventListener("click", event => { if (event.target.closest(".drawer-close")) closeDrawer(); });
    document.querySelector("#scrim").addEventListener("click", closeDrawer);
    document.querySelector("#previous").addEventListener("click", () => cycle(-1));
    document.querySelector("#next").addEventListener("click", () => cycle(1));
    document.addEventListener("keydown", event => {
      const editing = event.target.matches("input, textarea, [contenteditable]");
      if (!editing && event.key === "ArrowLeft") cycle(-1);
      if (!editing && event.key === "ArrowRight") cycle(1);
      if (event.key === "Escape") closeDrawer();
    });
    addEventListener("popstate", renderVariant);
    window.__MDLM_VIEWER__ = { bundle, renderVariant, openDrawer, closeDrawer, cycle };
    renderVariant();
  </script>
</body>
</html>
`;

mkdirSync(dirname(options.output), { recursive: true });
writeFileSync(options.output, html, "utf8");
process.stdout.write(JSON.stringify({
  output: options.output,
  records: records.length,
  relations: relations.length,
  related: related.length,
  bytes: Buffer.byteLength(html),
}) + "\n");

function escapeMarkup(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character]);
}
