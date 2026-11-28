import pino from "pino";

export type Logger = pino.Logger;

export function createLogger(name: string, level = process.env.LOG_LEVEL ?? "info"): Logger {
  return pino({
    name,
    level,
    base: { service: name },
    redact: {
      paths: [
        "req.headers.cookie",
        "req.headers.authorization",
        "*.password",
        "*.token",
        "password",
        "token",
      ],
      censor: "[oculto]",
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}
