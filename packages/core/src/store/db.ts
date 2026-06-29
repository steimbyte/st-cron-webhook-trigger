// JSON-file store with atomic write + per-file mutex.

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

type Mutex = Promise<unknown>;

const locks = new Map<string, Mutex>();

async function withLock<T>(file: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(file) ?? Promise.resolve();
  let release: (v?: unknown) => void = () => {};
  const next = new Promise((res) => (release = res));
  locks.set(
    file,
    prev.then(() => next),
  );
  try {
    await prev;
    return await fn();
  } finally {
    release();
    if (locks.get(file) === prev.then(() => next)) locks.delete(file);
  }
}

async function readJSON<T>(file: string, schema: z.ZodType<T>, fallback: T): Promise<T> {
  try {
    const buf = await fs.promises.readFile(file, "utf8");
    const raw = JSON.parse(buf);
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      console.error(`[db] schema invalid for ${file}, falling back:`, parsed.error.flatten());
      return fallback;
    }
    return parsed.data;
  } catch (err: any) {
    if (err.code === "ENOENT") return fallback;
    throw err;
  }
}

/**
 * Atomic write with Windows-aware retry.
 *
 * Strategy: write to a unique temp file in the same directory, then `rename()` it
 * over the destination. On Windows, antivirus or Windows Search Indexer can briefly
 * hold a read or write handle on either the temp or the target file, producing
 * EPERM / EACCES / EBUSY. The npm `write-file-atomic` package documents exactly
 * this pattern and is the de-facto standard for Node. We re-implement the loop
 * here to avoid the runtime dependency.
 */
async function writeJSON<T>(file: string, schema: z.ZodType<T>, data: T): Promise<void> {
  schema.parse(data); // validate before write
  const buf = JSON.stringify(data, null, 2);
  await fs.promises.mkdir(path.dirname(file), { recursive: true });

  const tmp = `${file}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await fs.promises.writeFile(tmp, buf, "utf8");

  const isTransient = (code: string | undefined) =>
    code === "EPERM" || code === "EACCES" || code === "EBUSY";

  // Retry rename with exponential backoff (50ms, 100, 200, 400ms) — total ~750ms.
  for (let i = 0; i < 5; i++) {
    try {
      await fs.promises.rename(tmp, file);
      return;
    } catch (err: any) {
      if (isTransient(err.code) && i < 4) {
        await new Promise((r) => setTimeout(r, 50 * Math.pow(2, i)));
        continue;
      }
      // Last resort: drop atomicity and overwrite directly. Acceptable for
      // best-effort local config files (jobs.json / runs.json).
      try { await fs.promises.unlink(tmp); } catch {}
      await fs.promises.writeFile(file, buf, "utf8");
      return;
    }
  }
}

export class Collection<T> {
  constructor(
    public readonly file: string,
    private schema: z.ZodType<T>,
    private fallback: () => T,
  ) {}

  async read(): Promise<T> {
    return withLock(this.file, () => readJSON(this.file, this.schema, this.fallback()));
  }

  async write(data: T): Promise<void> {
    return withLock(this.file, () => writeJSON(this.file, this.schema, data));
  }

  async update(fn: (current: T) => T | Promise<T>): Promise<T> {
    return withLock(this.file, async () => {
      const cur = await readJSON(this.file, this.schema, this.fallback());
      const next = await fn(cur);
      await writeJSON(this.file, this.schema, next);
      return next;
    });
  }
}
