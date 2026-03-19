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
        {run.status === "running" && (
          <button onClick={cancel} style={{ fontSize: 13, padding: "6px 14px", background: "rgba(248,113,113,0.1)", border: "1px solid var(--error)", borderRadius: 8, color: "var(--error)", cursor: "pointer" }}>
            Cancel Run
          </button>
        )}
      </div>

      {/* Repos */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        {run.repos.map((r) => (
          <span key={r} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 20, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>{r.split("/").pop()}</span>
        ))}
      </div>

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
