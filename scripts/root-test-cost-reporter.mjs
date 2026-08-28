import { writeFileSync } from "node:fs";
import path from "node:path";

export default class RootTestCostReporter {
  starts = new Map();

  onTestModuleStart(testModule) {
    this.starts.set(testModule.moduleId, performance.now());
  }

  onTestModuleEnd(testModule) {
    const startedAt = this.starts.get(testModule.moduleId);
    const observedDurationMs = startedAt == null
      ? null
      : Math.max(0, Math.round(performance.now() - startedAt));
    const durationMs = Number.isFinite(testModule.task.result?.duration)
      ? Math.round(testModule.task.result.duration)
      : observedDurationMs;
    const fragmentRoot = process.env.MDLM_TEST_COST_FRAGMENT_ROOT;
    if (!fragmentRoot || durationMs == null) return;
    const fragmentPath = path.join(
      fragmentRoot,
      `${testModule.relativeModuleId.replaceAll(/[^a-zA-Z0-9.-]/g, "_")}.json`,
    );
    writeFileSync(fragmentPath, `${JSON.stringify({
      file: testModule.relativeModuleId,
      durationMs,
      state: testModule.state(),
    })}\n`);
  }
}
