import fs from "node:fs";
import path from "node:path";

export interface DaemonLock {
  pid: number;
  startedAt: string;
  host: string;
  port: number;
}

/** Try to acquire an exclusive lock. Returns the existing owner if locked. */
export function acquireLock(pidFile: string, info: Omit<DaemonLock, "pid">): DaemonLock | { existing: true; pid: number } | null {
  try {
    const fd = fs.openSync(pidFile, "wx");
    const payload: DaemonLock = { pid: process.pid, ...info };
    fs.writeSync(fd, JSON.stringify(payload));
    fs.closeSync(fd);
    return payload;
  } catch (err: any) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      try {
        const raw = JSON.parse(fs.readFileSync(pidFile, "utf8")) as DaemonLock;
        if (raw.pid && processExists(raw.pid)) {
          return { existing: true, pid: raw.pid };
        }
        // Stale — remove and retry
        fs.unlinkSync(pidFile);
        return acquireLock(pidFile, info);
      } catch {
        try { fs.unlinkSync(pidFile); } catch {}
        return acquireLock(pidFile, info);
      }
    }
    throw err;
  }
}

export function releaseLock(pidFile: string): void {
  try {
    fs.unlinkSync(pidFile);
  } catch {}
}

export function readLock(pidFile: string): DaemonLock | null {
  try {
    return JSON.parse(fs.readFileSync(pidFile, "utf8")) as DaemonLock;
  } catch {
    return null;
  }
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function isProcessRunning(pid: number): boolean {
  return processExists(pid);
}

/** Detach current process by re-spawning and exiting.
 *  Returns true if we detached; returns false if not supported. */
export function detach(): boolean {
  if (process.platform === "win32") {
    // Use spawn-detached via start /b (best effort)
    try {
      const { spawn } = require("node:child_process");
      const child = spawn(process.execPath, process.argv.slice(1), {
        detached: true,
        stdio: "ignore",
        env: { ...process.env, CRONBOARD_DETACHED: "1" },
      });
      child.unref();
      return true;
    } catch {
      return false;
    }
  }
  // POSIX: setsid + fork-style
  const proc = process as unknown as { setsid?: () => void };
  if (typeof proc.setsid === "function") {
    try {
      proc.setsid();
      return true;
    } catch {
      return false;
    }
  }
  return false;
}
