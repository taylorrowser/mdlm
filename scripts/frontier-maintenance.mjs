import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { sleep as defaultSleep } from "./frontier-time.mjs";

export function maintenanceBoundaryIsSafe(state) {
  return !state?.currentIssue && !state?.worktree && !state?.branch;
}

export function createMaintenanceController(root, { sleep = defaultSleep } = {}) {
  const requestPath = join(root, "MAINTENANCE");
  const cancelPath = join(root, "MAINTENANCE-CANCELLED");
  const stopPath = join(root, "STOP");
  const acknowledgedPath = join(root, "MAINTENANCE-ACKNOWLEDGED");
  const gatePath = join(root, "MAINTENANCE-GATE");

  function withGate(operation) {
    mkdirSync(root, { recursive: true });
    let acquired = false;
    for (let attempt = 0; attempt < 300; attempt += 1) {
      const result = spawnSync("shlock", ["-f", gatePath, "-p", String(process.pid)], {
        encoding: "utf8",
        timeout: 5_000,
      });
      if (result.error) throw new Error(`shlock: ${result.error.message}`);
      if (result.status === 0) {
        acquired = true;
        break;
      }
      sleep(100);
    }
    if (!acquired) throw new Error(`Timed out acquiring the frontier maintenance gate; preserved owner ${readFileSync(gatePath, "utf8").trim()}`);
    try {
      return operation();
    } finally {
      let currentOwner;
      try {
        currentOwner = readFileSync(gatePath, "utf8").trim();
      } catch {
        currentOwner = null;
      }
      if (currentOwner === String(process.pid)) rmSync(gatePath, { force: true });
    }
  }

  return {
    requested: () => existsSync(requestPath),
    requestReload: (eligible = () => true) => withGate(() => {
      if (existsSync(stopPath)) throw new Error("Cannot request a safe reload after an explicit stop");
      if (!eligible()) return false;
      rmSync(cancelPath, { force: true });
      writeFileSync(requestPath, `${new Date().toISOString()}\n`, { mode: 0o600 });
      return true;
    }),
    stop: () => withGate(() => {
      writeFileSync(stopPath, `${new Date().toISOString()}\n`, { mode: 0o600 });
      writeFileSync(cancelPath, `${new Date().toISOString()}\n`, { mode: 0o600 });
      rmSync(requestPath, { force: true });
      rmSync(acknowledgedPath, { force: true });
    }),
    clearForManualStart: () => withGate(() => {
      rmSync(requestPath, { force: true });
      rmSync(cancelPath, { force: true });
      rmSync(stopPath, { force: true });
      rmSync(acknowledgedPath, { force: true });
    }),
    reserveOrDrain: (state, reserve) => withGate(() => {
      if (existsSync(stopPath)) return { drain: false, stopped: true };
      if (existsSync(requestPath) && maintenanceBoundaryIsSafe(state)) return { drain: true, stopped: false };
      return { drain: false, stopped: false, value: reserve() };
    }),
    reloadPermitted: () => withGate(() => existsSync(requestPath) && !existsSync(cancelPath) && !existsSync(stopPath)),
    acknowledgeReload: (authorized) => withGate(() => {
      if (existsSync(cancelPath) || existsSync(stopPath)) return false;
      if (existsSync(acknowledgedPath)) return true;
      if (!authorized) return false;
      if (existsSync(requestPath)) {
        rmSync(acknowledgedPath, { force: true });
        renameSync(requestPath, acknowledgedPath);
      }
      return existsSync(acknowledgedPath);
    }),
    finishAcknowledgement: () => withGate(() => rmSync(acknowledgedPath, { force: true })),
  };
}
