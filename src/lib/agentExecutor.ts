import { streamText, tool, stepCountIs } from "ai";
import { z } from "zod";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { execSync } from "child_process";
import type { Task, RunLog, FileEdit, TokenUsage } from "./types";
import { getConfig, upsertRun, getRun, getTask } from "./db";
import {
  getFileTree, readFile, getDiff, commitAll, push,
  createBranch, pushBranch, getRemoteUrl, parseOwnerRepo, discardChanges,
} from "./gitOps";
import { createStream, emit, closeStream } from "./streamStore";
import { sendEmail } from "./emailer";
import { getModel, PROVIDERS } from "./providers";
import { loadMemory, appendMemory } from "./memory";
import { parseDiff } from "./diffParser";
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

  const appendOutput = (text: string) => { run.output += text; };

  const maxRetries = task.retryOnFailure ? (task.maxRetries ?? 3) : 1;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    run.attempt = attempt;
    if (attempt > 1) {
      run.output = "";
      run.edits = [];
      run.commandsRun = [];
      run.commitSha = undefined;
      run.branchName = undefined;
      log(runId, `\n[agent] Retrying (attempt ${attempt}/${maxRetries})…\n\n`);
    }

    try {
      // ── Pre-flight ──────────────────────────────────────────────────────
      const provider = (task.provider ?? config.ai.provider) as ProviderKey;
      const apiKey = config.ai.keys[provider];
      if (!apiKey) throw new Error(`No API key for ${PROVIDERS[provider].label}. Go to Settings → AI Provider.`);
      for (const repoPath of task.repos) {
        if (!existsSync(repoPath)) throw new Error(`Repo not found: ${repoPath}`);
      }
      const model = getModel(provider, task.model || config.ai.model, apiKey);

      // ── Branch per run ──────────────────────────────────────────────────
      if (task.branchPerRun) {
        const branch = `agent/${runId.slice(0, 8)}`;
        for (const repoPath of task.repos) createBranch(repoPath, branch);
        run.branchName = branch;
        upsertRun(run);
      }

      // ── Repo context ────────────────────────────────────────────────────
      const repoContexts = task.repos.map((repoPath) => {
        const files = getFileTree(repoPath);
        const status = runCmd(repoPath, "git status --short");
        const recentLog = runCmd(repoPath, "git log --oneline -10");
        return `## Repo: ${repoPath}\n\nFiles:\n${files}\n\nRecent commits:\n${recentLog}\n\nUncommitted changes:\n${status || "(clean)"}`;
      }).join("\n\n---\n\n");

      // ── Agent memory ────────────────────────────────────────────────────
      const memories = loadMemory(task.id);
      const memorySection = memories.length
        ? `\n\nPrevious run summaries:\n${memories.map((m, i) => `${i + 1}. ${m}`).join("\n")}`
        : "";

      const systemPrompt = `You are an autonomous coding agent working on one or more git repositories.

Available tools: read_file, write_file, run_command (if permitted), commit (if permitted), task_complete.

Rules:
- Read files before editing them
- Make targeted, minimal changes
- Call task_complete when done with a clear summary${memorySection}

Repository context:
${repoContexts}`;

      log(runId, `\n[agent] Starting: ${task.name} (${provider}/${task.model})${attempt > 1 ? ` attempt ${attempt}` : ""}\n\n`);

      // ── Tool definitions ─────────────────────────────────────────────────
      const pendingWrites = new Map<string, string>();
      let finalSummary = "";
      let pendingCommitMessage = "";

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
            if (!task.permissions.runCommands) return "(permission denied: runCommands is disabled)";
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
            if (!task.permissions.commit) return "(permission denied: commit is disabled)";
            if (task.requiresApproval) {
              pendingCommitMessage = input.message;
              log(runId, `[tool] commit held for approval: ${input.message}\n`);
              return "(pending approval — files written, commit held until approved)";
            }
            log(runId, `[tool] commit: ${input.message}\n`);
            const diff = getDiff(input.repo_path);
            const sha = commitAll(input.repo_path, input.message);
            if (sha) run.commitSha = sha;
            if (diff) run.edits.push(...parseDiff(diff));
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

      // ── Run the agent ────────────────────────────────────────────────────
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

      // Capture token usage (AI SDK v6 uses inputTokens/outputTokens)
      try {
        const u = await result.usage;
        if (u) {
          const prompt = (u as { inputTokens?: number }).inputTokens ?? 0;
          const completion = (u as { outputTokens?: number }).outputTokens ?? 0;
          run.tokenUsage = { promptTokens: prompt, completionTokens: completion, totalTokens: prompt + completion };
        }
      } catch { /* some providers don't return usage */ }

      // Collect diffs for uncommitted writes
      for (const repoPath of task.repos) {
        const diff = getDiff(repoPath);
        if (diff && !run.commitSha) run.edits.push(...parseDiff(diff));

        // Push / PR
        if (task.permissions.push && run.commitSha) {
          if (task.branchPerRun && run.branchName) {
            try {
              pushBranch(repoPath, run.branchName);
              run.pushed = true;
              log(runId, `\n[git] Pushed branch ${run.branchName}.\n`);

              if (task.githubPrOnPush && config.githubToken) {
                const remote = getRemoteUrl(repoPath);
                const parsed = parseOwnerRepo(remote);
                if (parsed) {
                  const prRes = await fetch(
                    `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/pulls`,
                    {
                      method: "POST",
                      headers: {
                        Authorization: `Bearer ${config.githubToken}`,
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({
                        title: `agent: ${task.name}`,
                        head: run.branchName,
                        base: "main",
                        body: finalSummary || `Automated run by agentItAll task: ${task.name}`,
                      }),
                    }
                  );
                  const pr = await prRes.json() as { html_url?: string };
                  if (pr.html_url) {
                    run.prUrl = pr.html_url;
                    log(runId, `\n[git] PR opened: ${pr.html_url}\n`);
                  }
                }
              }
            } catch (e) {
              log(runId, `\n[git] Push failed: ${String(e)}\n`);
            }
          } else {
            try {
              push(repoPath);
              run.pushed = true;
              log(runId, `\n[git] Pushed to remote.\n`);
            } catch (e) {
              log(runId, `\n[git] Push failed: ${String(e)}\n`);
            }
          }
        }
      }

      // Approval hold
      if (task.requiresApproval && pendingCommitMessage) {
        run.approvalStatus = "pending";
        run.pendingCommitMessage = pendingCommitMessage;
        log(runId, `\n[agent] Waiting for approval before commit.\n`);
      }

      run.status = "success";
      run.finishedAt = new Date().toISOString();
      if (finalSummary) appendOutput(`\n\n✓ Done: ${finalSummary}`);
      log(runId, `\n[agent] Complete.\n`);
      upsertRun(run);

      // Persist memory
      if (finalSummary) appendMemory(task.id, finalSummary);

      // Email
      try {
        const body = `# agentItAll Run Complete ✓\n\n**Task:** ${task.name}\n**Provider:** ${provider}/${task.model}\n**Status:** ${run.approvalStatus === "pending" ? "pending approval" : "success"}\n**Trigger:** ${trigger}${attempt > 1 ? `\n**Attempt:** ${attempt}` : ""}\n\n## Summary\n${finalSummary || "(no summary)"}\n\n## Commit\n${run.commitSha ?? run.approvalStatus === "pending" ? "(awaiting approval)" : "(none)"}\n\n## Stats\n- Files changed: ${run.edits.length}\n- Commands run: ${run.commandsRun.length}${run.tokenUsage ? `\n- Tokens used: ${run.tokenUsage.totalTokens}` : ""}${run.prUrl ? `\n\n## PR\n${run.prUrl}` : ""}`;
        const result2 = await sendEmail(config.smtp, `[agentItAll] ✓ ${task.name} — success`, body);
        run.emailSent = true;
        upsertRun(run);
        if (result2.etherealUrl) log(runId, `\n[email] Preview: ${result2.etherealUrl}\n`);
      } catch (emailErr) {
        log(runId, `\n[email] Failed to send: ${String(emailErr)}\n`);
      }

      // Task chaining
      if (task.triggerTaskIds?.length) {
        for (const tid of task.triggerTaskIds) {
          const chained = getTask(tid);
          if (chained) {
            const chainRunId = crypto.randomUUID();
            log(runId, `\n[chain] Triggering task: ${chained.name}\n`);
            runAgent(chained, chainRunId, "scheduled").catch(console.error);
          }
        }
      }

      lastErr = undefined;
      break; // success — exit retry loop

    } catch (err) {
      lastErr = err;
      if (getRun(runId)?.status === "cancelled") {
        closeStream(runId);
        return;
      }
      if (attempt < maxRetries) continue; // will retry
    }
  }

  // Final failure handling (after all retries exhausted)
  if (lastErr !== undefined) {
    run.status = "failed";
    run.finishedAt = new Date().toISOString();
    run.error = String(lastErr);
    run.output += `\n[error] ${run.error}`;
    upsertRun(run);
    emit(runId, "error", run.error);

    const provider = (task.provider ?? config.ai.provider) as ProviderKey;
    const body = `# agentItAll Run FAILED\n\n**Task:** ${task.name}\n**Provider:** ${provider}/${task.model}\n**Trigger:** ${trigger}${(run.attempt ?? 1) > 1 ? `\n**Attempts:** ${run.attempt}` : ""}\n\n## Error\n${run.error}`;
    sendEmail(config.smtp, `[agentItAll] ✗ ${task.name} — failed`, body).catch(() => {});
  }

  closeStream(runId);
}
