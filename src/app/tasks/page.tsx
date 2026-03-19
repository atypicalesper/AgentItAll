"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { Task } from "@/lib/types";
import TaskForm from "@/components/tasks/TaskForm";

const badge = (enabled: boolean, schedule: Task["schedule"]) => {
  if (!enabled) return { label: "Disabled", color: "var(--text-muted)" };
  if (schedule.kind === "manual") return { label: "Manual", color: "var(--text-muted)" };
  if (schedule.kind === "hourly") return { label: "Hourly", color: "var(--warning)" };
  if (schedule.kind === "daily") return { label: `Daily ${(schedule as { hour: number }).hour}:${String((schedule as { minute: number }).minute).padStart(2, "0")}`, color: "var(--success)" };
  if (schedule.kind === "weekly") return { label: "Weekly", color: "var(--accent)" };
  if (schedule.kind === "monthly") return { label: "Monthly", color: "var(--accent)" };
  return { label: "", color: "" };
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editTask, setEditTask] = useState<Task | undefined>();
  const [running, setRunning] = useState<Record<string, string>>({}); // taskId → runId

  const load = useCallback(() => {
    fetch("/api/tasks").then((r) => r.json()).then(setTasks);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (data: Partial<Task>) => {
    if (editTask) {
      await fetch(`/api/tasks/${editTask.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    } else {
      await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    }
    setShowForm(false);
    setEditTask(undefined);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this task?")) return;
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    load();
  };

  const handleRun = async (task: Task) => {
    const res = await fetch("/api/execute", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: task.id }) });
    const { runId } = await res.json();
    setRunning((r) => ({ ...r, [task.id]: runId }));
    setTimeout(() => setRunning((r) => { const n = { ...r }; delete n[task.id]; return n; }), 5000);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Tasks</h1>
          <p style={{ margin: "4px 0 0", color: "var(--text-muted)", fontSize: 14 }}>{tasks.length} task{tasks.length !== 1 ? "s" : ""}</p>
        </div>
        <button onClick={() => { setEditTask(undefined); setShowForm(true); }} style={primaryBtn}>+ New Task</button>
      </div>

      {tasks.length === 0 && (
        <div style={{ textAlign: "center", padding: "80px 0", color: "var(--text-muted)" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚡</div>
          <div style={{ fontSize: 16 }}>No tasks yet. Create your first task.</div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {tasks.map((task) => {
          const { label, color } = badge(task.enabled, task.schedule);
          const isRunning = !!running[task.id];
          return (
            <div key={task.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px", display: "flex", alignItems: "flex-start", gap: 16 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{task.name}</span>
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: "var(--surface2)", color, fontWeight: 600 }}>{label}</span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{task.model.split("-").slice(1, 3).join("-")}</span>
                </div>
                <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "60ch" }}>{task.prompt}</p>
                <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  {task.repos.map((r) => <span key={r} style={{ fontSize: 11, padding: "2px 8px", background: "var(--surface2)", borderRadius: 8, color: "var(--text-muted)" }}>{r.split("/").pop()}</span>)}
                  {task.permissions.commit && <span style={{ fontSize: 11, padding: "2px 8px", background: "rgba(124,110,247,0.1)", borderRadius: 8, color: "var(--accent)" }}>commit</span>}
                  {task.permissions.push && <span style={{ fontSize: 11, padding: "2px 8px", background: "rgba(124,110,247,0.1)", borderRadius: 8, color: "var(--accent)" }}>push</span>}
                  {task.permissions.runCommands && <span style={{ fontSize: 11, padding: "2px 8px", background: "rgba(124,110,247,0.1)", borderRadius: 8, color: "var(--accent)" }}>run cmds</span>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button onClick={() => handleRun(task)} disabled={isRunning} style={{ ...primaryBtn, opacity: isRunning ? 0.6 : 1, fontSize: 13 }}>
                  {isRunning ? "Running…" : "▶ Run"}
                </button>
                {isRunning && (
                  <Link href={`/runs`} style={{ ...secondaryBtn, fontSize: 13, textDecoration: "none", display: "flex", alignItems: "center" }}>View Log</Link>
                )}
                <button onClick={() => { setEditTask(task); setShowForm(true); }} style={secondaryBtn}>Edit</button>
                <button onClick={() => handleDelete(task.id)} style={{ ...secondaryBtn, color: "var(--error)", borderColor: "transparent" }}>Delete</button>
              </div>
            </div>
          );
        })}
      </div>

      {showForm && (
        <TaskForm
          task={editTask}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditTask(undefined); }}
        />
      )}
    </div>
  );
}

const primaryBtn: React.CSSProperties = { background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer" };
const secondaryBtn: React.CSSProperties = { background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 14px", fontSize: 14, cursor: "pointer" };
