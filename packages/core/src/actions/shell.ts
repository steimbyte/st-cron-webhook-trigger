import { exec } from "node:child_process";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ActionExecutor } from "./registry.js";
import type { JobAction, ShellConfig, ActionRun } from "../types.js";

type ShellAction = {
  type: "shell";
  config: ShellConfig;
  id: string;
  jobId: string;
  position: number;
  continueOnError: boolean;
};

function runInPath(
  cmd: string,
  cwd: string | undefined,
  timeoutMs: number,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let done = false;
    const c = exec(
      cmd,
      { cwd, timeout: timeoutMs, shell: process.env.SHELL, maxBuffer: 1024 * 256 },
      (err: any, stdout: string, stderr: string) => {
        if (done) return;
        done = true;
        if (err) {
          if (typeof err.code === "number") {
            resolve({ code: err.code as number, stdout, stderr });
            return;
          }
          reject(err);
        } else {
          resolve({ code: 0, stdout, stderr });
        }
      },
    );
    c.on("exit", () => {});
  });
}

const executor: ActionExecutor = {
  type: "shell",

  async run(ctx, action): Promise<Partial<ActionRun>> {
    const a = action as ShellAction;
    const cfg = a.config;
    const id = randomUUID();
    const startedAt = new Date();

    try {
      if (cfg.allowedPaths && cfg.allowedPaths.length > 0) {
        const absCwd = cfg.cwd ? path.resolve(cfg.cwd) : process.cwd();
        const allowed = cfg.allowedPaths.some((p) => absCwd.startsWith(path.resolve(p) + path.sep));
        if (!allowed) {
          throw new Error(
            `cwd "${absCwd}" is outside allowed paths: ${cfg.allowedPaths.join(", ")}`,
          );
        }
      }

      const result = await runInPath(
        cfg.command,
        cfg.cwd,
        cfg.timeoutMs ?? 60_000,
      );

      const finishedAt = new Date();
      const ok = result.code === 0;
      return {
        id,
        runId: ctx.runId,
        actionId: a.id,
        status: ok ? "success" : "failed",
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        request: { command: cfg.command, cwd: cfg.cwd, timeoutMs: cfg.timeoutMs ?? 60_000 },
        response: {
          status: result.code,
          body: (result.stdout + (result.stderr ? `\n[stderr]\n${result.stderr}` : "")).slice(0, 8192),
        },
        error: ok ? undefined : `exit ${result.code}`,
      };
    } catch (err: any) {
      const finishedAt = new Date();
      return {
        id,
        runId: ctx.runId,
        actionId: a.id,
        status: "failed",
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        error: err?.message ?? String(err),
      };
    }
  },
};

export default executor;
