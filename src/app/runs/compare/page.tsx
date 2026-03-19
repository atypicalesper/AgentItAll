"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import type { RunLog } from "@/lib/types";
import { Suspense } from "react";

const statusColor: Record<string, string> = {
  success: "var(--success)",
  failed: "var(--error)",
  cancelled: "var(--text-muted)",
  running: "var(--warning)",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString();
}

function fmtCost(usd?: number) {
  if (!usd) return "—";
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(3)}`;
}

function CompareContent() {
  const params = useSearchParams();
  const aId = params.get("a") ?? "";
  const bId = params.get("b") ?? "";
  const [a, setA] = useState<RunLog | null>(null);
  const [b, setB] = useState<RunLog | null>(null);

  useEffect(() => {
    if (aId) fetch(`/api/runs/${aId}`).then((r) => r.json()).then(setA);
    if (bId) fetch(`/api/runs/${bId}`).then((r) => r.json()).then(setB);
  }, [aId, bId]);

  if (!a || !b) return <div style={{ color: "var(--text-muted)" }}>Loading…</div>;

  const aFiles = new Set(a.edits.map((e) => e.path));
  const bFiles = new Set(b.edits.map((e) => e.path));
  const allFiles = [...new Set([...aFiles, ...bFiles])].sort();

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Link href="/runs" style={{ fontSize: 13, color: "var(--text-muted)", textDecoration: "none" }}>← Run History</Link>
      </div>
      <h1 style={{ margin: "0 0 24px", fontSize: 22, fontWeight: 700 }}>Compare Runs</h1>

      {/* Header row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        {[a, b].map((run, i) => (
          <div key={i} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor[run.status], flexShrink: 0 }} />
              <span style={{ fontWeight: 600, fontSize: 15 }}>{run.taskName}</span>
              <span style={{ fontSize: 11, color: statusColor[run.status], fontWeight: 600, textTransform: "uppercase" }}>{run.status}</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: 3 }}>
              <div>{fmt(run.startedAt)}</div>
              <div>{run.edits.length} file{run.edits.length !== 1 ? "s" : ""} changed · {run.commandsRun.length} commands</div>
              {run.tokenUsage && <div>{run.tokenUsage.totalTokens.toLocaleString()} tokens · {fmtCost(run.estimatedCost)}</div>}
              {run.commitSha && <div>commit <code style={{ fontFamily: "monospace" }}>{run.commitSha.slice(0, 7)}</code></div>}
            </div>
            <Link href={`/runs/${run.id}`} style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none", display: "inline-block", marginTop: 10 }}>
              View full run →
            </Link>
          </div>
        ))}
      </div>

      {/* File comparison table */}
      {allFiles.length > 0 && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)", fontSize: 12, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
            File Changes
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", borderBottom: "1px solid var(--border)", padding: "8px 20px", fontSize: 12, color: "var(--text-muted)" }}>
            <div>File</div>
            <div>Run A</div>
            <div>Run B</div>
          </div>
          {allFiles.map((path) => {
            const inA = aFiles.has(path);
            const inB = bFiles.has(path);
            return (
              <div key={path} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", padding: "8px 20px", borderBottom: "1px solid var(--border)", fontSize: 13, background: inA && inB ? "rgba(124,110,247,0.05)" : "transparent" }}>
                <div style={{ fontFamily: "monospace", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{path}</div>
                <div>{inA ? <span style={{ color: "var(--warning)" }}>modified</span> : <span style={{ color: "var(--text-muted)" }}>—</span>}</div>
                <div>{inB ? <span style={{ color: "var(--warning)" }}>modified</span> : <span style={{ color: "var(--text-muted)" }}>—</span>}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Output side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 24 }}>
        {[a, b].map((run, i) => (
          <div key={i}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Run {i === 0 ? "A" : "B"} Output</div>
            <pre style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: 12, fontSize: 12, fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 400, overflowY: "auto", margin: 0, color: "var(--text)" }}>
              {run.output?.slice(0, 3000) || "(no output)"}
              {(run.output?.length ?? 0) > 3000 ? "\n…truncated" : ""}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<div style={{ color: "var(--text-muted)" }}>Loading…</div>}>
      <CompareContent />
    </Suspense>
  );
}
