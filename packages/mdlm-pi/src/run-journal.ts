import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import type { JsonObject } from "./mdlm-client.js";

export type RunJournalRecord = {
  contract: "mdlm-pi-operation-journal@1";
  phase: "captured" | "submitting";
  kind: "proposal" | "execution";
  operation: string;
  proposalDigest: `sha256:${string}`;
  package: JsonObject;
  snapshot: string;
  transport: JsonObject;
};

/** The only durable harness state: whether submission may still be repeated. */
export class RunJournal {
  readonly #directory: string;
  readonly #file: string;

  constructor(directory: string) {
    this.#directory = directory;
    this.#file = path.join(directory, "submission.json");
  }

  async load(): Promise<RunJournalRecord | null> {
    let source: string;
    try {
      source = await readFile(this.#file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    const value: unknown = JSON.parse(source);
    if (!isRecord(value) || value.contract !== "mdlm-pi-operation-journal@1" ||
        !["captured", "submitting"].includes(String(value.phase)) ||
        typeof value.operation !== "string" || value.operation.length === 0 ||
        typeof value.proposalDigest !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value.proposalDigest) ||
        !isRecord(value.package) || typeof value.snapshot !== "string" || !isRecord(value.transport) ||
        !["proposal", "execution"].includes(String(value.kind))) {
      throw new Error(`Malformed submission journal: ${this.#file}`);
    }
    return value as RunJournalRecord;
  }

  async capture(
    operation: string,
    proposalDigest: `sha256:${string}`,
    boundary: { package: JsonObject; snapshot: string; transport: JsonObject },
    kind: "proposal" | "execution" = "proposal",
  ): Promise<void> {
    await this.#write({
      contract: "mdlm-pi-operation-journal@1",
      phase: "captured",
      kind,
      operation,
      proposalDigest,
      ...boundary,
    });
  }

  async beginSubmission(): Promise<void> {
    const current = await this.#required("captured");
    await this.#write({ ...current, phase: "submitting" });
  }

  async clear(): Promise<void> {
    await rm(this.#file, { force: true });
    await syncDirectory(this.#directory);
  }

  async #required(phase: RunJournalRecord["phase"]): Promise<RunJournalRecord> {
    const current = await this.load();
    if (current?.phase !== phase) throw new Error(`Submission journal must be '${phase}'`);
    return current;
  }

  async #write(record: RunJournalRecord): Promise<void> {
    await mkdir(this.#directory, { recursive: true, mode: 0o700 });
    const temporary = `${this.#file}.${randomUUID()}.tmp`;
    const file = await open(temporary, "wx", 0o600);
    try {
      await file.writeFile(`${JSON.stringify(record)}\n`);
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, this.#file);
    await syncDirectory(this.#directory);
  }
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(directory, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
