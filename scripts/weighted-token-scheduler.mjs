import { launchInProcessGroup } from "./frontier-process-group.mjs";

export class WeightedScheduleAbortedError extends Error {
  constructor(reason) {
    super("Weighted schedule was cancelled", { cause: reason });
    this.name = "WeightedScheduleAbortedError";
  }
}

export class WeightedScheduleTaskError extends Error {
  constructor(taskId, outcome, cause) {
    const detail = outcome?.startupError
      ?? (outcome?.signal ? `signal ${outcome.signal}` : `status ${outcome?.status ?? "unknown"}`);
    super(`Weighted schedule task ${taskId} failed with ${detail}`, { cause });
    this.name = "WeightedScheduleTaskError";
    this.taskId = taskId;
    this.status = outcome?.status ?? null;
    this.signal = outcome?.signal ?? null;
  }
}

function validateSchedule(tasks, capacity) {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new TypeError("Scheduler capacity must be a positive integer");
  }
  const identifiers = new Set();
  for (const task of tasks) {
    if (typeof task.id !== "string" || task.id.length === 0) {
      throw new TypeError("Every scheduled task must have a nonempty string id");
    }
    if (identifiers.has(task.id)) throw new TypeError(`Duplicate scheduled task id: ${task.id}`);
    identifiers.add(task.id);
    if (!Number.isInteger(task.weight) || task.weight <= 0) {
      throw new TypeError(`Task ${task.id} weight must be a positive integer`);
    }
    if (task.weight > capacity) {
      throw new TypeError(`Task ${task.id} weight ${task.weight} exceeds scheduler capacity ${capacity}`);
    }
  }
}

function taskFailed(outcome) {
  return outcome?.startupError != null || outcome?.status !== 0;
}

async function cancelRunning(running, onEvent, activeWeight) {
  const cancellations = [];
  for (const { task, handle } of running.values()) {
    onEvent({ type: "cancel", taskId: task.id, activeWeight });
    cancellations.push(Promise.resolve().then(() => handle.terminate()));
  }
  await Promise.allSettled(cancellations);
  await Promise.allSettled([...running.values()].map(({ completion }) => completion));
}

export function simulateWeightedSchedule(tasks, options) {
  const capacity = options?.capacity;
  validateSchedule(tasks, capacity);
  const pending = tasks.map((task) => ({ ...task }));
  const running = [];
  const launches = [];
  let activeWeight = 0;
  let maximumActiveWeight = 0;
  let nowMs = 0;

  while (pending.length > 0 || running.length > 0) {
    let nextIndex = pending.findIndex((task) => task.weight <= capacity - activeWeight);
    while (nextIndex >= 0) {
      const [task] = pending.splice(nextIndex, 1);
      if (!Number.isFinite(task.estimatedDurationMs) || task.estimatedDurationMs <= 0) {
        throw new TypeError(`Task ${task.id} estimatedDurationMs must be finite and positive`);
      }
      activeWeight += task.weight;
      maximumActiveWeight = Math.max(maximumActiveWeight, activeWeight);
      running.push({ ...task, completesAtMs: nowMs + task.estimatedDurationMs });
      launches.push({ atMs: nowMs, taskId: task.id, activeWeight });
      nextIndex = pending.findIndex((candidate) => candidate.weight <= capacity - activeWeight);
    }
    if (running.length === 0) throw new Error("Weighted schedule simulation made no progress");
    nowMs = Math.min(...running.map((task) => task.completesAtMs));
    for (let index = running.length - 1; index >= 0; index -= 1) {
      if (running[index].completesAtMs === nowMs) {
        activeWeight -= running[index].weight;
        running.splice(index, 1);
      }
    }
  }

  return { launches, maximumActiveWeight, wallMs: nowMs };
}

export async function runWeightedSchedule(tasks, options) {
  const capacity = options?.capacity;
  const launch = options?.launch;
  const onEvent = options?.onEvent ?? (() => {});
  const signal = options?.signal;
  validateSchedule(tasks, capacity);
  if (typeof launch !== "function") throw new TypeError("Scheduler launch must be a function");

  const pending = [...tasks];
  const running = new Map();
  const settledQueue = [];
  const completedTaskIds = [];
  const aborted = Symbol("aborted");
  let activeWeight = 0;
  let launchOrder = 0;
  let notifyAbort;
  let notifySettlement;
  const abortReached = new Promise((resolve) => { notifyAbort = () => resolve(aborted); });
  signal?.addEventListener("abort", notifyAbort, { once: true });

  try {
    if (signal?.aborted) throw new WeightedScheduleAbortedError(signal.reason);
    while (pending.length > 0 || running.size > 0) {
      if (settledQueue.length > 0) {
        const settledBatch = settledQueue.splice(0).sort((left, right) => left.order - right.order);
        let failure;
        for (const settled of settledBatch) {
          const record = running.get(settled.task.id);
          if (!record) continue;
          running.delete(settled.task.id);
          activeWeight -= settled.task.weight;
          onEvent({ type: "complete", taskId: settled.task.id, activeWeight });
          if (taskFailed(settled.outcome)) {
            failure ??= settled;
          } else {
            await record.handle.terminate();
            completedTaskIds.push(settled.task.id);
          }
        }
        if (failure) {
          await cancelRunning(running, onEvent, activeWeight);
          throw new WeightedScheduleTaskError(failure.task.id, failure.outcome, failure.error);
        }
        // Completion and termination callbacks may have settled more peers.
        // Drain them before admitting any new task.
        continue;
      }

      if (signal?.aborted) {
        await cancelRunning(running, onEvent, activeWeight);
        throw new WeightedScheduleAbortedError(signal.reason);
      }

      let nextIndex = pending.findIndex((task) => task.weight <= capacity - activeWeight);
      while (nextIndex >= 0 && !signal?.aborted && settledQueue.length === 0) {
        const [task] = pending.splice(nextIndex, 1);
        let handle;
        try {
          handle = launch(task);
          if (!handle || typeof handle.terminate !== "function" || !(handle.completion instanceof Promise)) {
            throw new TypeError(`Launcher returned an invalid handle for ${task.id}`);
          }
        } catch (error) {
          await cancelRunning(running, onEvent, activeWeight);
          throw new WeightedScheduleTaskError(task.id, { status: 1, signal: null, startupError: error.message }, error);
        }
        activeWeight += task.weight;
        onEvent({ type: "launch", taskId: task.id, activeWeight });
        const order = launchOrder;
        launchOrder += 1;
        const enqueueSettlement = (settled) => {
          settledQueue.push(settled);
          notifySettlement?.();
          return settled;
        };
        const completion = handle.completion.then(
          (outcome) => enqueueSettlement({ outcome, order, task }),
          (error) => enqueueSettlement({ error, order, outcome: { status: 1, signal: null, startupError: error instanceof Error ? error.message : String(error) }, task }),
        );
        running.set(task.id, { completion, handle, task });
        // Observe an already-settled launch before admitting another task.
        await Promise.resolve();
        nextIndex = pending.findIndex((candidate) => candidate.weight <= capacity - activeWeight);
      }

      if (settledQueue.length > 0) continue;
      if (signal?.aborted) continue;
      if (running.size === 0) throw new Error("Weighted scheduler made no progress");

      const settlementReached = new Promise((resolve) => { notifySettlement = resolve; });
      const wake = await Promise.race([settlementReached, abortReached]);
      notifySettlement = undefined;
      if (wake === aborted) continue;
    }

    return { completedTaskIds };
  } finally {
    signal?.removeEventListener("abort", notifyAbort);
  }
}

export function launchProcessGroupTask(task, options = {}) {
  return launchInProcessGroup(task.command, task.args ?? [], {
    cwd: task.cwd ?? options.cwd,
    environment: { ...options.environment, ...task.environment },
    stdio: options.stdio ?? task.stdio,
    terminationGrace: options.terminationGrace,
  });
}
