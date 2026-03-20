"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { RunLog } from "@/lib/types";
import LiveStream from "@/components/runs/LiveStream";
import DiffViewer from "@/components/runs/DiffViewer";

const statusColor: Record<string, string> = {
  running: "var(--warning)",
  success: "var(--success)",
  failed: "var(--error)",
  cancelled: "var(--text-muted)",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString();
}

function duration(start: string, end?: string) {
  const ms = new Date(end ?? new Date()).getTime() - new Date(start).getTime();
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

export default function RunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [run, setRun] = useState<RunLog | null>(null);

  const cancel = async () => {
    await fetch(`/api/runs/${id}/cancel`, { method: "POST" });
  };

  const rerun = async () => {
    const res = await fetch(`/api/runs/${id}/rerun`, { method: "POST" });
    const { runId } = await res.json() as { runId: string };
    window.location.href = `/runs/${runId}`;
  };

  const approve = async (action: "approve" | "reject") => {
    await fetch(`/api/runs/${id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    setRun((r) => r ? { ...r, approvalStatus: action === "approve" ? "approved" : "rejected" } : r);
  };

  useEffect(() => {
    const load = () =>
      fetch(`/api/runs/${id}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((r) => r && setRun(r));

    load();
    // poll until done
    const interval = setInterval(() => {
      if (run?.status !== "running") return;
      load();
    }, 3000);
    return () => clearInterval(interval);
  }, [id, run?.status]);

  if (!run) return <div style={{ color: "var(--text-muted)" }}>Loading…</div>;

  const color = statusColor[run.status];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Link href="/runs" style={{ fontSize: 13, color: "var(--text-muted)", textDecoration: "none" }}>← Run History</Link>
      </div>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0, boxShadow: run.status === "running" ? `0 0 8px ${color}` : "none" }} />
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{run.taskName}</h1>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 3 }}>
            <span style={{ color, fontWeight: 600, textTransform: "uppercase", marginRight: 10 }}>{run.status}</span>
            {fmt(run.startedAt)}
            {run.finishedAt && <> → {fmt(run.finishedAt)}</>}
            <span style={{ marginLeft: 10 }}>· {run.trigger}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {run.status !== "running" && (
            <button onClick={rerun} style={{ fontSize: 13, padding: "6px 14px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", cursor: "pointer" }}>
              ↺ Re-run
            </button>
          )}
          {run.status === "running" && (
            <button onClick={cancel} style={{ fontSize: 13, padding: "6px 14px", background: "rgba(248,113,113,0.1)", border: "1px solid var(--error)", borderRadius: 8, color: "var(--error)", cursor: "pointer" }}>
              Cancel Run
            </button>
          )}
        </div>
      </div>

      {/* Meta row — repos + badges */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        {run.repos.map((r) => (
          <span key={r} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 20, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>{r.split("/").pop()}</span>
        ))}
        {run.isDryRun && <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 20, background: "rgba(251,191,36,0.1)", border: "1px solid var(--warning)", color: "var(--warning)", fontWeight: 600 }}>DRY RUN</span>}
        {run.attempt && run.attempt > 1 && <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 20, background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>Attempt {run.attempt}</span>}
        {run.emailSent && <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 20, background: "rgba(74,222,128,0.08)", border: "1px solid var(--success)", color: "var(--success)" }}>Email sent</span>}
      </div>

      {/* Summary card */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10, marginBottom: 28 }}>
        <MetaCard label="Duration" value={duration(run.startedAt, run.finishedAt)} />
        <MetaCard label="Trigger" value={run.trigger} />
        <MetaCard label="Files changed" value={String(run.edits.length)} />
        <MetaCard label="Commands run" value={String(run.commandsRun.length)} />
        {run.estimatedCost != null && <MetaCard label="Est. cost" value={`$${run.estimatedCost.toFixed(4)}`} accent />}
        {run.tokenUsage && <MetaCard label="Total tokens" value={run.tokenUsage.totalTokens.toLocaleString()} />}
        {run.commitSha && <MetaCard label="Commit" value={run.commitSha.slice(0, 7)} mono />}
        {run.pushed && <MetaCard label="Pushed" value="Yes" accent />}
      </div>

      {/* Input variables */}
      {run.inputVarValues && Object.keys(run.inputVarValues).length > 0 && (
        <Section title="Input Variables">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {Object.entries(run.inputVarValues).map(([k, v]) => (
              <div key={k} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 12px", fontSize: 13 }}>
                <span style={{ color: "var(--text-muted)" }}>{k}: </span>
                <code style={{ fontFamily: "monospace", color: "var(--text)" }}>{v}</code>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Approval banner */}
      {run.approvalStatus === "pending" && (
        <div style={{ marginBottom: 24, padding: "16px 20px", background: "rgba(251,191,36,0.08)", border: "1px solid var(--warning)", borderRadius: 10 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>⏳ Awaiting approval</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 14 }}>
            The agent has written file changes but held the commit. Review the diff below then approve or reject.
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => approve("approve")}
              style={{ background: "var(--success)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              ✓ Approve &amp; Commit
            </button>
            <button onClick={() => approve("reject")}
              style={{ background: "rgba(248,113,113,0.1)", color: "var(--error)", border: "1px solid var(--error)", borderRadius: 8, padding: "8px 20px", fontSize: 13, cursor: "pointer" }}>
              ✗ Reject &amp; Discard
            </button>
          </div>
        </div>
      )}
      {run.approvalStatus === "approved" && (
        <div style={{ marginBottom: 24, padding: "10px 16px", background: "rgba(74,222,128,0.08)", border: "1px solid var(--success)", borderRadius: 10, fontSize: 13, color: "var(--success)", fontWeight: 600 }}>
          ✓ Approved — changes committed
        </div>
      )}
      {run.approvalStatus === "rejected" && (
        <div style={{ marginBottom: 24, padding: "10px 16px", background: "rgba(248,113,113,0.08)", border: "1px solid var(--error)", borderRadius: 10, fontSize: 13, color: "var(--error)", fontWeight: 600 }}>
          ✗ Rejected — changes discarded
        </div>
      )}

      {/* Live stream (only when running) */}
      {run.status === "running" && (
        <Section title="Live Output">
          <LiveStream runId={run.id} />
        </Section>
      )}

      {/* Completed output */}
      {run.output && run.status !== "running" && (
        <Section title="Output" action={<CopyButton text={run.output} />}>
          <pre style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: 14, fontSize: 13, fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 480, overflowY: "auto", margin: 0, color: "var(--text)" }}>
            {run.output}
          </pre>
        </Section>
      )}

      {/* File changes */}
      {run.edits.length > 0 && (
        <Section title={`File Changes (${run.edits.length})`}>
          <DiffViewer edits={run.edits} />
        </Section>
      )}

      {/* Commands */}
      {run.commandsRun.length > 0 && (
        <Section title="Commands Run">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {run.commandsRun.map((cmd, i) => (
              <code key={i} style={{ fontSize: 13, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 12px", display: "block", fontFamily: "monospace" }}>{cmd}</code>
            ))}
          </div>
        </Section>
      )}

      {/* Error */}
      {run.error && (
        <Section title="Error">
          <div style={{ padding: 12, background: "rgba(248,113,113,0.1)", border: "1px solid var(--error)", borderRadius: 8, fontSize: 13, color: "var(--error)", fontFamily: "monospace" }}>
            {run.error}
          </div>
        </Section>
      )}

      {/* Token usage */}
      {run.tokenUsage && (
        <Section title="Token Usage">
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {[
              { label: "Prompt",     value: run.tokenUsage.promptTokens },
              { label: "Completion", value: run.tokenUsage.completionTokens },
              { label: "Total",      value: run.tokenUsage.totalTokens },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 16px", minWidth: 110 }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{value.toLocaleString()}</div>
              </div>
            ))}
            {run.estimatedCost != null && (
              <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 16px", minWidth: 110 }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Est. Cost</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "var(--accent)" }}>${run.estimatedCost.toFixed(4)}</div>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Chained runs */}
      {run.chainedRunIds && run.chainedRunIds.length > 0 && (
        <Section title="Chained Runs">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {run.chainedRunIds.map((rid) => (
              <Link key={rid} href={`/runs/${rid}`} style={{ fontSize: 13, color: "var(--accent)", textDecoration: "none" }}>→ Run {rid}</Link>
            ))}
          </div>
        </Section>
      )}

      {/* Branch / PR */}
      {(run.branchName || run.prUrl || (run.commitShas && run.commitShas.length > 0)) && (
        <Section title="Branch &amp; PR">
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
            {run.branchName && (
              <div style={{ color: "var(--text-muted)" }}>
                Branch: <code style={{ fontFamily: "monospace", color: "var(--text)", background: "var(--surface2)", padding: "1px 6px", borderRadius: 4 }}>{run.branchName}</code>
              </div>
            )}
            {run.commitShas && run.commitShas.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {run.commitShas.map((sha) => (
                  <code key={sha} style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text-muted)", background: "var(--surface2)", padding: "2px 8px", borderRadius: 4, width: "fit-content" }}>{sha.slice(0, 12)}</code>
                ))}
              </div>
            )}
            {run.prUrl && (
              <a href={run.prUrl} target="_blank" rel="noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "rgba(124,110,247,0.1)", border: "1px solid var(--accent)", borderRadius: 8, color: "var(--accent)", fontWeight: 600, textDecoration: "none", width: "fit-content" }}>
                View Pull Request →
              </a>
            )}
          </div>
        </Section>
      )}

      <div style={{ marginTop: 24 }}>
        <Link href={`/tasks/${run.taskId}`} style={{ fontSize: 13, color: "var(--accent)", textDecoration: "none" }}>← Back to {run.taskName}</Link>
      </div>
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      style={{ fontSize: 11, padding: "3px 10px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 6, color: copied ? "var(--success)" : "var(--text-muted)", cursor: "pointer" }}>
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function MetaCard({ label, value, accent, mono }: { label: string; value: string; accent?: boolean; mono?: boolean }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px" }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: accent ? "var(--accent)" : "var(--text)", fontFamily: mono ? "monospace" : "inherit" }}>{value}</div>
    </div>
  );
}
