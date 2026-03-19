import type { ProviderKey } from "./providers";

// ── Schedule ─────────────────────────────────────────────────────────────────

export type ScheduleType =
  | { kind: "manual" }
  | { kind: "hourly" }
  | { kind: "daily"; hour: number; minute: number }
  | { kind: "weekly"; dayOfWeek: number; hour: number; minute: number }
  | { kind: "monthly"; dayOfMonth: number; hour: number; minute: number };

// ── Task ─────────────────────────────────────────────────────────────────────

export interface TaskPermissions {
  runCommands: boolean;
  commit: boolean;
  push: boolean;
}

export interface Task {
  id: string;
  name: string;
  prompt: string;
  repos: string[];
  permissions: TaskPermissions;
  schedule: ScheduleType;
  provider: ProviderKey;
  model: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── RunLog ───────────────────────────────────────────────────────────────────

export type RunStatus = "running" | "success" | "failed" | "cancelled";

export interface FileEdit {
  path: string;
  diff: string;
}

export interface RunLog {
  id: string;
  taskId: string;
  taskName: string;
  startedAt: string;
  finishedAt?: string;
  status: RunStatus;
  trigger: "manual" | "scheduled";
  repos: string[];
  output: string;
  edits: FileEdit[];
  commandsRun: string[];
  commitSha?: string;
  pushed: boolean;
  emailSent: boolean;
  error?: string;
}

// ── Config ───────────────────────────────────────────────────────────────────

export interface AIProviderConfig {
  provider: ProviderKey;
  model: string;
  keys: {
    anthropic: string;
    groq: string;
    google: string;
    openai: string;
  };
}

export interface SMTPConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  toAddress: string;
  enabled: boolean;
}

export interface AppConfig {
  baseDir: string;
  theme: "dark" | "light";
  ai: AIProviderConfig;
  smtp: SMTPConfig;
  updatedAt: string;
}

// ── Repo ─────────────────────────────────────────────────────────────────────

export interface Repo {
  name: string;
  path: string;
  branch: string;
  lastCommit: string;
}
