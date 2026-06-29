import os from "node:os";
import path from "node:path";
import fs from "node:fs";

export interface ServerConfig {
  host: string;
  port: number;
  dataDir: string;
  logFile: string;
  pidFile: string;
  token?: string;
  detach: boolean;
}

const CONFIG_HOME =
  process.env.CRONBOARD_DATA_DIR ||
  (process.platform === "win32"
    ? path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "cronboard")
    : path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "cronboard"));

export function defaultDataDir(): string {
  return CONFIG_HOME;
}

export function ensureDataDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function resolveConfig(opts: {
  host?: string;
  port?: string | number;
  data?: string;
  token?: string;
  detach?: boolean;
} = {}): ServerConfig {
  const dataDir = path.resolve(opts.data || CONFIG_HOME);
  ensureDataDir(dataDir);
  return {
    host: opts.host ?? "127.0.0.1",
    port: typeof opts.port === "string" ? parseInt(opts.port, 10) : opts.port ?? 3737,
    dataDir,
    logFile: path.join(dataDir, "cronboard.log"),
    pidFile: path.join(dataDir, "cronboard.pid"),
    token: opts.token || process.env.CRONBOARD_TOKEN,
    detach: opts.detach ?? true,
  };
}
