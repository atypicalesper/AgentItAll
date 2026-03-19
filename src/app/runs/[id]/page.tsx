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
            {run.commitSha && <span style={{ marginLeft: 10 }}>· commit <code style={{ fontFamily: "monospace" }}>{run.commitSha}</code></span>}
            {run.pushed && <span style={{ marginLeft: 10, color: "var(--success)" }}>· pushed</span>}
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

      {/* Repos */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        {run.repos.map((r) => (
          <span key={r} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 20, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>{r.split("/").pop()}</span>
        ))}
      </div>

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
        <Section title="Output">
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
              { label: "Prompt", value: run.tokenUsage.promptTokens },
              { label: "Completion", value: run.tokenUsage.completionTokens },
              { label: "Total", value: run.tokenUsage.totalTokens },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 16px", minWidth: 110 }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{value.toLocaleString()}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Branch / PR */}
      {(run.branchName || run.prUrl) && (
        <Section title="Branch &amp; PR">
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
            {run.branchName && <div style={{ color: "var(--text-muted)" }}>Branch: <code style={{ fontFamily: "monospace", color: "var(--text)" }}>{run.branchName}</code></div>}
            {run.prUrl && <a href={run.prUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>View Pull Request →</a>}
          </div>
        </Section>
      )}

      <div style={{ marginTop: 24 }}>
        <Link href={`/tasks/${run.taskId}`} style={{ fontSize: 13, color: "var(--accent)", textDecoration: "none" }}>← Back to {run.taskName}</Link>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 10px" }}>{title}</h2>
      {children}
    </div>
  );
}
