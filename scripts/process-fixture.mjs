import { registerHooks } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      specifier.endsWith(".js") &&
      /\/(src|test\/helpers)\//.test(context.parentURL ?? "")
    ) {
      return nextResolve(`${specifier.slice(0, -3)}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const usage = `Usage: node scripts/process-fixture.mjs <build|check>

  build    Serialize the current .lifecycle/process into the ignored cache under
           node_modules/.cache/mdlm-canonical-process-package, keyed by the
           package and loader source digests, unless that entry already exists.
  check    Fail if a generated fixture artifact is tracked, build the cache
           entry when missing, and verify it against a fresh source load.
`;

const command = process.argv[2];
try {
  if (command === "build" || command === "check") {
    const helper = await import(
      pathToFileURL(
        path.join(process.cwd(), "test/helpers/canonical-process-package-fixture.ts"),
      ).href
    );
    const result = command === "build"
      ? await helper.ensureCanonicalProcessPackageFixture()
      : await helper.checkCanonicalProcessPackageFixture();
    const { reference, digest } = result.fixture.manifest.processPackage;
    process.stdout.write(
      `PROCESS_FIXTURE_OK package=${reference} digest=${digest} ` +
      `cache=${path.relative(process.cwd(), result.fixtureRoot)} ` +
      `built=${result.built}\n`,
    );
  } else if (command === "--help" || command === "help" || command === undefined) {
    process.stdout.write(usage);
    if (command === undefined) process.exitCode = 1;
  } else {
    throw new Error(`expected \`build\` or \`check\`\n\n${usage}`);
  }
} catch (error) {
  process.stderr.write(
    `Canonical Process Package fixture: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
