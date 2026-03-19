"use client";

import { useEffect, useState } from "react";
import type { RunLog } from "@/lib/types";
import DiffViewer from "@/components/runs/DiffViewer";
import LiveStream from "@/components/runs/LiveStream";

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
          return (
            <div key={run.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
              <button
                onClick={() => setExpanded(open ? null : run.id)}
                style={{ width: "100%", background: "none", border: "none", cursor: "pointer", padding: "16px 20px", display: "flex", alignItems: "center", gap: 14, textAlign: "left" }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor[run.status], flexShrink: 0, boxShadow: run.status === "running" ? `0 0 6px ${statusColor[run.status]}` : "none" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: "var(--text)" }}>{run.taskName}</span>
                    <span style={{ fontSize: 11, color: statusColor[run.status], fontWeight: 600, textTransform: "uppercase" }}>{run.status}</span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{run.trigger}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                    {fmt(run.startedAt)} {run.finishedAt ? `→ ${fmt(run.finishedAt)}` : ""}
                    {run.commitSha ? ` · commit ${run.commitSha}` : ""}
                    {run.pushed ? " · pushed" : ""}
                  </div>
                </div>
                <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{open ? "▲" : "▼"}</span>
              </button>

              {open && (
                <div style={{ padding: "0 20px 20px", borderTop: "1px solid var(--border)" }}>
                  {run.status === "running" && (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>LIVE OUTPUT</div>
                      <LiveStream runId={run.id} />
                    </div>
                  )}

                  {run.output && run.status !== "running" && (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>OUTPUT</div>
                      <pre style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: 12, fontSize: 12, fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 300, overflowY: "auto", margin: 0 }}>{run.output}</pre>
                    </div>
                  )}

                  {run.edits.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>FILE CHANGES ({run.edits.length})</div>
                      <DiffViewer edits={run.edits} />
                    </div>
                  )}

                  {run.commandsRun.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>COMMANDS RUN</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {run.commandsRun.map((cmd, i) => (
                          <code key={i} style={{ fontSize: 12, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 10px", display: "block" }}>{cmd}</code>
                        ))}
                      </div>
                    </div>
                  )}

                  {run.error && (
                    <div style={{ marginTop: 16, padding: 12, background: "rgba(248,113,113,0.1)", border: "1px solid var(--error)", borderRadius: 8, fontSize: 13, color: "var(--error)" }}>
                      {run.error}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
