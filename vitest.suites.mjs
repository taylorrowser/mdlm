// Current supported behavior only. Historical qualification evidence remains in
// its owning release; deleted workflow tests are not a second supported suite.
const fast = [
  "array-expression", "change-assessment", "direct-domain", "direct-package", "direct-receipt",
  "kernel-cutover", "lifecycle-schema-diagnostics", "mdlm-cli-output",
  "release-candidate-gate", "requirement-trace-v2", "source-scopes",
];
const release = ["docker-verification-dialogue", "direct-lifecycle-public"];
export const rootTestManifest = Object.freeze([
  ...fast.map(name => ({file:`test/${name}.test.ts`, qualificationGate:"pr", runtimeClass:"cheap-in-process", weight:1})),
  ...release.map(name => ({file:`test/${name}.test.ts`, qualificationGate:"release", runtimeClass:"process-repository-safe", weight:1})),
].map(Object.freeze));
export const rootTestQualificationManifest = rootTestManifest;
export const testFiles = rootTestManifest.map(row => row.file);
export const rootVitestSuites = ["cheap-in-process", "process-repository-safe"].map(id => ({
  id, weight:1, files:rootTestManifest.filter(row => row.runtimeClass === id).map(row => row.file),
}));
export const mdlmPiTestFiles = [
  "packages/mdlm-pi/test/mdlm-client-v2.test.ts",
  "packages/mdlm-pi/test/operator-loop.test.ts",
];
