"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { Task, RunLog } from "@/lib/types";
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

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [task, setTask] = useState<Task | null>(null);
  const [runs, setRuns] = useState<RunLog[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    fetch(`/api/tasks/${id}`).then((r) => {
      if (!r.ok) { router.push("/tasks"); return; }
      return r.json();
    }).then((t) => t && setTask(t));
  }, [id, router]);

  useEffect(() => {
    const load = () => fetch(`/api/runs?taskId=${id}`).then((r) => r.json()).then(setRuns);
    load();
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, [id]);

  const handleRun = async () => {
    setStarting(true);
    try {
      const res = await fetch("/api/execute", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: id }) });
      const { runId } = await res.json();
      router.push(`/runs/${runId}`);
    } finally {
      setStarting(false);
    }
  };

  if (!task) return <div style={{ color: "var(--text-muted)" }}>Loading…</div>;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Link href="/tasks" style={{ fontSize: 13, color: "var(--text-muted)", textDecoration: "none" }}>← Tasks</Link>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>{task.name}</h1>
          <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--text-muted)", maxWidth: "60ch" }}>{task.prompt}</p>
        </div>
        <button onClick={handleRun} disabled={starting} style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 600, cursor: "pointer", opacity: starting ? 0.6 : 1 }}>
          {starting ? "Starting…" : "▶ Run Now"}
        </button>
      </div>

      {/* Task meta */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 28 }}>
        {task.repos.map((r) => <Tag key={r} label={r.split("/").pop()!} />)}
        <Tag label={`schedule: ${task.schedule.kind}`} />
        <Tag label={task.model} />
        {task.permissions.commit && <Tag label="commit" accent />}
        {task.permissions.push && <Tag label="push" accent />}
        {task.permissions.runCommands && <Tag label="run commands" accent />}
      </div>

      {/* Run history */}
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Run History ({runs.length})</h2>

      {runs.length === 0 && (
        <p style={{ color: "var(--text-muted)", fontSize: 14 }}>No runs yet.</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {runs.map((run) => {
          const open = expanded === run.id;
          return (
            <div key={run.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor[run.status], flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>
                    {fmt(run.startedAt)}
                    <span style={{ marginLeft: 8, fontSize: 11, color: statusColor[run.status], fontWeight: 600, textTransform: "uppercase" }}>{run.status}</span>
                    <span style={{ marginLeft: 8, fontSize: 11, color: "var(--text-muted)" }}>{run.trigger}</span>
                    {run.commitSha && <span style={{ marginLeft: 8, fontSize: 11, color: "var(--text-muted)" }}>· {run.commitSha}</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {run.status === "running" && (
                    <Link href={`/runs/${run.id}`} style={{ fontSize: 12, color: "var(--warning)", textDecoration: "none", border: "1px solid var(--warning)", borderRadius: 6, padding: "4px 10px" }}>Live →</Link>
                  )}
                  <button onClick={() => setExpanded(open ? null : run.id)} style={{ fontSize: 12, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 10px", cursor: "pointer", color: "var(--text)" }}>
                    {open ? "Hide" : "Details"}
                  </button>
                </div>
              </div>

              {open && (
                <div style={{ padding: "0 16px 16px", borderTop: "1px solid var(--border)" }}>
                  {run.output && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>OUTPUT</div>
                      <pre style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: 10, fontSize: 12, fontFamily: "monospace", whiteSpace: "pre-wrap", maxHeight: 200, overflowY: "auto", margin: 0 }}>{run.output}</pre>
                    </div>
                  )}
                  {run.edits.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>CHANGES ({run.edits.length} files)</div>
                      <DiffViewer edits={run.edits} />
                    </div>
                  )}
                  {run.error && <div style={{ marginTop: 12, padding: 10, background: "rgba(248,113,113,0.1)", border: "1px solid var(--error)", borderRadius: 8, fontSize: 12, color: "var(--error)" }}>{run.error}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Tag({ label, accent }: { label: string; accent?: boolean }) {
  return (
    <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 20, background: accent ? "rgba(124,110,247,0.1)" : "var(--surface)", border: `1px solid ${accent ? "var(--accent)" : "var(--border)"}`, color: accent ? "var(--accent)" : "var(--text-muted)" }}>
      {label}
    </span>
  );
}
