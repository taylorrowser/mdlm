import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { req } from "./helpers/req.js";
import { freezeQuestionSource } from "./helpers/source-boundary.js";

const examplePackage = path.join(process.cwd(), ".lifecycle/process");

describe("req Phase 0 wayfinding slice", () => {
  let repositoryRoot: string;

  beforeEach(async () => {
    repositoryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdlm-phase-0-"));
    const initialized = req(
      repositoryRoot,
      "init",
      "--process",
      examplePackage,
      "--json",
    );
    expect(initialized.status, initialized.stderr).toBe(0);
  });

  afterEach(async () => {
    await fs.rm(repositoryRoot, { recursive: true, force: true });
  });

  it("supplies the lifecycle definitions needed for a small intent slice", () => {
    const shown = req(repositoryRoot, "process", "show", "--json");

    expect(shown.status, shown.stderr).toBe(0);
    const catalogs = JSON.parse(shown.stdout).inspection.definitionCatalogs;
    expect(catalogs.types).toEqual([
      "ART@1",
      "ASP@2",
      "BSL@4",
      "CHG@3",
      "DEC@6",
      "DWP@3",
      "ENV@1",
      "ICSP@2",
      "MAP@3",
      "PAS@1",
      "PRB@1",
      "PSP@4",
      "QST@4",
      "RES@1",
      "REV@5",
      "RUN@1",
      "STK@4",
      "SYS@3",
      "VAI@1",
      "VER@2",
      "VSP@1",
    ]);
    expect(catalogs.scenarios).toEqual(expect.arrayContaining([
      "build-exploratory-prototype@1",
      "chart-wayfinding-map@1",
      "record-gate-signoff@3",
      "review-datum-in-context@2",
    ]));
  });

  it("discovers the first required foundation step from an initialized repository", () => {
    const initialLooseEnds = req(
      repositoryRoot,
      "loose-ends",
      "--phase",
      "phase-0-wayfinding",
      "--json",
    );

    expect(initialLooseEnds.status, initialLooseEnds.stderr).toBe(0);
    expect(JSON.parse(initialLooseEnds.stdout).looseEnds.items[0]).toEqual(expect.objectContaining({
      obligation: "initial-wayfinding-map-required",
      subject: "phase-0-wayfinding@4",
      status: "ready",
      dispatchable: true,
      actionableResolver: "establish-initial-wayfinding-map@1",
    }));
  });

  it("rejects a mutable prototype repository reference", () => {
    const created = req(
      repositoryRoot,
      "new",
      "ART",
      "--scenario",
      "build-exploratory-prototype@1",
      "--set",
      "title=Mutable prototype pointer",
      "--set",
      "kind=prototype",
      "--set",
      "repository_ref=git:main",
      "--set",
      'supported_behavior=["one experiment"]',
      "--set",
      "unsupported_behavior=[]",
      "--json",
    );

    expect(created.status).toBe(1);
    expect(JSON.parse(created.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "datum-payload" }),
    ]);
  });

  it("routes a failed foundation Review to a replacement Revision and fresh Review work", async () => {
    const create = (...arguments_: string[]) => {
      const result = req(repositoryRoot, "new", ...arguments_, "--json");
      expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
      return JSON.parse(result.stdout).created as {
        id: string;
        revisionId: string;
      };
    };
    const product = create(
      "PSP",
      "--scenario",
      "compile-psp@2",
      "--set",
      "title=Ambiguous report export",
      "--set",
      "rationale=Initial intent needs independent correction",
      "--set",
      "problem=Report outcomes are not portable",
      "--set",
      'users=["report author"]',
      "--set",
      'goals=["export reports"]',
      "--set",
      "non_goals=[]",
      "--set",
      'success_measures=["exports complete"]',
    );
    const contextResult = req(
      repositoryRoot,
      "baseline",
      "create",
      "--type",
      "BSL",
      "--scenario",
      "create-review-context@1",
      "--set",
      "title=Failed PSP review context",
      "--set",
      "kind=review-context",
      "--set",
      "role=review-context",
      "--set",
      `scope=${product.revisionId}`,
      "--set",
      "group=DEFAULT",
      "--json",
    );
    expect(contextResult.status, contextResult.stderr).toBe(0);
    const context = JSON.parse(contextResult.stdout).created as {
      id: string;
      revisionId: string;
    };
    expect(req(
      repositoryRoot,
      "baseline",
      "add",
      context.id,
      product.revisionId,
      "--json",
    ).status).toBe(0);
    expect(req(
      repositoryRoot,
      "baseline",
      "freeze",
      context.id,
      "--json",
    ).status).toBe(0);
    const failedReviewWorkResult = req(
      repositoryRoot,
      "loose-ends",
      "--phase",
      "phase-0-wayfinding",
      "--json",
    );
    expect(failedReviewWorkResult.status, failedReviewWorkResult.stderr).toBe(0);
    const failedReviewWork = JSON.parse(failedReviewWorkResult.stdout)
      .looseEnds.items.find(
        (item: any) => item.obligation === "passing-review-required" &&
          item.subject === product.revisionId,
      );
    expect(failedReviewWork).toEqual(expect.objectContaining({ dispatchable: true }));
    const failedReviewAdapter = path.join(repositoryRoot, "failed-review-adapter.mjs");
    await fs.writeFile(
      failedReviewAdapter,
      `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify({
        outputs: [{
          name: "review",
          invocation: 0,
          lifecycleDatum: {
            type: "REV",
            payload: {
              title: "Failed review of ambiguous export intent",
              rubric_ref: "policies/rubrics/bootstrap-review.md@1",
              findings: [{
                id: "F-001",
                target: product.revisionId,
                relationship: "primary",
                severity: "blocking",
                summary: "Export scope is ambiguous",
              }],
              outcome: "fail",
            },
            links: [
              { type: "reviews", target: product.revisionId },
              { type: "contextualizes", target: context.revisionId },
            ],
            body: "Independent Review found ambiguous scope.\\n",
          },
        }],
        completionEvidence: { summary: "Independent Review failed." },
      }))});\n`,
      { mode: 0o755 },
    );
    const failedReview = req(
      repositoryRoot,
      "scenario",
      "execute",
      "review-datum-in-context@2",
      "--obligation",
      failedReviewWork.id,
      "--authorize",
      "independent-reviewer",
      "--adapter",
      failedReviewAdapter,
      "--input",
      `subject=${product.revisionId}`,
      "--input",
      `review_context=${context.revisionId}`,
      "--json",
    );
    expect(failedReview.status, `${failedReview.stderr}${failedReview.stdout}`).toBe(0);
    const failedReviewRevision = JSON.parse(failedReview.stdout).execution.outputs[0]
      .lifecycleDatum.revisionId as string;

    const looseEnds = req(
      repositoryRoot,
      "loose-ends",
      "--phase",
      "phase-0-wayfinding",
      "--json",
    );
    expect(looseEnds.status, looseEnds.stderr).toBe(0);
    const correction = JSON.parse(looseEnds.stdout).looseEnds.items.find(
      (item: any) => item.obligation === "foundation-review-correction-required",
    );
    expect(correction).toEqual(expect.objectContaining({
      subject: product.revisionId,
      status: "ready",
      dispatchable: true,
      actionableResolver: "revise-foundation-after-review@5",
    }));
    expect(JSON.parse(looseEnds.stdout).looseEnds.items.some((item: any) =>
      item.subject === product.revisionId &&
      ["review-context-required", "passing-review-required"].includes(
        item.obligation,
      )
    )).toBe(false);

    const adapterPath = path.join(repositoryRoot, "foundation-correction-adapter.mjs");
    await fs.writeFile(
      adapterPath,
      `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify({
        outputs: [{
          name: "replacement",
          invocation: 0,
          lifecycleDatum: {
            id: product.id,
            type: "PSP",
            payload: {
              title: "Bounded report export",
              rationale: "The failed Review identified and bounded the export scope",
              problem: "Report authors cannot carry one completed report into another tool",
              users: ["report author"],
              goals: ["export one representative completed report"],
              non_goals: ["general integration platform"],
              success_measures: ["one report exports with visible content"],
            },
            links: [{ type: "corrects-review", target: failedReviewRevision }],
            body: "Corrected after exact failed Review.\\n",
          },
        }],
        completionEvidence: { summary: "The failed Review finding was corrected." },
      }))});\n`,
      { mode: 0o755 },
    );
    const revised = req(
      repositoryRoot,
      "scenario",
      "execute",
      "revise-foundation-after-review@5",
      "--obligation",
      correction.id,
      "--adapter",
      adapterPath,
      "--input",
      `subject=${product.revisionId}`,
      "--input",
      `failed_reviews=${failedReviewRevision}`,
      "--json",
    );
    expect(revised.status, `${revised.stderr}${revised.stdout}`).toBe(0);
    const replacement = JSON.parse(revised.stdout).execution.outputs[0]
      .lifecycleDatum as { revisionId: string };

    const afterCorrection = req(
      repositoryRoot,
      "loose-ends",
      "--phase",
      "phase-0-wayfinding",
      "--json",
    );
    expect(afterCorrection.status, afterCorrection.stderr).toBe(0);
    const items = JSON.parse(afterCorrection.stdout).looseEnds.items;
    expect(items.some((item: any) =>
      item.obligation === "passing-review-required" &&
      item.subject === product.revisionId
    )).toBe(false);
    const replacementContextWork = items.find((item: any) =>
      item.obligation === "review-context-required" &&
      item.subject === replacement.revisionId
    );
    expect(replacementContextWork).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
    }));

    const contextAdapter = path.join(repositoryRoot, "replacement-context-adapter.mjs");
    await fs.writeFile(
      contextAdapter,
      `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify({
        outputs: [{
          name: "context",
          invocation: 0,
          lifecycleDatum: {
            type: "BSL",
            payload: {
              title: "Corrected PSP review context",
              kind: "review-context",
              role: "review-context",
              scope: replacement.revisionId,
              group: "DEFAULT",
              definition_members: [replacement.revisionId],
              evidence: [],
            },
            links: [],
            body: "Fresh context for the replacement Revision.\\n",
          },
        }],
        completionEvidence: { summary: "The replacement context was frozen." },
      }))});\n`,
      { mode: 0o755 },
    );
    const contextualized = req(
      repositoryRoot,
      "scenario",
      "execute",
      "create-review-context@1",
      "--obligation",
      replacementContextWork.id,
      "--adapter",
      contextAdapter,
      "--input",
      `subject=${replacement.revisionId}`,
      "--json",
    );
    expect(
      contextualized.status,
      `${contextualized.stderr}${contextualized.stdout}`,
    ).toBe(0);
    const replacementContext = JSON.parse(contextualized.stdout).execution.outputs[0]
      .lifecycleDatum as { revisionId: string };

    const reviewWorkResult = req(
      repositoryRoot,
      "loose-ends",
      "--phase",
      "phase-0-wayfinding",
      "--json",
    );
    expect(reviewWorkResult.status, reviewWorkResult.stderr).toBe(0);
    const reviewWork = JSON.parse(reviewWorkResult.stdout).looseEnds.items.find(
      (item: any) => item.obligation === "passing-review-required" &&
        item.subject === replacement.revisionId,
    );
    expect(reviewWork).toEqual(expect.objectContaining({
      status: "awaiting-review",
      dispatchable: true,
    }));
    const reviewAdapter = path.join(repositoryRoot, "replacement-review-adapter.mjs");
    await fs.writeFile(
      reviewAdapter,
      `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify({
        outputs: [{
          name: "review",
          invocation: 0,
          lifecycleDatum: {
            type: "REV",
            payload: {
              title: "Passing Review of corrected PSP",
              rubric_ref: "policies/rubrics/bootstrap-review.md@1",
              findings: [],
              outcome: "pass",
            },
            links: [
              { type: "reviews", target: replacement.revisionId },
              { type: "contextualizes", target: replacementContext.revisionId },
            ],
            body: "The corrected exact Revision passes.\\n",
          },
        }],
        completionEvidence: { summary: "The replacement passed Review." },
      }))});\n`,
      { mode: 0o755 },
    );
    const reviewed = req(
      repositoryRoot,
      "scenario",
      "execute",
      "review-datum-in-context@2",
      "--obligation",
      reviewWork.id,
      "--authorize",
      "independent-reviewer",
      "--adapter",
      reviewAdapter,
      "--input",
      `subject=${replacement.revisionId}`,
      "--input",
      `review_context=${replacementContext.revisionId}`,
      "--json",
    );
    expect(reviewed.status, `${reviewed.stderr}${reviewed.stdout}`).toBe(0);

    const completed = req(
      repositoryRoot,
      "loose-ends",
      "--phase",
      "phase-0-wayfinding",
      "--json",
    );
    expect(completed.status, completed.stderr).toBe(0);
    expect(JSON.parse(completed.stdout).looseEnds.items.some((item: any) =>
      [product.revisionId, replacement.revisionId].includes(item.subject) &&
      [
        "foundation-review-correction-required",
        "review-context-required",
        "passing-review-required",
      ].includes(item.obligation)
    )).toBe(false);
  }, 15_000);

  it("moves one exact intent slice through contextual review and reviewed gate sign-off", async () => {
    let adapterSequence = 0;
    const create = (...arguments_: string[]) => {
      const result = req(repositoryRoot, "new", ...arguments_, "--json");
      expect(result.status, result.stderr).toBe(0);
      return JSON.parse(result.stdout).created as {
        id: string;
        revisionId: string;
      };
    };
    const looseEnds = () => {
      const result = req(
        repositoryRoot,
        "loose-ends",
        "--phase",
        "phase-0-wayfinding",
        "--json",
      );
      expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
      return JSON.parse(result.stdout).looseEnds.items as any[];
    };
    const looseEnd = (obligation: string, subject: string) => {
      const item = looseEnds().find((candidate) =>
        candidate.obligation === obligation.split("@")[0] && candidate.subject === subject
      );
      expect(item).toBeDefined();
      return item as any;
    };
    const adapter = async (response: unknown, label: string) => {
      adapterSequence += 1;
      const executable = path.join(
        repositoryRoot,
        `${String(adapterSequence).padStart(2, "0")}-${label}.mjs`,
      );
      const capture = `${executable}.request.json`;
      await fs.writeFile(
        executable,
        `#!/usr/bin/env node\nimport fs from "node:fs";\nconst input = fs.readFileSync(0, "utf8");\nfs.writeFileSync(${JSON.stringify(capture)}, input);\nprocess.stdout.write(${JSON.stringify(JSON.stringify(response))});\n`,
        { mode: 0o755 },
      );
      return { executable, capture };
    };
    const reviewContext = async (title: string, subjects: string[]) => {
      const obligation = looseEnd("review-context-required@2", subjects[0]!);
      expect(obligation).toEqual(expect.objectContaining({
        status: "ready",
        dispatchable: true,
        actionableResolver: "create-review-context@1",
      }));
      const configured = await adapter({
        outputs: [{
          name: "context",
          invocation: 0,
          lifecycleDatum: {
            type: "BSL",
            payload: {
              title,
              kind: "review-context",
              role: "review-context",
              scope: subjects[0],
              group: "DEFAULT",
              definition_members: subjects,
              evidence: [],
            },
            links: [],
            body: `Exact frozen context for ${subjects.join(", ")}.\n`,
          },
        }],
        completionEvidence: { summary: "The exact review context was frozen." },
      }, "review-context");
      const executed = req(
        repositoryRoot,
        "scenario",
        "execute",
        "create-review-context@1",
        "--obligation",
        obligation.id,
        "--adapter",
        configured.executable,
        "--input",
        `subject=${subjects[0]}`,
        "--json",
      );
      expect(executed.status, `${executed.stderr}${executed.stdout}`).toBe(0);
      return JSON.parse(executed.stdout).execution.outputs[0].lifecycleDatum as {
        id: string;
        revisionId: string;
      };
    };
    const review = async (
      subject: string,
      context: string,
      reviewKind = "contextual",
    ) => {
      const obligation = looseEnd("passing-review-required@2", subject);
      expect(obligation).toEqual(expect.objectContaining({
        status: "awaiting-review",
        dispatchable: true,
        actionableResolver: "review-datum-in-context@2",
      }));
      const configured = await adapter({
        outputs: [{
          name: "review",
          invocation: 0,
          lifecycleDatum: {
            type: "REV",
            payload: {
              title: `Independent review of ${subject}`,
              review_kind: reviewKind,
              rubric_ref: "policies/rubrics/bootstrap-review.md@1",
              ...(reviewKind === "simplification-product-definition"
                ? {}
                : { findings: [] }),
              outcome: "pass",
            },
            links: [
              { type: "reviews", target: subject },
              { type: "contextualizes", target: context },
            ],
            body: `The exact subject ${subject} passes in ${context}.\n`,
          },
        }],
        completionEvidence: { summary: "Independent contextual review passed." },
      }, "review");
      const executed = req(
        repositoryRoot,
        "scenario",
        "execute",
        "review-datum-in-context@2",
        "--obligation",
        obligation.id,
        "--authorize",
        "independent-reviewer",
        "--adapter",
        configured.executable,
        "--input",
        `subject=${subject}`,
        "--input",
        `review_context=${context}`,
        "--json",
      );
      expect(executed.status, executed.stderr).toBe(0);
      return JSON.parse(executed.stdout).execution.outputs[0].lifecycleDatum
        .revisionId as string;
    };

    const initialMapWork = looseEnd(
      "initial-wayfinding-map-required@1",
      "phase-0-wayfinding@4",
    );
    expect(initialMapWork).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "establish-initial-wayfinding-map@1",
    }));
    const mapAdapter = await adapter({
      outputs: [{
        name: "map",
        invocation: 0,
        lifecycleDatum: {
          type: "MAP",
          payload: {
            title: "Representative export frontier",
            purpose: "Decide the smallest useful report export",
            frontier: ["review exact product intent"],
          },
          links: [],
          body: "Initial package-discovered frontier.\n",
        },
      }],
      completionEvidence: { summary: "The initial frontier was charted." },
    }, "initial-map");
    const establishedMap = req(
      repositoryRoot,
      "scenario",
      "execute",
      "establish-initial-wayfinding-map@1",
      "--obligation",
      initialMapWork.id,
      "--adapter",
      mapAdapter.executable,
      "--json",
    );
    expect(establishedMap.status, `${establishedMap.stderr}${establishedMap.stdout}`).toBe(0);
    const map = JSON.parse(establishedMap.stdout).execution.outputs[0]
      .lifecycleDatum as { id: string; revisionId: string };

    const productWork = looseEnd(
      "product-specification-required@1",
      "phase-0-wayfinding@4",
    );
    expect(productWork).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "compile-psp@2",
    }));
    const productAdapter = await adapter({
      outputs: [{
        name: "product_specification",
        invocation: 0,
        lifecycleDatum: {
          type: "PSP",
          payload: {
            title: "Representative report export",
            rationale: "A narrow export answers the observed user need",
            problem: "Users cannot carry one completed report into another tool",
            users: ["report author"],
            goals: ["export one representative completed report"],
            non_goals: ["general integration platform"],
            success_measures: ["one report exports with its visible content"],
          },
          links: [],
          body: "Smallest useful product intent.\n",
        },
      }],
      completionEvidence: { summary: "The product specification was compiled." },
    }, "product-specification");
    const compiledProduct = req(
      repositoryRoot,
      "scenario",
      "execute",
      "compile-psp@2",
      "--obligation",
      productWork.id,
      "--adapter",
      productAdapter.executable,
      "--json",
    );
    expect(compiledProduct.status, `${compiledProduct.stderr}${compiledProduct.stdout}`).toBe(0);
    const product = JSON.parse(compiledProduct.stdout).execution.outputs[0]
      .lifecycleDatum as { id: string; revisionId: string };
    const productContext = await reviewContext(
      "PSP review context before STK derivation",
      [product.revisionId],
    );

    const requirementWork = looseEnd(
      "stakeholder-requirements-required@1",
      product.revisionId,
    );
    expect(requirementWork).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "draft-stakeholder-requirements@2",
    }));
    const requirementAdapter = await adapter({
      outputs: [{
        name: "requirements",
        invocation: 0,
        lifecycleDatum: {
          type: "STK",
          payload: {
            title: "Export a completed report",
            rationale: "Report authors need portable outcomes",
            statement: "The product shall export one completed report with its visible content.",
            verification_intent: "Export a representative completed report.",
            stakeholder: "report author",
            priority: "must",
          },
          links: [{ type: "derived-from", target: product.id }],
          body: "One stakeholder-visible commitment.\n",
        },
      }],
      completionEvidence: { summary: "The stakeholder requirement was drafted." },
    }, "stakeholder-requirements");
    const draftedRequirements = req(
      repositoryRoot,
      "scenario",
      "execute",
      "draft-stakeholder-requirements@2",
      "--obligation",
      requirementWork.id,
      "--adapter",
      requirementAdapter.executable,
      "--input",
      `product_specification=${product.revisionId}`,
      "--json",
    );
    expect(
      draftedRequirements.status,
      `${draftedRequirements.stderr}${draftedRequirements.stdout}`,
    ).toBe(0);
    const stakeholder = JSON.parse(draftedRequirements.stdout).execution.outputs[0]
      .lifecycleDatum as { id: string; revisionId: string };

    const prototypeEvidence = {
      repository_ref: "git:0123456789abcdef0123456789abcdef01234567",
      supported_behavior: ["export one representative report"],
      unsupported_behavior: ["production persistence"],
      finding_if_supported: "Keep one representative export in the product intent",
      finding_if_not_supported: "Remove export behavior from the product intent",
    };
    const question = create(
      "QST",
      "--scenario",
      "chart-wayfinding-map@1",
      "--set",
      "title=Can a narrow export prove the interaction?",
      "--set",
      "kind=empirical",
      "--set",
      "question=Can one representative export prove the interaction?",
      "--set",
      "state=open",
      "--set",
      "blocking_impact=The export interaction remains uncertain",
      "--set",
      "resolution_evidence=prototype",
      "--set",
      `prototype_evidence=${JSON.stringify(prototypeEvidence)}`,
    );
    await freezeQuestionSource(repositoryRoot, question.revisionId);
    const prototypeWork = looseEnd(
      "prototype-question-resolution@1",
      question.revisionId,
    );
    const prototypeAdapter = await adapter({
      outputs: [
        {
          name: "prototype",
          invocation: 0,
          lifecycleDatum: {
            id: "ART-0000000001",
            type: "ART",
            payload: {
              title: "Export interaction spike",
              kind: "prototype",
              repository_ref: prototypeEvidence.repository_ref,
              supported_behavior: prototypeEvidence.supported_behavior,
              unsupported_behavior: prototypeEvidence.unsupported_behavior,
            },
            links: [{ type: "derived-from", target: question.revisionId }],
            body: "The representative export behavior was observed.\n",
          },
        },
        {
          name: "finding",
          invocation: 0,
          lifecycleDatum: {
            type: "DEC",
            payload: {
              title: "Use the narrow export interaction",
              rationale: "The exact prototype answered the empirical question",
              kind: "decision",
              decision: prototypeEvidence.finding_if_supported,
              alternatives: [prototypeEvidence.finding_if_not_supported],
              effective_scope: prototypeEvidence.repository_ref,
            },
            links: [
              { type: "resolves", target: question.revisionId },
              { type: "justifies", target: "ART-0000000001-r00001" },
            ],
            body: "The bounded prototype supports the narrow export.\n",
          },
        },
        {
          name: "updated_question",
          invocation: 0,
          lifecycleDatum: {
            id: question.id,
            type: "QST",
            payload: {
              title: "Can a narrow export prove the interaction?",
              kind: "empirical",
              question: "Can one representative export prove the interaction?",
              state: "answered",
              blocking_impact: "The export interaction remains uncertain",
              resolution_evidence: "prototype",
              prototype_evidence: prototypeEvidence,
            },
            links: [],
            body: "The exact prototype answered the question.\n",
          },
        },
      ],
      completionEvidence: { summary: "The exact prototype supported the declared finding." },
    }, "prototype-resolution");
    const resolvedPrototype = req(
      repositoryRoot,
      "scenario",
      "execute",
      "resolve-question-with-prototype@2",
      "--obligation",
      prototypeWork.id,
      "--adapter",
      prototypeAdapter.executable,
      "--input",
      `question=${question.revisionId}`,
      "--json",
    );
    expect(
      resolvedPrototype.status,
      `${resolvedPrototype.stderr}${resolvedPrototype.stdout}`,
    ).toBe(0);
    const prototypeOutputs = JSON.parse(resolvedPrototype.stdout).execution.outputs;
    const prototype = prototypeOutputs.find((output: any) => output.name === "prototype")
      .lifecycleDatum as { revisionId: string };
    const finding = prototypeOutputs.find((output: any) => output.name === "finding")
      .lifecycleDatum as { revisionId: string };
    const answeredQuestion = prototypeOutputs.find(
      (output: any) => output.name === "updated_question",
    ).lifecycleDatum as { revisionId: string };
    await fs.rm(path.join(repositoryRoot, ".lifecycle/generated"), {
      recursive: true,
      force: true,
    });
    const beforeContext = looseEnds();
    const readyContexts = beforeContext.filter((item) =>
      item.obligation === "review-context-required"
    );
    expect(readyContexts.map((item) => item.subject)).toEqual([
      map.revisionId,
      stakeholder.revisionId,
    ]);
    expect(readyContexts.every((item) => item.dispatchable)).toBe(true);
    expect(beforeContext).toContainEqual(expect.objectContaining({
      obligation: "passing-review-required",
      subject: product.revisionId,
      status: "awaiting-review",
      dispatchable: true,
      actionableResolver: "review-datum-in-context@2",
    }));
    expect(beforeContext.filter((item) =>
      item.obligation === "passing-review-required" &&
      item.subject !== product.revisionId
    ).every((item) => !item.dispatchable)).toBe(true);
    expect(beforeContext).toContainEqual(expect.objectContaining({
      obligation: "intent-candidate-required",
      status: "blocked",
      dispatchable: false,
    }));

    const mapContext = await reviewContext(
      "MAP review context",
      [map.revisionId],
    );
    const stakeholderContext = await reviewContext(
      "STK review context",
      [stakeholder.revisionId, product.revisionId],
    );
    expect(looseEnd("passing-review-required@2", product.revisionId)).toEqual(
      expect.objectContaining({
        status: "awaiting-review",
        dispatchable: true,
        actionableResolver: "review-datum-in-context@2",
      }),
    );
    const reviewTargets = [map.revisionId, product.revisionId, stakeholder.revisionId];
    for (const [subject, context] of [
      [map.revisionId, mapContext.revisionId],
      [product.revisionId, productContext.revisionId],
      [stakeholder.revisionId, stakeholderContext.revisionId],
    ] as const) {
      await review(subject, context);
    }

    const candidateWork = looseEnd(
      "intent-candidate-required@2",
      "phase-0-wayfinding@4",
    );
    expect(candidateWork).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "create-phase-0-intent-candidate@1",
    }));
    const incompleteCandidateAdapter = await adapter({
      outputs: [{
        name: "candidate",
        invocation: 0,
        lifecycleDatum: {
          type: "BSL",
          payload: {
            title: "Incomplete intent candidate",
            kind: "intent-level-candidate",
            role: "candidate",
            scope: "Phase 0 product intent",
            group: "DEFAULT",
            definition_members: [map.revisionId, product.revisionId],
            evidence: [],
          },
          links: [],
          body: "This candidate incorrectly omits the stakeholder requirement.\n",
        },
      }],
      completionEvidence: { summary: "An incomplete candidate was proposed." },
    }, "incomplete-intent-candidate");
    const rejectedCandidate = req(
      repositoryRoot,
      "scenario",
      "execute",
      "create-phase-0-intent-candidate@1",
      "--obligation",
      candidateWork.id,
      "--adapter",
      incompleteCandidateAdapter.executable,
      "--json",
    );
    expect(rejectedCandidate.status).toBe(1);
    expect(JSON.parse(rejectedCandidate.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "scenario-completion-failed" }),
    ]);

    const candidateAdapter = await adapter({
      outputs: [{
        name: "candidate",
        invocation: 0,
        lifecycleDatum: {
          type: "BSL",
          payload: {
            title: "Intent level candidate",
            kind: "intent-level-candidate",
            role: "candidate",
            scope: "Phase 0 product intent",
            group: "DEFAULT",
            definition_members: [
              map.revisionId,
              product.revisionId,
              stakeholder.revisionId,
            ],
            evidence: [
              prototype.revisionId,
              finding.revisionId,
              answeredQuestion.revisionId,
            ],
          },
          links: [],
          body: "Exact reviewed Phase 0 foundation candidate.\n",
        },
      }],
      completionEvidence: { summary: "The reviewed foundation was frozen." },
    }, "intent-candidate");
    const createdCandidate = req(
      repositoryRoot,
      "scenario",
      "execute",
      "create-phase-0-intent-candidate@1",
      "--obligation",
      candidateWork.id,
      "--adapter",
      candidateAdapter.executable,
      "--json",
    );
    expect(
      createdCandidate.status,
      `${createdCandidate.stderr}${createdCandidate.stdout}`,
    ).toBe(0);
    const candidate = JSON.parse(createdCandidate.stdout).execution.outputs[0]
      .lifecycleDatum as { id: string; revisionId: string };
    const candidateContext = await reviewContext(
      "Intent candidate review context",
      [candidate.revisionId, map.revisionId, product.revisionId, stakeholder.revisionId],
    );
    const candidateReview = await review(
      candidate.revisionId,
      candidateContext.revisionId,
      "simplification-product-definition",
    );

    const gate = looseEnd("candidate-gate-signoff@3", candidate.revisionId);
    expect(gate).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "record-gate-signoff@3",
    }));
    const gateAdapter = await adapter({
      outputs: [{
        name: "decision",
        invocation: 0,
        lifecycleDatum: {
          type: "DEC",
          payload: {
            title: "Approve the exact intent candidate",
            rationale: "All exact candidate members and the candidate passed review",
            kind: "gate-signoff",
            gate_outcome: "approve",
            decision: "Approve the exact candidate for the Phase 0 intent gate.",
            alternatives: ["Return the candidate for revision"],
            effective_scope: candidate.revisionId,
          },
          links: [{ type: "justifies", target: candidate.revisionId }],
          body: "Approval applies only to the exact candidate.\n",
        },
      }],
      completionEvidence: { summary: "The user approved the exact candidate." },
    }, "gate-signoff");
    const chatOnlyApproval = req(
      repositoryRoot,
      "scenario",
      "execute",
      "record-gate-signoff@3",
      "--obligation",
      gate.id,
      "--adapter",
      gateAdapter.executable,
      "--input",
      `candidate=${candidate.revisionId}`,
      "--json",
    );
    expect(chatOnlyApproval.status).toBe(1);
    expect(JSON.parse(chatOnlyApproval.stdout).diagnostics).toEqual([
      expect.objectContaining({
        code: "scenario-authority-required",
        message: expect.stringContaining("stakeholder"),
      }),
    ]);
    await expect(fs.stat(gateAdapter.capture)).rejects.toMatchObject({ code: "ENOENT" });

    const signedOff = req(
      repositoryRoot,
      "scenario",
      "execute",
      "record-gate-signoff@3",
      "--obligation",
      gate.id,
      "--authorize",
      "stakeholder",
      "--adapter",
      gateAdapter.executable,
      "--input",
      `candidate=${candidate.revisionId}`,
      "--json",
    );
    expect(signedOff.status, `${signedOff.stderr}${signedOff.stdout}`).toBe(0);
    const signedOffExecution = JSON.parse(signedOff.stdout).execution;
    expect(signedOffExecution).toEqual(expect.objectContaining({
      contract: "mdlm-scenario-execution@3",
      authority: {
        supplied: ["stakeholder"],
        delegations: [],
        requirements: [{
          invocation: 0,
          policy: "gate-signoff-participation@1",
          mode: "attended",
          authority: "stakeholder",
          delegationAllowed: false,
          evidence: { output: "decision", type: "DEC" },
        }],
      },
    }));
    expect(JSON.parse(await fs.readFile(gateAdapter.capture, "utf8"))).toEqual(
      expect.objectContaining({
        contract: "mdlm-agent-adapter@3",
        authority: signedOffExecution.authority,
      }),
    );
    const shownSignoffExecution = req(
      repositoryRoot,
      "scenario",
      "execution",
      "show",
      signedOffExecution.id,
    );
    expect(shownSignoffExecution.status, shownSignoffExecution.stderr).toBe(0);
    expect(shownSignoffExecution.stdout).toContain("Authority Supplied: stakeholder");
    expect(shownSignoffExecution.stdout).toContain(
      "Authority Evidence [gate-signoff-participation@1]: decision (DEC)",
    );
    const signoff = signedOffExecution.outputs.find(
      (output: any) => output.name === "decision",
    ).lifecycleDatum as { revisionId: string };

    const awaitingReviewGate = looseEnd(
      "candidate-gate-signoff@3",
      candidate.revisionId,
    );
    expect(awaitingReviewGate).toEqual(expect.objectContaining({
      status: "blocked",
      dispatchable: false,
      eventualResolver: "record-gate-signoff@3",
      actionableResolver: "create-review-context@1",
      blockedBy: [expect.stringContaining(`:${signoff.revisionId}:`)],
    }));
    const duplicateAdapter = await adapter({ outputs: [], completionEvidence: {} }, "duplicate");
    const duplicate = req(
      repositoryRoot,
      "scenario",
      "execute",
      "record-gate-signoff@3",
      "--obligation",
      gate.id,
      "--adapter",
      duplicateAdapter.executable,
      "--input",
      `candidate=${candidate.revisionId}`,
      "--json",
    );
    expect(duplicate.status).toBe(1);
    expect(JSON.parse(duplicate.stdout).diagnostics).toEqual([
      expect.objectContaining({ code: "obligation-not-dispatchable" }),
    ]);
    await expect(fs.stat(duplicateAdapter.capture)).rejects.toMatchObject({ code: "ENOENT" });
    const gateLooseEnds = req(
      repositoryRoot,
      "loose-ends",
      "--phase",
      "phase-0-wayfinding",
      "--json",
    );
    expect(gateLooseEnds.status, gateLooseEnds.stderr).toBe(0);
    expect(JSON.parse(gateLooseEnds.stdout).looseEnds.items[0]).toEqual(expect.objectContaining({
      subject: signoff.revisionId,
      actionableResolver: "create-review-context@1",
      dispatchable: true,
    }));

    await fs.writeFile(path.join(repositoryRoot, ".mdlm-phase"), "phase-1-product-assurance\n");
    const unaffectedByPointerEdit = req(
      repositoryRoot,
      "phase",
      "status",
      "--json",
    );
    expect(unaffectedByPointerEdit.status, unaffectedByPointerEdit.stderr).toBe(0);
    expect(JSON.parse(unaffectedByPointerEdit.stdout).phaseStatus).toEqual(
      expect.objectContaining({
        id: "phase-0-wayfinding",
        progression: expect.objectContaining({
          authorized: false,
          complete: false,
        }),
      }),
    );

    const signoffContext = await reviewContext(
      "Gate sign-off review context",
      [signoff.revisionId],
    );
    const signoffReview = await review(signoff.revisionId, signoffContext.revisionId);

    const awaitingAcceptance = req(
      repositoryRoot,
      "phase",
      "status",
      "phase-0-wayfinding",
      "--json",
    );
    expect(awaitingAcceptance.status, awaitingAcceptance.stderr).toBe(0);
    expect(JSON.parse(awaitingAcceptance.stdout).phaseStatus.progression)
      .toEqual(expect.objectContaining({ complete: false }));

    const acceptanceWork = looseEnd("intent-approval-required@1", candidate.revisionId);
    expect(acceptanceWork).toEqual(expect.objectContaining({
      status: "ready",
      dispatchable: true,
      actionableResolver: "accept-phase-0-intent@1",
    }));
    const acceptanceAdapter = await adapter({
      outputs: [{
        name: "accepted_intent",
        invocation: 0,
        lifecycleDatum: {
          type: "BSL",
          payload: {
            title: "Accepted exact Phase 0 intent",
            kind: "intent-approved",
            role: "accepted",
            scope: "Phase 0 product intent",
            group: "DEFAULT",
            definition_members: [
              map.revisionId,
              product.revisionId,
              stakeholder.revisionId,
            ],
            evidence: [candidateReview, signoff.revisionId, signoffReview],
          },
          links: [{ type: "promotes", target: candidate.revisionId }],
          body: "Reviewed gate authority accepts this exact intent.\n",
        },
      }],
      completionEvidence: { summary: "Accepted intent was frozen exactly." },
    }, "accepted-intent");
    const accepted = req(
      repositoryRoot,
      "scenario",
      "execute",
      "accept-phase-0-intent@1",
      "--obligation",
      acceptanceWork.id,
      "--adapter",
      acceptanceAdapter.executable,
      "--json",
    );
    expect(accepted.status, `${accepted.stderr}${accepted.stdout}`).toBe(0);

    const phase = req(
      repositoryRoot,
      "phase",
      "status",
      "phase-0-wayfinding",
      "--json",
    );
    expect(phase.status, phase.stderr).toBe(0);
    expect(JSON.parse(phase.stdout).phaseStatus).toEqual(expect.objectContaining({
      entry: expect.objectContaining({ satisfied: true }),
      progression: expect.objectContaining({
        nextPhase: "phase-1-product-assurance",
        complete: true,
      }),
      gate: {
        required: true,
        evaluations: [expect.objectContaining({
          candidate: expect.objectContaining({
            identity: expect.objectContaining({ revision_id: candidate.revisionId }),
          }),
          complete: true,
          status: "satisfied",
          dispatchable: false,
        })],
      },
    }));

    const continued = req(repositoryRoot, "phase", "status", "--json");
    expect(continued.status, continued.stderr).toBe(0);
    expect(JSON.parse(continued.stdout).phaseStatus.id).toBe(
      "phase-1-product-assurance",
    );

    const listed = req(repositoryRoot, "list", "--json");
    expect(listed.status, listed.stderr).toBe(0);
    const reviews = JSON.parse(listed.stdout).data.filter((item: any) =>
      item.lifecycleDatum.datum.type === "REV"
    );
    const expectedReviewTargets = [
      ...reviewTargets,
      candidate.revisionId,
      signoff.revisionId,
    ].sort();
    expect(reviews.map((item: any) =>
      item.lifecycleDatum.datum.links.find((link: any) => link.type === "reviews").target
    ).sort()).toEqual(expectedReviewTargets);
    expect(reviews.every((item: any) =>
      item.lifecycleDatum.storage.frozen === true &&
      item.lifecycleDatum.storage.editable === false
    )).toBe(true);
    const exactContexts = [
      mapContext.revisionId,
      productContext.revisionId,
      stakeholderContext.revisionId,
      candidateContext.revisionId,
      signoffContext.revisionId,
    ];
    expect(reviews.every((item: any) => {
      const context = item.lifecycleDatum.datum.links.find(
        (link: any) => link.type === "contextualizes",
      );
      return exactContexts.includes(context?.target);
    })).toBe(true);
    for (const context of exactContexts) {
      const shown = req(repositoryRoot, "show", context, "--json");
      expect(shown.status, shown.stderr).toBe(0);
      expect(JSON.parse(shown.stdout).lifecycleDatum.storage).toEqual({
        editable: false,
        frozen: true,
      });
    }
    const doctor = req(repositoryRoot, "doctor", "--json");
    expect(doctor.status, doctor.stderr).toBe(0);
  }, 100_000);
});
