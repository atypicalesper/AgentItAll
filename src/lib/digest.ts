import { getRuns } from "./db";
import { sendEmail } from "./emailer";
import type { AppConfig } from "./types";

export async function sendDailyDigest(config: AppConfig): Promise<void> {
  if (!config.smtp.enabled || !config.smtp.toAddress) return;

  const lookbackHours: Record<string, number> = {
    every_2h: 2, every_4h: 4, every_6h: 6, every_8h: 8, every_12h: 12, daily: 24,
  };
  const hours = lookbackHours[config.digest?.frequency ?? "daily"] ?? 24;
  const since = new Date();
  since.setHours(since.getHours() - hours);
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

  const body = `# agentItAll Digest

**${recent.length} run${recent.length !== 1 ? "s" : ""}** in the last ${hours} hour${hours !== 1 ? "s" : ""}:
✓ ${succeeded} succeeded  ✗ ${failed} failed

${totalTokens > 0 ? `**Tokens used:** ${totalTokens.toLocaleString()}  \n**Estimated cost:** $${totalCost.toFixed(4)}\n\n` : ""}## Runs
${rows}`;

  const date = new Date().toLocaleString();
  const label = hours < 24 ? `every ${hours}h` : "daily";
  await sendEmail(config.smtp, `[agentItAll] Digest (${label}) — ${date}`, body);
}
