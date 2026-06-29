import pino from "pino";
import fs from "node:fs";
import path from "node:path";

export function createLogger(logFile: string) {
  fs.mkdirSync(path.dirname(logFile), { recursive: true });

  const streams: pino.StreamEntry[] = [
    {
      level: "info",
      stream: pino.destination({
        dest: logFile,
        sync: false,
        mkdir: true,
      }),
    },
  ];

  const isTty = Boolean(process.stdout.isTTY);
  if (isTty) {
    streams.push({
      level: "debug",
      stream: pino.transport({
        target: "pino-pretty",
        options: { colorize: true, translateTime: "HH:MM:ss.l", ignore: "pid,hostname" },
      }),
    });
  } else {
    streams.push({ level: "info", stream: process.stdout });
  }

  return pino(
    {
      level: process.env.CRONBOARD_LOG_LEVEL || "info",
      base: { app: "cronboard" },
    },
    pino.multistream(streams),
  );
}
