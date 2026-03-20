import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";
import type { Task, RunLog, AppConfig } from "./types";
import { error as logError } from "./logger";

const DATA_DIR = join(process.cwd(), "data");
const DB_PATH = join(DATA_DIR, "agentitall.db");

// ── Singleton connection ──────────────────────────────────────────────────────

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("synchronous = NORMAL");
  initSchema(_db);
  migrateFromJson(_db);
  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL DEFAULT '',
      enabled     INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT,
      updated_at  TEXT,
      data        TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS runs (
      id             TEXT PRIMARY KEY,
      task_id        TEXT NOT NULL,
      task_name      TEXT NOT NULL DEFAULT '',
      started_at     TEXT NOT NULL,
      finished_at    TEXT,
      status         TEXT NOT NULL,
      trigger        TEXT NOT NULL DEFAULT 'manual',
      pushed         INTEGER NOT NULL DEFAULT 0,
      email_sent     INTEGER NOT NULL DEFAULT 0,
      estimated_cost REAL,
      total_tokens   INTEGER,
      error          TEXT,
      data           TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_runs_task_id    ON runs(task_id);
    CREATE INDEX IF NOT EXISTS idx_runs_status     ON runs(status);
    CREATE INDEX IF NOT EXISTS idx_runs_started_at ON runs(started_at);
    CREATE INDEX IF NOT EXISTS idx_tasks_enabled   ON tasks(enabled);
    CREATE TABLE IF NOT EXISTS config (
      id   INTEGER PRIMARY KEY CHECK(id = 1),
      data TEXT NOT NULL
    );
  `);

  // Add new columns to existing tables without dropping data
  const addCol = (table: string, col: string, def: string) => {
    const exists = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((r) => r.name === col);
    if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  };
  addCol("tasks", "name",       "TEXT NOT NULL DEFAULT ''");
  addCol("tasks", "enabled",    "INTEGER NOT NULL DEFAULT 1");
  addCol("tasks", "created_at", "TEXT");
  addCol("tasks", "updated_at", "TEXT");
  addCol("runs",  "task_name",      "TEXT NOT NULL DEFAULT ''");
  addCol("runs",  "finished_at",    "TEXT");
  addCol("runs",  "trigger",        "TEXT NOT NULL DEFAULT 'manual'");
  addCol("runs",  "pushed",         "INTEGER NOT NULL DEFAULT 0");
  addCol("runs",  "email_sent",     "INTEGER NOT NULL DEFAULT 0");
  addCol("runs",  "estimated_cost", "REAL");
  addCol("runs",  "total_tokens",   "INTEGER");
  addCol("runs",  "error",          "TEXT");

  // Backfill proper columns from existing JSON blobs
  backfill(db);
}

function backfill(db: Database.Database) {
  // tasks — only rows where name is still empty
  const staleTasks = db.prepare("SELECT id, data FROM tasks WHERE name = ''").all() as { id: string; data: string }[];
  const updateTask = db.prepare("UPDATE tasks SET name=?, enabled=?, created_at=?, updated_at=? WHERE id=?");
  db.transaction(() => {
    for (const row of staleTasks) {
      try {
        const t = JSON.parse(row.data) as Task;
        updateTask.run(t.name ?? "", t.enabled ? 1 : 0, t.createdAt ?? null, t.updatedAt ?? null, row.id);
      } catch { /* skip corrupt row */ }
    }
  })();

  // runs — only rows where task_name is still empty
  const staleRuns = db.prepare("SELECT id, data FROM runs WHERE task_name = ''").all() as { id: string; data: string }[];
  const updateRun = db.prepare(`
    UPDATE runs SET task_name=?, finished_at=?, trigger=?, pushed=?, email_sent=?, estimated_cost=?, total_tokens=?, error=? WHERE id=?
  `);
  db.transaction(() => {
    for (const row of staleRuns) {
      try {
        const r = JSON.parse(row.data) as RunLog;
        updateRun.run(
          r.taskName ?? "",
          r.finishedAt ?? null,
          r.trigger ?? "manual",
          r.pushed ? 1 : 0,
          r.emailSent ? 1 : 0,
          r.estimatedCost ?? null,
          r.tokenUsage?.totalTokens ?? null,
          r.error ?? null,
          row.id,
        );
      } catch { /* skip corrupt row */ }
    }
  })();
}

// One-time migration from JSON files
function migrateFromJson(db: Database.Database) {
  const alreadyMigrated = db.prepare("SELECT COUNT(*) as n FROM tasks").get() as { n: number };
  if (alreadyMigrated.n > 0) return;

  const tasksFile = join(DATA_DIR, "tasks.json");
  const runsFile = join(DATA_DIR, "runs.json");
  const configFile = join(DATA_DIR, "config.json");

  if (existsSync(tasksFile)) {
    try {
      const tasks = JSON.parse(readFileSync(tasksFile, "utf8")) as Task[];
      const insert = db.prepare("INSERT OR IGNORE INTO tasks(id, data) VALUES(?,?)");
      const tx = db.transaction(() => { for (const t of tasks) insert.run(t.id, JSON.stringify(t)); });
      tx();
    } catch { /* corrupt json */ }
  }

  if (existsSync(runsFile)) {
    try {
      const runs = JSON.parse(readFileSync(runsFile, "utf8")) as RunLog[];
      const insert = db.prepare("INSERT OR IGNORE INTO runs(id,task_id,started_at,status,data) VALUES(?,?,?,?,?)");
      const tx = db.transaction(() => { for (const r of runs) insert.run(r.id, r.taskId, r.startedAt, r.status, JSON.stringify(r)); });
      tx();
    } catch { /* corrupt json */ }
  }

  if (existsSync(configFile)) {
    try {
      const cfg = readFileSync(configFile, "utf8");
      db.prepare("INSERT OR IGNORE INTO config(id,data) VALUES(1,?)").run(cfg);
    } catch { /* corrupt json */ }
  }
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

function parseJson<T>(data: string, fallback?: T): T | undefined {
  try { return JSON.parse(data) as T; }
  catch { logError("db", `Failed to parse JSON: ${data.slice(0, 80)}`); return fallback; }
}

export function getTasks(): Task[] {
  const rows = getDb().prepare("SELECT data FROM tasks").all() as { data: string }[];
  return rows.map((r) => parseJson<Task>(r.data)).filter((t): t is Task => t !== undefined);
}

export function getTask(id: string): Task | undefined {
  const row = getDb().prepare("SELECT data FROM tasks WHERE id=?").get(id) as { data: string } | undefined;
  return row ? parseJson<Task>(row.data) : undefined;
}

export function saveTasks(tasks: Task[]): void {
  const db = getDb();
  const upsert = db.prepare("INSERT OR REPLACE INTO tasks(id,data) VALUES(?,?)");
  const del = db.prepare("DELETE FROM tasks");
  db.transaction(() => {
    del.run();
    for (const t of tasks) upsert.run(t.id, JSON.stringify(t));
  })();
}

export function upsertTask(task: Task): void {
  getDb().prepare(`
    INSERT OR REPLACE INTO tasks(id, name, enabled, created_at, updated_at, data)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(task.id, task.name ?? "", task.enabled ? 1 : 0, task.createdAt ?? null, task.updatedAt ?? null, JSON.stringify(task));
}

export function deleteTask(id: string): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare("DELETE FROM runs WHERE task_id=?").run(id);
    db.prepare("DELETE FROM tasks WHERE id=?").run(id);
  })();
}

// ── Runs ──────────────────────────────────────────────────────────────────────

export interface RunsQuery {
  taskId?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

function buildRunsWhere(query: Omit<RunsQuery, "page" | "limit">): { where: string; params: unknown[] } {
  const { taskId, status, search } = query;
  let where = "WHERE 1=1";
  const params: unknown[] = [];
  if (taskId) { where += " AND task_id=?"; params.push(taskId); }
  if (status && status !== "all") { where += " AND status=?"; params.push(status); }
  if (search) {
    // Escape LIKE special chars so user input like "%" doesn't wildcard-match everything
    const escaped = search.toLowerCase().replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
    where += " AND LOWER(json_extract(data,'$.taskName')) LIKE ? ESCAPE '\\'";
    params.push(`%${escaped}%`);
  }
  return { where, params };
}

export function getRuns(query: RunsQuery = {}): RunLog[] {
  const { page = 1, limit = 0 } = query;
  const { where, params } = buildRunsWhere(query);
  let sql = `SELECT data FROM runs ${where} ORDER BY started_at DESC`;
  if (limit > 0) { sql += " LIMIT ? OFFSET ?"; params.push(limit, (page - 1) * limit); }
  const rows = getDb().prepare(sql).all(...params) as { data: string }[];
  return rows.map((r) => parseJson<RunLog>(r.data)).filter((r): r is RunLog => r !== undefined);
}

export function getRunsCount(query: Omit<RunsQuery, "page" | "limit"> = {}): number {
  const { where, params } = buildRunsWhere(query);
  const row = getDb().prepare(`SELECT COUNT(*) as n FROM runs ${where}`).get(...params) as { n: number };
  return row.n;
}

export function getRun(id: string): RunLog | undefined {
  const row = getDb().prepare("SELECT data FROM runs WHERE id=?").get(id) as { data: string } | undefined;
  return row ? parseJson<RunLog>(row.data) : undefined;
}

export function upsertRun(run: RunLog): void {
  getDb().prepare(`
    INSERT OR REPLACE INTO runs(id, task_id, task_name, started_at, finished_at, status, trigger, pushed, email_sent, estimated_cost, total_tokens, error, data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    run.id, run.taskId, run.taskName ?? "",
    run.startedAt, run.finishedAt ?? null, run.status,
    run.trigger ?? "manual",
    run.pushed ? 1 : 0,
    run.emailSent ? 1 : 0,
    run.estimatedCost ?? null,
    run.tokenUsage?.totalTokens ?? null,
    run.error ?? null,
    JSON.stringify(run),
  );
}

export function deleteRun(id: string): void {
  getDb().prepare("DELETE FROM runs WHERE id=?").run(id);
}

export function deleteRuns(ids: string[]): void {
  const db = getDb();
  const del = db.prepare("DELETE FROM runs WHERE id=?");
  db.transaction(() => { for (const id of ids) del.run(id); })();
}

export function saveRuns(runs: RunLog[]): void {
  const db = getDb();
  const upsert = db.prepare("INSERT OR REPLACE INTO runs(id,task_id,started_at,status,data) VALUES(?,?,?,?,?)");
  const del = db.prepare("DELETE FROM runs");
  db.transaction(() => {
    del.run();
    for (const r of runs) upsert.run(r.id, r.taskId, r.startedAt, r.status, JSON.stringify(r));
  })();
}

// ── Config ────────────────────────────────────────────────────────────────────

const defaultConfig: AppConfig = {
  baseDir: `${process.env.HOME}/Desktop/pp`,
  theme: "dark",
  ai: {
    provider: "groq",
    model: "llama-3.3-70b-versatile",
    keys: { anthropic: "", groq: "", google: "", openai: "" },
  },
  smtp: {
    host: process.env.SMTP_HOST ?? "smtp.ethereal.email",
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    toAddress: process.env.SMTP_TO ?? "",
    enabled: process.env.SMTP_USER ? true : false,
  },
  updatedAt: new Date().toISOString(),
};

export function getConfig(): AppConfig {
  const row = getDb().prepare("SELECT data FROM config WHERE id=1").get() as { data: string } | undefined;
  const raw = row ? (parseJson<Record<string, unknown>>(row.data) ?? {}) : {};
  const ai = (raw.ai ?? {}) as Record<string, unknown>;
  if (!ai.keys && ai.apiKey) {
    ai.keys = { anthropic: ai.apiKey as string, groq: "", google: "", openai: "" };
  }
  ai.keys = { ...defaultConfig.ai.keys, ...(ai.keys as Record<string, string> ?? {}) };
  if (!ai.provider) ai.provider = defaultConfig.ai.provider;
  if (!ai.model) ai.model = defaultConfig.ai.model;
  return {
    ...defaultConfig,
    ...raw,
    ai: ai as unknown as AppConfig["ai"],
    smtp: {
      ...defaultConfig.smtp,
      ...(raw.smtp as object ?? {}),
      // env vars always win for credentials — DB may have stale values
      ...(process.env.SMTP_HOST  ? { host:      process.env.SMTP_HOST }         : {}),
      ...(process.env.SMTP_PORT  ? { port:      Number(process.env.SMTP_PORT) } : {}),
      ...(process.env.SMTP_USER  ? { user:      process.env.SMTP_USER, enabled: true } : {}),
      ...(process.env.SMTP_PASS  ? { pass:      process.env.SMTP_PASS }         : {}),
      ...(process.env.SMTP_TO    ? { toAddress: process.env.SMTP_TO }           : {}),
      secure: process.env.SMTP_SECURE === "true",
    },
  };
}

export function saveConfig(config: AppConfig): void {
  const data = JSON.stringify({ ...config, updatedAt: new Date().toISOString() });
  getDb().prepare("INSERT OR REPLACE INTO config(id,data) VALUES(1,?)").run(data);
}
