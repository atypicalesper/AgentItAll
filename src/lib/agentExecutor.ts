import { streamText, tool, stepCountIs } from "ai";
import { z } from "zod";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { execSync } from "child_process";
import type { Task, RunLog, FileEdit } from "./types";
import { getConfig, upsertRun, getRun } from "./db";
import { getFileTree, readFile, getDiff, commitAll, push } from "./gitOps";
import { createStream, emit, closeStream } from "./streamStore";
import { sendEmail } from "./emailer";
import { getModel, PROVIDERS } from "./providers";
import type { ProviderKey } from "./providers";

const MAX_STEPS = 20;

function log(runId: string, msg: string) {
  emit(runId, "chunk", msg);
  process.stdout.write(msg);
}

function runCmd(cwd: string, command: string): string {
  try {
    return execSync(command, { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch (e: unknown) {
    const err = e as { stderr?: Buffer; stdout?: Buffer };
    return (err.stderr?.toString() ?? err.stdout?.toString() ?? String(e)).slice(0, 2000);
  }
}

export async function runAgent(
  task: Task,
  runId: string,
  trigger: "manual" | "scheduled"
): Promise<void> {
  const config = getConfig();
  createStream(runId);

  const run: RunLog = {
    id: runId,
    taskId: task.id,
    taskName: task.name,
    startedAt: new Date().toISOString(),
    status: "running",
    trigger,
    repos: task.repos,
    output: "",
    edits: [],
    commandsRun: [],
    pushed: false,
    emailSent: false,
  };
  upsertRun(run);

  const appendOutput = (text: string) => {
    run.output += text;
  };

  try {
    // ── Pre-flight checks ──────────────────────────────────────────────────
    const provider = (task.provider ?? config.ai.provider) as ProviderKey;
    const apiKey = config.ai.keys[provider];

    if (!apiKey) {
      throw new Error(
        `No API key for ${PROVIDERS[provider].label}. Go to Settings → AI Provider and add your ${provider} key.`
      );
    }

    for (const repoPath of task.repos) {
      if (!existsSync(repoPath)) {
        throw new Error(`Repo not found: ${repoPath}. Update the task with a valid path.`);
      }
    }

    const model = getModel(provider, task.model || config.ai.model, apiKey);

    // ── Build repo context ─────────────────────────────────────────────────
    const repoContexts = task.repos.map((repoPath) => {
      const files = getFileTree(repoPath);
      const status = runCmd(repoPath, "git status --short");
      const recentLog = runCmd(repoPath, "git log --oneline -10");
      return `## Repo: ${repoPath}\n\nFiles:\n${files}\n\nRecent commits:\n${recentLog}\n\nUncommitted changes:\n${status || "(clean)"}`;
    }).join("\n\n---\n\n");

    const systemPrompt = `You are an autonomous coding agent working on one or more git repositories.

Available tools: read_file, write_file, run_command (if permitted), commit (if permitted), task_complete.

Rules:
- Read files before editing them
- Make targeted, minimal changes
- Call task_complete when done with a clear summary

Repository context:
${repoContexts}`;

    log(runId, `\n[agent] Starting: ${task.name} (${provider}/${task.model})\n\n`);

    // ── Tool definitions ───────────────────────────────────────────────────
    const pendingWrites = new Map<string, string>();
    let finalSummary = "";

    const tools = {
      read_file: tool({
        description: "Read a file from a repository",
        inputSchema: z.object({
          repo_path: z.string().describe("Absolute path to the repo"),
          file_path: z.string().describe("Relative file path within the repo"),
        }),
        execute: async (input) => {
          log(runId, `[tool] read_file: ${input.file_path}\n`);
          return readFile(input.repo_path, input.file_path);
        },
      }),

      write_file: tool({
        description: "Write content to a file in a repository",
        inputSchema: z.object({
          repo_path: z.string(),
          file_path: z.string(),
          content: z.string().describe("Full file content to write"),
        }),
        execute: async (input) => {
          log(runId, `[tool] write_file: ${input.file_path}\n`);
          const fullPath = join(input.repo_path, input.file_path);
          const dir = dirname(fullPath);
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          writeFileSync(fullPath, input.content, "utf8");
          pendingWrites.set(`${input.repo_path}::${input.file_path}`, input.content);
          return `Written: ${input.file_path}`;
        },
      }),

      run_command: tool({
        description: "Run a shell command in a repository directory",
        inputSchema: z.object({
          repo_path: z.string(),
          command: z.string(),
        }),
        execute: async (input) => {
          if (!task.permissions.runCommands) {
            return "(permission denied: runCommands is disabled for this task)";
          }
          log(runId, `[tool] run_command: ${input.command}\n`);
          run.commandsRun.push(input.command);
          const result = runCmd(input.repo_path, input.command);
          log(runId, result + "\n");
          return result;
        },
      }),

      commit: tool({
        description: "Commit all changes in a repository",
        inputSchema: z.object({
          repo_path: z.string(),
          message: z.string().describe("Commit message"),
        }),
        execute: async (input) => {
          if (!task.permissions.commit) {
            return "(permission denied: commit is disabled for this task)";
          }
          log(runId, `[tool] commit: ${input.message}\n`);
          const diff = getDiff(input.repo_path);
          const sha = commitAll(input.repo_path, input.message);
          if (sha) run.commitSha = sha;
          if (diff) run.edits.push(...parseDiffToEdits(diff));
          return sha ? `Committed: ${sha}` : "(nothing to commit)";
        },
      }),

      task_complete: tool({
        description: "Signal that the task is complete",
        inputSchema: z.object({
          summary: z.string().describe("What was done"),
        }),
        execute: async (input) => {
          finalSummary = input.summary;
          return "Done.";
        },
      }),
    };

    // ── Run the agent ──────────────────────────────────────────────────────
    const result = streamText({
      model,
      tools,
      stopWhen: stepCountIs(MAX_STEPS),
      system: systemPrompt,
      messages: [{ role: "user", content: task.prompt }],
    });

    for await (const chunk of result.textStream) {
      log(runId, chunk);
      appendOutput(chunk);
      upsertRun(run);
    }

    // Collect diffs for uncommitted writes
    for (const repoPath of task.repos) {
      const diff = getDiff(repoPath);
      if (diff && !run.commitSha) {
        run.edits.push(...parseDiffToEdits(diff));
      }
      if (task.permissions.push && run.commitSha) {
        try {
          push(repoPath);
          run.pushed = true;
          log(runId, `\n[git] Pushed to remote.\n`);
        } catch (e) {
          log(runId, `\n[git] Push failed: ${String(e)}\n`);
        }
      }
    }

    run.status = "success";
    run.finishedAt = new Date().toISOString();
    if (finalSummary) {
      appendOutput(`\n\n✓ Done: ${finalSummary}`);
    }
    log(runId, `\n[agent] Complete.\n`);

    upsertRun(run);

    try {
      const body = `# agentItAll Run Complete ✓\n\n**Task:** ${task.name}\n**Provider:** ${provider}/${task.model}\n**Status:** success\n**Trigger:** ${trigger}\n\n## Summary\n${finalSummary || "(no summary)"}\n\n## Commit\n${run.commitSha ?? "(none)"}\n\n## Stats\n- Files changed: ${run.edits.length}\n- Commands run: ${run.commandsRun.length}`;
      const result = await sendEmail(config.smtp, `[agentItAll] ✓ ${task.name} — success`, body);
      run.emailSent = true;
      upsertRun(run);
      if (result.etherealUrl) log(runId, `\n[email] Preview: ${result.etherealUrl}\n`);
    } catch (emailErr) {
      log(runId, `\n[email] Failed to send: ${String(emailErr)}\n`);
    }
  } catch (err) {
    // Check if cancelled externally
    if (getRun(runId)?.status === "cancelled") {
      closeStream(runId);
      return;
    }
    run.status = "failed";
    run.finishedAt = new Date().toISOString();
    run.error = String(err);
    run.output += `\n[error] ${run.error}`;
    upsertRun(run);
    emit(runId, "error", run.error);

    const failProvider = (task.provider ?? config.ai.provider) as ProviderKey;
    const body = `# agentItAll Run FAILED\n\n**Task:** ${task.name}\n**Provider:** ${failProvider}/${task.model}\n**Trigger:** ${trigger}\n\n## Error\n${run.error}`;
    sendEmail(config.smtp, `[agentItAll] ✗ ${task.name} — failed`, body).catch(() => {});
  } finally {
    closeStream(runId);
  }
}

function parseDiffToEdits(diff: string): FileEdit[] {
  const edits: FileEdit[] = [];
  const fileBlocks = diff.split(/^diff --git /m).filter(Boolean);
  for (const block of fileBlocks) {
    const match = block.match(/^a\/(.+) b\//);
    if (match) edits.push({ path: match[1], diff: "diff --git " + block });
  }
  return edits;
}
