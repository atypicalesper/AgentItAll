import type { Task, RunLog } from "./types";
import type { AppConfig } from "./types";

// ── Slack ─────────────────────────────────────────────────────────────────────

async function sendSlack(webhookUrl: string, text: string): Promise<void> {
  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}

// ── Discord ───────────────────────────────────────────────────────────────────

async function sendDiscord(webhookUrl: string, content: string): Promise<void> {
  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
}

// ── GitHub Issues ─────────────────────────────────────────────────────────────

async function openGitHubIssue(
  token: string,
  owner: string,
  repo: string,
  title: string,
  body: string,
): Promise<string | null> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ title, body, labels: ["agent-failure"] }),
  });
  const data = await res.json() as { html_url?: string };
  return data.html_url ?? null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function notifySuccess(task: Task, run: RunLog): Promise<void> {
  const summary = `✓ *${task.name}* succeeded${run.estimatedCost ? ` — ${formatCost(run.estimatedCost)}` : ""}`;
  if (task.slackWebhook)   sendSlack(task.slackWebhook, summary).catch(() => {});
  if (task.discordWebhook) sendDiscord(task.discordWebhook, summary).catch(() => {});
}

export async function notifyFailure(
  task: Task,
  run: RunLog,
  config: AppConfig,
  ownerRepo?: { owner: string; repo: string },
): Promise<void> {
  const msg = `✗ *${task.name}* failed — ${run.error ?? "unknown error"}`;
  if (task.slackWebhook)   sendSlack(task.slackWebhook, msg).catch(() => {});
  if (task.discordWebhook) sendDiscord(task.discordWebhook, msg).catch(() => {});

  if (task.createIssueOnFailure && config.githubToken && ownerRepo) {
    const body = `## agentItAll run failed\n\n**Task:** ${task.name}\n**Run ID:** ${run.id}\n**Error:**\n\`\`\`\n${run.error ?? "unknown"}\n\`\`\`\n\n**Output preview:**\n\`\`\`\n${run.output.slice(0, 1500)}\n\`\`\``;
    openGitHubIssue(config.githubToken, ownerRepo.owner, ownerRepo.repo, `[agent] ${task.name} failed`, body).catch(() => {});
  }
}

function formatCost(usd: number): string {
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(3)}`;
}
