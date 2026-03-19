"use client";

import { useState, useEffect } from "react";
import type { Task, TaskPermissions, ScheduleType } from "@/lib/types";

interface Repo { name: string; path: string; branch: string }

const MODELS = [
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-6",
  "claude-opus-4-6",
];

const defaultPermissions: TaskPermissions = { runCommands: false, commit: false, push: false };
const defaultSchedule: ScheduleType = { kind: "manual" };

interface Props {
  task?: Task;
  onSave: (data: Partial<Task>) => void;
  onCancel: () => void;
}

export default function TaskForm({ task, onSave, onCancel }: Props) {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [name, setName] = useState(task?.name ?? "");
  const [prompt, setPrompt] = useState(task?.prompt ?? "");
  const [selectedRepos, setSelectedRepos] = useState<string[]>(task?.repos ?? []);
  const [permissions, setPermissions] = useState<TaskPermissions>(task?.permissions ?? defaultPermissions);
  const [schedule, setSchedule] = useState<ScheduleType>(task?.schedule ?? defaultSchedule);
  const [model, setModel] = useState(task?.model ?? MODELS[0]);
  const [enabled, setEnabled] = useState(task?.enabled ?? true);

  useEffect(() => {
    fetch("/api/repos").then((r) => r.json()).then(setRepos);
  }, []);

  const toggleRepo = (path: string) => {
    setSelectedRepos((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]
    );
  };

  const setPerm = (key: keyof TaskPermissions, val: boolean) => {
    setPermissions((p) => ({ ...p, [key]: val }));
  };

  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (selectedRepos.length === 0) {
      setFormError("Select at least one repo.");
      return;
    }
    setFormError(null);
    onSave({ name, prompt, repos: selectedRepos, permissions, schedule, model, enabled, provider: "anthropic" });
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <form onSubmit={handleSubmit} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 32, width: "min(640px, 95vw)", maxHeight: "90vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 20 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{task ? "Edit Task" : "New Task"}</h2>

        {/* Name */}
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>Task Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Refactor auth in COMET-fy" style={inputStyle} />
        </label>

        {/* Prompt */}
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>Prompt / Instructions</span>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} required rows={5} placeholder="Describe exactly what the agent should do..." style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
        </label>

        {/* Repos */}
        <div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Target Repos</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, overflowY: "auto" }}>
            {repos.map((r) => (
              <label key={r.path} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: selectedRepos.includes(r.path) ? "var(--surface2)" : "transparent", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={selectedRepos.includes(r.path)} onChange={() => toggleRepo(r.path)} />
                <span style={{ fontWeight: 500 }}>{r.name}</span>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{r.branch}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Permissions */}
        <div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Permissions</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {(Object.keys(defaultPermissions) as (keyof TaskPermissions)[]).map((key) => (
              <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: permissions[key] ? "rgba(124,110,247,0.15)" : "var(--surface2)", border: `1px solid ${permissions[key] ? "var(--accent)" : "var(--border)"}`, borderRadius: 20, cursor: "pointer", fontSize: 13 }}>
                <input type="checkbox" checked={permissions[key]} onChange={(e) => setPerm(key, e.target.checked)} style={{ accentColor: "var(--accent)" }} />
                {key === "runCommands" ? "Run Commands" : key === "commit" ? "Commit" : "Push"}
              </label>
            ))}
          </div>
        </div>

        {/* Schedule */}
        <div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Schedule</div>
          <select value={schedule.kind} onChange={(e) => setSchedule({ kind: e.target.value as ScheduleType["kind"], hour: 9, minute: 0, dayOfWeek: 1, dayOfMonth: 1 } as ScheduleType)} style={inputStyle}>
            <option value="manual">Manual only</option>
            <option value="hourly">Every hour</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>

          {schedule.kind === "daily" && (
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input type="number" min={0} max={23} value={(schedule as { kind: "daily"; hour: number }).hour} onChange={(e) => setSchedule({ ...schedule, hour: +e.target.value } as ScheduleType)} placeholder="Hour (0-23)" style={{ ...inputStyle, flex: 1 }} />
              <input type="number" min={0} max={59} value={(schedule as { kind: "daily"; minute: number }).minute} onChange={(e) => setSchedule({ ...schedule, minute: +e.target.value } as ScheduleType)} placeholder="Minute" style={{ ...inputStyle, flex: 1 }} />
            </div>
          )}
          {schedule.kind === "weekly" && (
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <select value={(schedule as { kind: "weekly"; dayOfWeek: number }).dayOfWeek} onChange={(e) => setSchedule({ ...schedule, dayOfWeek: +e.target.value } as ScheduleType)} style={{ ...inputStyle, flex: 1 }}>
                {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
              <input type="number" min={0} max={23} placeholder="Hour" value={(schedule as { kind: "weekly"; hour: number }).hour} onChange={(e) => setSchedule({ ...schedule, hour: +e.target.value } as ScheduleType)} style={{ ...inputStyle, flex: 1 }} />
              <input type="number" min={0} max={59} placeholder="Minute" value={(schedule as { kind: "weekly"; minute: number }).minute} onChange={(e) => setSchedule({ ...schedule, minute: +e.target.value } as ScheduleType)} style={{ ...inputStyle, flex: 1 }} />
            </div>
          )}
          {schedule.kind === "monthly" && (
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input type="number" min={1} max={28} placeholder="Day of month" value={(schedule as { kind: "monthly"; dayOfMonth: number }).dayOfMonth} onChange={(e) => setSchedule({ ...schedule, dayOfMonth: +e.target.value } as ScheduleType)} style={{ ...inputStyle, flex: 1 }} />
              <input type="number" min={0} max={23} placeholder="Hour" value={(schedule as { kind: "monthly"; hour: number }).hour} onChange={(e) => setSchedule({ ...schedule, hour: +e.target.value } as ScheduleType)} style={{ ...inputStyle, flex: 1 }} />
              <input type="number" min={0} max={59} placeholder="Minute" value={(schedule as { kind: "monthly"; minute: number }).minute} onChange={(e) => setSchedule({ ...schedule, minute: +e.target.value } as ScheduleType)} style={{ ...inputStyle, flex: 1 }} />
            </div>
          )}
        </div>

        {/* Model */}
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>Model</span>
          <select value={model} onChange={(e) => setModel(e.target.value)} style={inputStyle}>
            {MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>

        {/* Enabled */}
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} style={{ accentColor: "var(--accent)", width: 16, height: 16 }} />
          <span style={{ fontSize: 14 }}>Enabled (allow scheduled runs)</span>
        </label>

        {/* Validation error */}
        {formError && (
          <div style={{ fontSize: 13, color: "var(--error)", padding: "8px 12px", background: "rgba(248,113,113,0.1)", border: "1px solid var(--error)", borderRadius: 8 }}>
            {formError}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
          <button type="button" onClick={onCancel} style={secondaryBtn}>Cancel</button>
          <button type="submit" style={primaryBtn}>Save Task</button>
        </div>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--surface2)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "10px 12px",
  color: "var(--text)",
  fontSize: 14,
  width: "100%",
  outline: "none",
};

const primaryBtn: React.CSSProperties = {
  background: "var(--accent)",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "10px 20px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  background: "var(--surface2)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "10px 20px",
  fontSize: 14,
  cursor: "pointer",
};
