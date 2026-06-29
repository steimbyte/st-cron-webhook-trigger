import type { JobAction, ActionRun } from "../types.js";

export interface ActionContext {
  runId: string;
  job: { id: string; name: string };
  /** set when a step has run before; placeholder for templating later */
  trigger: "schedule" | "manual";
}

export interface ActionExecutor {
  type: JobAction["type"];
  run(ctx: ActionContext, action: JobAction): Promise<Partial<ActionRun>>;
}

const executors = new Map<string, ActionExecutor>();

export function registerActionExecutor(exec: ActionExecutor): void {
  executors.set(exec.type, exec);
}

export function getActionExecutor(type: JobAction["type"]): ActionExecutor {
  const exec = executors.get(type);
  if (!exec) throw new Error(`No action executor registered for type: ${type}`);
  return exec;
}

export function listActionTypes(): string[] {
  return Array.from(executors.keys());
}
