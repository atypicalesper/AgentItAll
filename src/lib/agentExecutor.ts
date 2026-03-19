import Anthropic from "@anthropic-ai/sdk";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { execSync } from "child_process";
import type { Task, RunLog, FileEdit } from "./types";
import { getConfig, upsertRun } from "./db";
import { getFileTree, readFile, getDiff, commitAll, push } from "./gitOps";
import { createStream, emit, closeStream } from "./streamStore";
import { sendEmail } from "./emailer";

const MAX_ITERATIONS = 20;

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
    upsertRun(run);
  };

  try {
    if (!config.ai.apiKey) throw new Error("No API key configured. Go to Settings and add your Anthropic API key.");

    // ── Pre-flight: verify repos exist ───────────────────────────────────────
    for (const repoPath of task.repos) {
      if (!existsSync(repoPath)) {
        throw new Error(`Repo not found: ${repoPath}. Update the task with a valid path.`);
      }
    }

    const client = new Anthropic({ apiKey: config.ai.apiKey });

    // ── Build context from repos ─────────────────────────────────────────────
    const repoContexts = task.repos.map((repoPath) => {
      const files = getFileTree(repoPath);
      const status = runCmd(repoPath, "git status --short");
      const recentLog = runCmd(repoPath, 'git log --oneline -10');
      return `## Repo: ${repoPath}\n\nFiles (git ls-files):\n${files}\n\nRecent commits:\n${recentLog}\n\nUncommitted changes:\n${status || "(clean)"}`;
    }).join("\n\n---\n\n");

    const systemPrompt = `You are an autonomous coding agent. You have been given a task to perform on one or more git repositories.

You have access to the following tools:
- read_file: Read a file from a repo
- write_file: Write/overwrite a file in a repo
- run_command: Run a shell command in a repo (only if permitted)
- commit: Commit all changes in a repo
- task_complete: Signal that you are done and provide a summary

Rules:
- Always read files before editing them
- Make targeted, minimal changes
- Write clear commit messages
- If a tool is unavailable (e.g. commit/push not permitted), work around it
- Call task_complete when done

Repository context:
${repoContexts}`;

    const tools: Anthropic.Tool[] = [
      {
        name: "read_file",
        description: "Read a file from a repository",
        input_schema: {
          type: "object" as const,
          properties: {
            repo_path: { type: "string", description: "Absolute path to the repo" },
            file_path: { type: "string", description: "Relative file path within the repo" },
          },
          required: ["repo_path", "file_path"],
        },
      },
      {
        name: "write_file",
        description: "Write content to a file in a repository",
        input_schema: {
          type: "object" as const,
          properties: {
            repo_path: { type: "string", description: "Absolute path to the repo" },
            file_path: { type: "string", description: "Relative file path within the repo" },
            content: { type: "string", description: "Full file content to write" },
          },
          required: ["repo_path", "file_path", "content"],
        },
      },
      {
        name: "run_command",
        description: "Run a shell command in a repository directory",
        input_schema: {
          type: "object" as const,
          properties: {
            repo_path: { type: "string", description: "Absolute path to the repo" },
            command: { type: "string", description: "Shell command to run" },
          },
          required: ["repo_path", "command"],
        },
      },
      {
        name: "commit",
        description: "Commit all staged and unstaged changes in a repo",
        input_schema: {
          type: "object" as const,
          properties: {
            repo_path: { type: "string", description: "Absolute path to the repo" },
            message: { type: "string", description: "Commit message" },
          },
          required: ["repo_path", "message"],
        },
      },
      {
        name: "task_complete",
        description: "Signal that the task is complete and provide a summary",
        input_schema: {
          type: "object" as const,
          properties: {
            summary: { type: "string", description: "Summary of what was done" },
          },
          required: ["summary"],
        },
      },
    ];

    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: task.prompt },
    ];

    log(runId, `\n[agent] Starting task: ${task.name}\n`);

    let iterations = 0;
    let done = false;
    let finalSummary = "";
    const pendingWrites = new Map<string, string>(); // "repo_path::file_path" → content

    while (!done && iterations < MAX_ITERATIONS) {
      iterations++;
      log(runId, `\n[agent] Iteration ${iterations}/${MAX_ITERATIONS}\n`);

      const response = await client.messages.create({
        model: task.model || config.ai.model,
        max_tokens: 4096,
        system: systemPrompt,
        tools,
        messages,
      });

      // Stream any text blocks
      for (const block of response.content) {
        if (block.type === "text") {
          log(runId, block.text);
          appendOutput(block.text);
        }
      }

      // Process tool calls
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== "tool_use") continue;

        const input = block.input as Record<string, string>;
        let result = "";

        if (block.name === "read_file") {
          const { repo_path, file_path } = input;
          log(runId, `\n[tool] read_file: ${file_path}\n`);
          result = readFile(repo_path, file_path);

        } else if (block.name === "write_file") {
          const { repo_path, file_path, content } = input;
          log(runId, `\n[tool] write_file: ${file_path}\n`);
          const key = `${repo_path}::${file_path}`;
          pendingWrites.set(key, content);
          // write immediately so run_command can use updated files
          const fullPath = join(repo_path, file_path);
          const dir = dirname(fullPath);
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          writeFileSync(fullPath, content, "utf8");
          result = `Written: ${file_path}`;

        } else if (block.name === "run_command") {
          const { repo_path, command } = input;
          if (!task.permissions.runCommands) {
            result = "(permission denied: runCommands is disabled for this task)";
          } else {
            log(runId, `\n[tool] run_command: ${command}\n`);
            run.commandsRun.push(command);
            result = runCmd(repo_path, command);
            log(runId, result + "\n");
          }

        } else if (block.name === "commit") {
          const { repo_path, message } = input;
          if (!task.permissions.commit) {
            result = "(permission denied: commit is disabled for this task)";
          } else {
            log(runId, `\n[tool] commit: ${message}\n`);
            const diff = getDiff(repo_path);
            const sha = commitAll(repo_path, message);
            run.commitSha = sha;
            if (diff) {
              const edits = parseDiffToEdits(diff);
              run.edits.push(...edits);
            }
            result = sha ? `Committed: ${sha}` : "(nothing to commit)";
          }

        } else if (block.name === "task_complete") {
          finalSummary = input.summary;
          done = true;
          result = "Task marked complete.";
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result,
        });
      }

      if (response.stop_reason === "end_turn" && !done) {
        done = true;
      }

      if (!done && toolResults.length > 0) {
        messages.push({ role: "assistant", content: response.content });
        messages.push({ role: "user", content: toolResults });
      }
    }

    // collect diffs for any uncommitted writes
    for (const repoPath of task.repos) {
      const diff = getDiff(repoPath);
      if (diff && !run.commitSha) {
        run.edits.push(...parseDiffToEdits(diff));
      }
      // push if permitted and committed
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
    appendOutput(`\n\n✓ Done: ${finalSummary}`);
    log(runId, `\n[agent] Complete.\n`);

    // send email digest
    if (config.smtp.enabled) {
      const body = `# agentItAll Run Complete\n\n**Task:** ${task.name}\n**Status:** ${run.status}\n**Trigger:** ${trigger}\n\n## Summary\n${finalSummary}\n\n## Commands Run\n${run.commandsRun.join("\n") || "(none)"}\n\n## Commit\n${run.commitSha ?? "(none)"}`;
      await sendEmail(config.smtp, `[agentItAll] ${task.name} — ${run.status}`, body);
      run.emailSent = true;
    }

    upsertRun(run);
  } catch (err) {
    run.status = "failed";
    run.finishedAt = new Date().toISOString();
    run.error = String(err);
    appendOutput(`\n[error] ${run.error}`);
    upsertRun(run);
    emit(runId, "error", run.error);
  } finally {
    closeStream(runId);
  }
}

function parseDiffToEdits(diff: string): FileEdit[] {
  const edits: FileEdit[] = [];
  const fileBlocks = diff.split(/^diff --git /m).filter(Boolean);
  for (const block of fileBlocks) {
    const match = block.match(/^a\/(.+?) b\//);
    if (match) {
      edits.push({ path: match[1], diff: "diff --git " + block });
    }
  }
  return edits;
}
