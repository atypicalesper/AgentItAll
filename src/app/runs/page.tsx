"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { RunLog } from "@/lib/types";
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

export default function RunsPage() {
  const [runs, setRuns] = useState<RunLog[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    const load = () => fetch("/api/runs").then((r) => r.json()).then(setRuns);
    load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, []);

  const cancel = async (runId: string) => {
    await fetch(`/api/runs/${runId}/cancel`, { method: "POST" });
  };

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Run History</h1>
        <p style={{ margin: "4px 0 0", color: "var(--text-muted)", fontSize: 14 }}>{runs.length} run{runs.length !== 1 ? "s" : ""}</p>
      </div>

      {runs.length === 0 && (
        <div style={{ textAlign: "center", padding: "80px 0", color: "var(--text-muted)" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div>No runs yet. Trigger a task from the Tasks page.</div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {runs.map((run) => {
          const open = expanded === run.id;
          const color = statusColor[run.status];

          return (
            <div key={run.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px" }}>
                {/* Status dot */}
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0, boxShadow: run.status === "running" ? `0 0 6px ${color}` : "none" }} />

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Link href={`/tasks/${run.taskId}`} style={{ fontWeight: 600, fontSize: 14, color: "var(--text)", textDecoration: "none" }}>{run.taskName}</Link>
                    <span style={{ fontSize: 11, color, fontWeight: 600, textTransform: "uppercase" }}>{run.status}</span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{run.trigger}</span>
                    {run.commitSha && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>· {run.commitSha}</span>}
                    {run.pushed && <span style={{ fontSize: 11, color: "var(--success)" }}>· pushed</span>}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                    {fmt(run.startedAt)}{run.finishedAt ? ` → ${fmt(run.finishedAt)}` : ""}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  {run.status === "running" && (
                    <button onClick={() => cancel(run.id)} style={{ fontSize: 12, padding: "4px 10px", background: "rgba(248,113,113,0.1)", border: "1px solid var(--error)", borderRadius: 6, color: "var(--error)", cursor: "pointer" }}>
                      Cancel
                    </button>
                  )}
                  <Link href={`/runs/${run.id}`} style={{ fontSize: 12, padding: "4px 10px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", textDecoration: "none" }}>
                    {run.status === "running" ? "Live →" : "View →"}
                  </Link>
                  <button onClick={() => setExpanded(open ? null : run.id)} style={{ fontSize: 12, padding: "4px 10px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-muted)", cursor: "pointer" }}>
                    {open ? "▲" : "▼"}
                  </button>
                </div>
              </div>

              {/* Inline expand (summary only — full detail is at /runs/[id]) */}
              {open && (
                <div style={{ padding: "0 18px 18px", borderTop: "1px solid var(--border)" }}>
                  {run.output && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>OUTPUT PREVIEW</div>
                      <pre style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: 10, fontSize: 12, fontFamily: "monospace", whiteSpace: "pre-wrap", maxHeight: 200, overflowY: "auto", margin: 0 }}>
                        {run.output.slice(0, 1000)}{run.output.length > 1000 ? "\n…(truncated — open full view)" : ""}
                      </pre>
                    </div>
                  )}
                  {run.edits.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>FILE CHANGES ({run.edits.length})</div>
                      <DiffViewer edits={run.edits} />
                    </div>
                  )}
                  {run.error && (
                    <div style={{ marginTop: 12, padding: 10, background: "rgba(248,113,113,0.1)", border: "1px solid var(--error)", borderRadius: 8, fontSize: 12, color: "var(--error)" }}>
                      {run.error}
                    </div>
                  )}
                  <div style={{ marginTop: 12 }}>
                    <Link href={`/runs/${run.id}`} style={{ fontSize: 13, color: "var(--accent)", textDecoration: "none" }}>Open full run view →</Link>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
