import type { ProviderKey } from "./providers";

// ── Schedule ─────────────────────────────────────────────────────────────────

export type ScheduleType =
  | { kind: "manual" }
  | { kind: "hourly" }
  | { kind: "daily"; hour: number; minute: number }
  | { kind: "weekly"; dayOfWeek: number; hour: number; minute: number }
  | { kind: "monthly"; dayOfMonth: number; hour: number; minute: number }
  | { kind: "cron"; expr: string };

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
  // Advanced
  branchPerRun?: boolean;
  githubPrOnPush?: boolean;
  requiresApproval?: boolean;
  retryOnFailure?: boolean;
  maxRetries?: number;
  triggerTaskIds?: string[];
  // New features
  inputVars?: string[];           // variable names like ["version","branch"]
  dryRun?: boolean;               // write/commit tools are no-ops
  costBudget?: number;            // stop if estimated cost (USD) exceeds this
  slackWebhook?: string;          // Slack incoming webhook URL
  discordWebhook?: string;        // Discord webhook URL
  createIssueOnFailure?: boolean; // open GitHub issue on failure
  watchPaths?: string[];          // file paths to watch for changes
  customTools?: CustomTool[];     // extra shell-command tools injected into the agent
  envVars?: Record<string, string>; // env vars injected into run_command calls
}

export interface CustomTool {
  name: string;
  description: string;
  command: string; // shell command; {{repo_path}} is substituted at call time
}

// ── RunLog ───────────────────────────────────────────────────────────────────

export type RunStatus = "running" | "success" | "failed" | "cancelled";
export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface FileEdit {
  path: string;
  diff: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
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
  attempt?: number;
  tokenUsage?: TokenUsage;
  branchName?: string;
  prUrl?: string;
  commitShas?: string[];
  approvalStatus?: ApprovalStatus;
  pendingCommitMessage?: string;
  isDryRun?: boolean;
  estimatedCost?: number;
  inputVarValues?: Record<string, string>;
  chainedRunIds?: string[];
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

export type DigestFrequency = "every_2h" | "every_4h" | "every_6h" | "every_8h" | "every_12h" | "daily";

export interface DigestConfig {
  enabled: boolean;
  frequency: DigestFrequency;
  hour: number;   // 0-23, only used when frequency === "daily"
}

export interface AppConfig {
  baseDir: string;
  theme: "dark" | "light";
  ai: AIProviderConfig;
  smtp: SMTPConfig;
  password?: string;
  githubToken?: string;
  webhookSecret?: string;
  digest?: DigestConfig;
  updatedAt: string;
}

// ── Repo ─────────────────────────────────────────────────────────────────────

export interface Repo {
  name: string;
  path: string;
  branch: string;
  lastCommit: string;
}
