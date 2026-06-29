import path from "node:path";
import { z } from "zod";
import { Collection } from "./db.js";
import { runSchema } from "../schemas.js";
import type { Run } from "../types.js";

const runsArray = z.array(runSchema);

const MAX_RUNS = 1000;

export class RunsRepo {
  private col: Collection<Run[]>;

  constructor(dataDir: string) {
    this.col = new Collection<Run[]>(
      path.join(dataDir, "runs.json"),
      runsArray as unknown as ConstructorParameters<typeof Collection<Run[]>>[1],
      () => [],
    );
  }

  async list(opts: { jobId?: string; limit?: number } = {}): Promise<Run[]> {
    const runs = await this.col.read();
    const filtered = opts.jobId ? runs.filter((r) => r.jobId === opts.jobId) : runs;
    return filtered
      .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
      .slice(0, opts.limit ?? 100);
  }

  async get(id: string): Promise<Run | null> {
    return (await this.col.read()).find((r) => r.id === id) ?? null;
  }

  async create(run: Run): Promise<void> {
    await this.col.update((runs) => {
      const next = [...runs, run];
      // Keep at most MAX_RUNS runs (drop oldest).
      if (next.length > MAX_RUNS) next.splice(0, next.length - MAX_RUNS);
      return next;
    });
  }

  async update(id: string, patch: Partial<Run>): Promise<void> {
    await this.col.update((runs) =>
      runs.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  }
}
