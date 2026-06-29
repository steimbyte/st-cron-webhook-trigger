import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Collection } from "./db.js";
import { jobSchema, type CreateJobInput, type UpdateJobInput } from "../schemas.js";
import type { Job } from "../types.js";

const jobsArray = z.array(jobSchema);

export class JobsRepo {
  private col: Collection<Job[]>;

  constructor(dataDir: string) {
    this.col = new Collection<Job[]>(
      path.join(dataDir, "jobs.json"),
      jobsArray as unknown as ConstructorParameters<typeof Collection<Job[]>>[1],
      () => [],
    );
  }

  async list(): Promise<Job[]> {
    return this.col.read();
  }

  async get(id: string): Promise<Job | null> {
    return (await this.col.read()).find((j) => j.id === id) ?? null;
  }

  async findByName(name: string): Promise<Job | null> {
    return (await this.col.read()).find((j) => j.name === name) ?? null;
  }

  async create(input: CreateJobInput & { id?: string }): Promise<Job> {
    const now = new Date().toISOString();
    const job: Job = {
      ...input,
      id: input.id ?? randomUUID(),
      createdAt: now,
      updatedAt: now,
    } as Job;
    await this.col.update((jobs) => {
      if (jobs.some((j) => j.name === job.name)) {
        throw new Error(`Job with name "${job.name}" already exists`);
      }
      return [...jobs, job];
    });
    return job;
  }

  async update(id: string, patch: UpdateJobInput): Promise<Job> {
    let result: Job | null = null;
    await this.col.update((jobs) =>
      jobs.map((j) => {
        if (j.id !== id) return j;
        const next: Job = {
          ...j,
          ...patch,
          id: j.id,
          updatedAt: new Date().toISOString(),
        };
        result = next;
        return next;
      }),
    );
    if (!result) throw new Error(`Job ${id} not found`);
    return result!;
  }

  async toggle(id: string): Promise<Job> {
    let result: Job | null = null;
    await this.col.update((jobs) =>
      jobs.map((j) => {
        if (j.id !== id) return j;
        const next = { ...j, enabled: !j.enabled, updatedAt: new Date().toISOString() };
        result = next;
        return next;
      }),
    );
    if (!result) throw new Error(`Job ${id} not found`);
    return result!;
  }

  async delete(id: string): Promise<void> {
    await this.col.update((jobs) => jobs.filter((j) => j.id !== id));
  }

  async setRunMeta(id: string, meta: { lastRunAt?: string; nextRunAt?: string }): Promise<void> {
    await this.col.update((jobs) =>
      jobs.map((j) =>
        j.id === id ? { ...j, ...meta, updatedAt: new Date().toISOString() } : j,
      ),
    );
  }
}
