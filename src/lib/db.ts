import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "fs";
import { join } from "path";
import type { Task, RunLog, AppConfig } from "./types";

const DATA_DIR = join(process.cwd(), "data");

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function read<T>(file: string, fallback: T): T {
  ensureDataDir();
  const p = join(DATA_DIR, file);
  if (!existsSync(p)) return fallback;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function write(file: string, data: unknown): void {
  ensureDataDir();
  const p = join(DATA_DIR, file);
  const tmp = p + ".tmp";
  writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  renameSync(tmp, p);
}

// ── Tasks ────────────────────────────────────────────────────────────────────

export function getTasks(): Task[] {
  return read<Task[]>("tasks.json", []);
}

export function getTask(id: string): Task | undefined {
  return getTasks().find((t) => t.id === id);
}

export function saveTasks(tasks: Task[]): void {
  write("tasks.json", tasks);
}

export function upsertTask(task: Task): void {
  const tasks = getTasks();
  const idx = tasks.findIndex((t) => t.id === task.id);
  if (idx >= 0) tasks[idx] = task;
  else tasks.push(task);
  saveTasks(tasks);
}

export function deleteTask(id: string): void {
  saveTasks(getTasks().filter((t) => t.id !== id));
}

// ── Runs ─────────────────────────────────────────────────────────────────────

export function getRuns(): RunLog[] {
  return read<RunLog[]>("runs.json", []);
}

export function getRun(id: string): RunLog | undefined {
  return getRuns().find((r) => r.id === id);
}

export function upsertRun(run: RunLog): void {
  const runs = getRuns();
  const idx = runs.findIndex((r) => r.id === run.id);
  if (idx >= 0) runs[idx] = run;
  else runs.push(run);
  write("runs.json", runs);
}

// ── Config ───────────────────────────────────────────────────────────────────

const defaultConfig: AppConfig = {
  baseDir: `${process.env.HOME}/Desktop/pp`,
  theme: "dark",
  ai: {
    provider: "groq",
    model: "llama-3.3-70b-versatile",
    keys: { anthropic: "", groq: "", google: "", openai: "" },
  },
  smtp: {
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    user: "",
    pass: "",
    toAddress: "",
    enabled: false,
  },
  updatedAt: new Date().toISOString(),
};

export function getConfig(): AppConfig {
  return read<AppConfig>("config.json", defaultConfig);
}

export function saveConfig(config: AppConfig): void {
  write("config.json", { ...config, updatedAt: new Date().toISOString() });
}
