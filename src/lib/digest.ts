import { getRuns } from "./db";
import { sendEmail } from "./emailer";
import type { AppConfig } from "./types";

export async function sendDailyDigest(config: AppConfig): Promise<void> {
  if (!config.smtp.enabled || !config.smtp.toAddress) return;

  const since = new Date();
  since.setHours(since.getHours() - 24);
  const isoSince = since.toISOString();

  const allRuns = getRuns();
  const recent = allRuns.filter((r) => r.startedAt >= isoSince && r.status !== "running");
  if (recent.length === 0) return; // nothing to digest

  const succeeded = recent.filter((r) => r.status === "success").length;
  const failed    = recent.filter((r) => r.status === "failed").length;
  const totalTokens = recent.reduce((s, r) => s + (r.tokenUsage?.totalTokens ?? 0), 0);
  const totalCost   = recent.reduce((s, r) => s + (r.estimatedCost ?? 0), 0);

  const rows = recent
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .map((r) => {
      const icon = r.status === "success" ? "✓" : r.status === "failed" ? "✗" : "—";
      const cost = r.estimatedCost ? ` ($${r.estimatedCost.toFixed(4)})` : "";
      return `${icon} **${r.taskName}** — ${r.status} · ${new Date(r.startedAt).toLocaleTimeString()}${cost}`;
    })
    .join("\n");

  const body = `# agentItAll Daily Digest

**${recent.length} run${recent.length !== 1 ? "s" : ""}** in the last 24 hours:
✓ ${succeeded} succeeded  ✗ ${failed} failed

${totalTokens > 0 ? `**Tokens used:** ${totalTokens.toLocaleString()}  \n**Estimated cost:** $${totalCost.toFixed(4)}\n\n` : ""}## Runs
${rows}`;

  const date = new Date().toLocaleDateString();
  await sendEmail(config.smtp, `[agentItAll] Daily digest — ${date}`, body);
}
