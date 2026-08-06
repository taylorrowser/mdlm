import { promises as fs } from "node:fs";
import path from "node:path";
import { copiedProcessPackage } from "./process-package.js";

const participationResultSchema = `result_schema:
  $schema: https://json-schema.org/draft/2020-12/schema
  type: object
  additionalProperties: false
  required: [authority_mode, authority, delegation_allowed, attention_timing, attention_checkpoint, consolidation_group]
  properties:
    authority_mode: {type: string, enum: [autonomous, delegated, attended]}
    authority: {type: string, minLength: 1}
    delegation_allowed: {type: boolean}
    attention_timing: {type: string, enum: [none, immediate, checkpoint]}
    attention_checkpoint: {type: [string, 'null']}
    consolidation_group: {type: [string, 'null']}`;

export async function participationProcessPackage(): Promise<string> {
  const processRoot = await copiedProcessPackage("mdlm-participation-process-");
  const manifestPath = path.join(processRoot, "manifest.yaml");
  const manifest = await fs.readFile(manifestPath, "utf8");
  await fs.writeFile(
    manifestPath,
    manifest
      .replace(
        "policies: [dependency-reassessment, review-applicability, waiver-applicability, contextual-review-participation, question-participation, gate-signoff-participation, consequential-decision-participation]",
        "policies: [dependency-reassessment, review-applicability, waiver-applicability, contextual-review-participation, question-participation, gate-signoff-participation, consequential-decision-participation, process-participation, baseline-participation]",
      )
      .replace("  selectors:\n", "  selectors:\n    - no-questions\n"),
  );
  await fs.writeFile(
    path.join(processRoot, "selectors/no-questions.yaml"),
    `kind: selector-definition
id: no-questions
version: 1
description: Resolve a valid empty optional QST input.
parameters: []
result_kind: revision
query:
  from: {collection: revisions, types: [QST]}
  as: question
  where: 'false'
`,
  );
  await fs.writeFile(
    path.join(processRoot, "policies/process-participation.yaml"),
    `kind: policy-definition
id: process-participation
version: 1
description: Permit autonomous explicitly initiated process work.
parameters:
  - {name: selected_process, kind: process}
${participationResultSchema}
default: &autonomous
  authority_mode: autonomous
  authority: process-authority
  delegation_allowed: false
  attention_timing: none
  attention_checkpoint: null
  consolidation_group: null
rules:
  - priority: 100
    when: 'selected_process.integrity.package_valid == true'
    result: *autonomous
`,
  );
  await fs.writeFile(
    path.join(processRoot, "policies/question-participation.yaml"),
    `kind: policy-definition
id: question-participation
version: 1
description: Determine authority and attention from one exact question.
parameters:
  - {name: question, kind: revision, types: [QST]}
  - {name: selected_phase, kind: phase}
${participationResultSchema}
default:
  authority_mode: attended
  authority: stakeholder
  delegation_allowed: false
  attention_timing: checkpoint
  attention_checkpoint: phase-0-gate
  consolidation_group: phase-0-stakeholder-questions
rules:
  - priority: 400
    when: 'question.payload.kind == "empirical" && question.payload.owner == "independent-reviewer"'
    result:
      authority_mode: delegated
      authority: independent-reviewer
      delegation_allowed: true
      attention_timing: none
      attention_checkpoint: null
      consolidation_group: null
  - priority: 300
    when: 'question.payload.kind == "empirical"'
    result:
      authority_mode: autonomous
      authority: evidence-authority
      delegation_allowed: false
      attention_timing: none
      attention_checkpoint: null
      consolidation_group: null
  - priority: 200
    when: 'question.payload.kind == "preferential" && exists("blocked-targets-for-question@1", {question: question})'
    result:
      authority_mode: attended
      authority: stakeholder
      delegation_allowed: false
      attention_timing: immediate
      attention_checkpoint: null
      consolidation_group: null
`,
  );

  await fs.writeFile(
    path.join(processRoot, "policies/baseline-participation.yaml"),
    `kind: policy-definition
id: baseline-participation
version: 1
description: Require stakeholder authority for an exact candidate baseline.
parameters:
  - {name: candidate, kind: baseline, types: [BSL]}
${participationResultSchema}
default: &attended
  authority_mode: attended
  authority: stakeholder
  delegation_allowed: false
  attention_timing: immediate
  attention_checkpoint: null
  consolidation_group: null
rules:
  - priority: 100
    when: 'candidate.storage.frozen == true'
    result: *attended
`,
  );

  const obligationPath = path.join(
    processRoot,
    "obligations/open-question-resolution.yaml",
  );
  const obligation = await fs.readFile(obligationPath, "utf8");
  await fs.writeFile(
    obligationPath,
    obligation
      .replace(
        "  - status: blocked\n    priority: 200",
        "  - status: ready\n    priority: 200",
      )
      .replace(
        "    question: question\nwaiver_policy_ref:",
        "    question: question\n    optional_context: 'select(\"no-questions@1\", {})'\nwaiver_policy_ref:",
      ),
  );

  const explicitScenarioPath = path.join(
    processRoot,
    "scenarios/chart-wayfinding-map.yaml",
  );
  const explicitScenario = await fs.readFile(explicitScenarioPath, "utf8");
  await fs.writeFile(
    explicitScenarioPath,
    explicitScenario.replace(
      "review_policy_ref: review-applicability@1\n",
      `review_policy_ref: review-applicability@1
participation:
  policy_ref: process-participation@1
  arguments:
    selected_process: process
`,
    ),
  );

  const gateScenarioPath = path.join(
    processRoot,
    "scenarios/record-gate-signoff.yaml",
  );
  const gateScenario = await fs.readFile(gateScenarioPath, "utf8");
  await fs.writeFile(
    gateScenarioPath,
    gateScenario.replace(
      "policy_ref: gate-signoff-participation@1",
      "policy_ref: baseline-participation@1",
    ),
  );

  const scenarioPath = path.join(processRoot, "scenarios/resolve-question.yaml");
  const scenario = await fs.readFile(scenarioPath, "utf8");
  await fs.writeFile(
    scenarioPath,
    scenario.replace(
      `    conditions: 'question.payload.state == "open"'
outputs:`,
      `  - name: optional_context
    types: [QST]
    cardinality: zero-or-more
    identity: revision
outputs:`,
    ),
  );
  return processRoot;
}
