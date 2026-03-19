import { streamText, tool, stepCountIs } from "ai";
import { z } from "zod";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { execSync, execFileSync } from "child_process";
import type { Task, RunLog, TokenUsage } from "./types";
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
import { estimateCost, budgetToMaxTokens } from "./costEstimator";
import { notifySuccess, notifyFailure } from "./notifier";
import type { ProviderKey } from "./providers";

const MAX_STEPS = 20;

function log(runId: string, msg: string) {
  emit(runId, "chunk", msg);
  process.stdout.write(msg);
}

function runCmd(cwd: string, command: string): string {
  return runCmdEnv(cwd, command);
}

function runCmdEnv(cwd: string, command: string, env?: NodeJS.ProcessEnv): string {
  try {
    return execSync(command, { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], env }).trim();
  } catch (e: unknown) {
    const err = e as { stderr?: Buffer; stdout?: Buffer };
    return (err.stderr?.toString() ?? err.stdout?.toString() ?? String(e)).slice(0, 2000);
  }
}

export async function runAgent(
  task: Task,
  runId: string,
  trigger: "manual" | "scheduled",
  inputVarValues?: Record<string, string>,
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
    isDryRun: task.dryRun ?? false,
    inputVarValues,
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

      // ── Variable substitution & dry-run ─────────────────────────────────
      const dryRunNote = task.dryRun ? "\n\nDRY RUN MODE: Do not actually write files or commit. Only analyse and report what you would do." : "";
      let resolvedPrompt = task.prompt;
      if (inputVarValues) {
        for (const [k, v] of Object.entries(inputVarValues)) {
          resolvedPrompt = resolvedPrompt.replaceAll(`{{${k}}}`, v);
        }
      }

      const systemPrompt = `You are an autonomous coding agent working on one or more git repositories.

Available tools: read_file, write_file, run_command (if permitted), commit (if permitted), task_complete.

Rules:
- Read files before editing them
- Make targeted, minimal changes
- Call task_complete when done with a clear summary${dryRunNote}${memorySection}

Repository context:
${repoContexts}`;

      log(runId, `\n[agent] Starting: ${task.name} (${provider}/${task.model})${task.dryRun ? " [DRY RUN]" : ""}${attempt > 1 ? ` attempt ${attempt}` : ""}\n\n`);

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
            if (task.dryRun) {
              log(runId, `[tool] write_file (dry-run): ${input.file_path}\n`);
              return `(dry-run) Would write ${input.file_path} (${input.content.length} chars)`;
            }
            log(runId, `[tool] write_file: ${input.file_path}\n`);
            const fullPath = join(input.repo_path, input.file_path);
            const dir = dirname(fullPath);
            if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
            writeFileSync(fullPath, input.content, "utf8");
            pendingWrites.set(`${input.repo_path}::${input.file_path}`, input.content);
            return `Written: ${input.file_path}`;
          },
        }),

        search_files: tool({
          description: "Search for a pattern across files in a repository using ripgrep (falls back to grep)",
          inputSchema: z.object({
            repo_path: z.string(),
            pattern: z.string().describe("Regex or literal search pattern"),
            glob: z.string().optional().describe("File glob filter, e.g. '*.ts'"),
            context_lines: z.number().optional().describe("Lines of context around each match (default 2)"),
          }),
          execute: async (input) => {
            log(runId, `[tool] search_files: ${input.pattern}${input.glob ? ` [${input.glob}]` : ""}\n`);
            const ctx = String(input.context_lines ?? 2);
            try {
              const args = ["--no-heading", "-n", "--color=never", "-C", ctx];
              if (input.glob) args.push("--glob", input.glob);
              args.push(input.pattern, ".");
              const out = execFileSync("rg", args, { cwd: input.repo_path, encoding: "utf8", stdio: ["pipe","pipe","pipe"] }).trim();
              return out.slice(0, 8000) || "(no matches)";
            } catch {
              // fallback to grep
              try {
                const gArgs = ["-rn", `--include=${input.glob ?? "*"}`, `-C${ctx}`, input.pattern, "."];
                const out = execFileSync("grep", gArgs, { cwd: input.repo_path, encoding: "utf8", stdio: ["pipe","pipe","pipe"] }).trim();
                return out.slice(0, 8000) || "(no matches)";
              } catch { return "(no matches)"; }
            }
          },
        }),

        patch_file: tool({
          description: "Apply targeted search-and-replace edits to a file without rewriting the whole thing",
          inputSchema: z.object({
            repo_path: z.string(),
            file_path: z.string(),
            edits: z.array(z.object({
              search: z.string().describe("Exact string to find (must exist in file)"),
              replace: z.string().describe("String to replace it with"),
            })).describe("List of search/replace pairs applied in order"),
          }),
          execute: async (input) => {
            if (task.dryRun) return `(dry-run) Would patch ${input.file_path} with ${input.edits.length} edit(s)`;
            log(runId, `[tool] patch_file: ${input.file_path} (${input.edits.length} edit(s))\n`);
            const fullPath = join(input.repo_path, input.file_path);
            if (!existsSync(fullPath)) return `Error: file not found: ${input.file_path}`;
            let content = readFileSync(fullPath, "utf8");
            for (const edit of input.edits) {
              if (!content.includes(edit.search)) {
                return `Error: search string not found in ${input.file_path}:\n"${edit.search.slice(0, 120)}"`;
              }
              content = content.replace(edit.search, edit.replace);
            }
            writeFileSync(fullPath, content, "utf8");
            pendingWrites.set(`${input.repo_path}::${input.file_path}`, content);
            return `Patched ${input.file_path}: ${input.edits.length} edit(s) applied`;
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
            const env = task.envVars ? { ...process.env, ...task.envVars } : undefined;
            const result = runCmdEnv(input.repo_path, input.command, env);
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
            if (task.dryRun) {
              log(runId, `[tool] commit (dry-run): ${input.message}\n`);
              return `(dry-run) Would commit: "${input.message}"`;
            }
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
      // ── Custom tools ─────────────────────────────────────────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allTools: Record<string, any> = { ...tools };
      for (const ct of task.customTools ?? []) {
        const safeKey = ct.name.replace(/[^a-zA-Z0-9_]/g, "_");
        allTools[safeKey] = tool({
          description: ct.description,
          inputSchema: z.object({ repo_path: z.string() }),
          execute: async (input) => {
            if (!task.permissions.runCommands) return "(permission denied: runCommands is disabled)";
            const cmd = ct.command.replace("{{repo_path}}", input.repo_path);
            log(runId, `[tool] ${ct.name}: ${cmd}\n`);
            run.commandsRun.push(cmd);
            const env = task.envVars ? { ...process.env, ...task.envVars } : undefined;
            const result = runCmdEnv(input.repo_path, cmd, env);
            log(runId, result + "\n");
            return result;
          },
        });
      }

      // ── Run the agent ────────────────────────────────────────────────────
      const maxTok = task.costBudget ? budgetToMaxTokens(provider, task.costBudget) : undefined;
      const result = streamText({
        model,
        tools: allTools,
        stopWhen: stepCountIs(MAX_STEPS),
        system: systemPrompt,
        messages: [{ role: "user", content: resolvedPrompt }],
        ...(maxTok ? { maxTokens: maxTok } : {}),
      });

      for await (const chunk of result.textStream) {
        log(runId, chunk);
        appendOutput(chunk);
        upsertRun(run);
      }

      // Capture token usage + cost estimate
      try {
        const u = await result.usage;
        if (u) {
          const prompt = (u as { inputTokens?: number }).inputTokens ?? 0;
          const completion = (u as { outputTokens?: number }).outputTokens ?? 0;
          run.tokenUsage = { promptTokens: prompt, completionTokens: completion, totalTokens: prompt + completion };
          run.estimatedCost = estimateCost(provider, prompt, completion);
          // Cost budget enforcement (log overage, still mark success — run already finished)
          if (task.costBudget && run.estimatedCost > task.costBudget) {
            log(runId, `\n[agent] ⚠ Cost budget exceeded: $${run.estimatedCost.toFixed(4)} > $${task.costBudget}\n`);
          }
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

      // Slack / Discord notifications
      notifySuccess(task, run).catch(() => {});

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

    // Slack / Discord / GitHub Issue notifications
    let ownerRepo: { owner: string; repo: string } | undefined;
    try {
      const remote = getRemoteUrl(task.repos[0]);
      ownerRepo = parseOwnerRepo(remote) ?? undefined;
    } catch { /* no remote */ }
    notifyFailure(task, run, config, ownerRepo).catch(() => {});
  }

  closeStream(runId);
}
