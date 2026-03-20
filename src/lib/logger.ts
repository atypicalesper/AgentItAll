export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  id: number;
  ts: string;
  level: LogLevel;
  ns: string;
  msg: string;
}

const MAX = 500;
const entries: LogEntry[] = [];
let seq = 0;

function add(level: LogLevel, ns: string, msg: string) {
  const entry: LogEntry = { id: ++seq, ts: new Date().toISOString(), level, ns, msg };
  entries.push(entry);
  if (entries.length > MAX) entries.shift();
  const prefix = `[${entry.ts.slice(11, 19)}] [${level.toUpperCase().padEnd(5)}] [${ns}]`;
  if (level === "error") process.stderr.write(`${prefix} ${msg}\n`);
  else process.stdout.write(`${prefix} ${msg}\n`);
}

export function log(ns: string, msg: string) {
  add("info", ns, msg);
}

export function warn(ns: string, msg: string) {
  add("warn", ns, msg);
}

export function error(ns: string, msg: string, err?: unknown) {
  const detail = err instanceof Error ? `: ${err.message}` : err ? `: ${String(err)}` : "";
  add("error", ns, msg + detail);
}

export function getLogs(sinceId = 0): LogEntry[] {
  return entries.filter((e) => e.id > sinceId);
}
