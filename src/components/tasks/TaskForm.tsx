"use client";

import { useState, useEffect } from "react";
import type { Task, TaskPermissions, ScheduleType } from "@/lib/types";
import { PROVIDERS } from "@/lib/providers";
import type { ProviderKey } from "@/lib/providers";

interface Repo { name: string; path: string; branch: string }

const defaultPermissions: TaskPermissions = { runCommands: false, commit: false, push: false };
const defaultSchedule: ScheduleType = { kind: "manual" };

const SCHEDULE_PRESETS: { label: string; s: ScheduleType }[] = [
  { label: "Manual", s: { kind: "manual" } },
  { label: "Hourly", s: { kind: "hourly" } },
  { label: "6 am daily", s: { kind: "daily", hour: 6, minute: 0 } },
  { label: "9 am daily", s: { kind: "daily", hour: 9, minute: 0 } },
  { label: "12 pm daily", s: { kind: "daily", hour: 12, minute: 0 } },
  { label: "6 pm daily", s: { kind: "daily", hour: 18, minute: 0 } },
  { label: "Mon 9 am", s: { kind: "weekly", dayOfWeek: 1, hour: 9, minute: 0 } },
  { label: "Fri 6 pm", s: { kind: "weekly", dayOfWeek: 5, hour: 18, minute: 0 } },
  { label: "1st of month", s: { kind: "monthly", dayOfMonth: 1, hour: 9, minute: 0 } },
];

const LAST_SCHEDULE_KEY = "agentItAll:lastSchedule";

function scheduleMatches(a: ScheduleType, b: ScheduleType): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

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
  const [schedule, setSchedule] = useState<ScheduleType>(() => {
    if (task?.schedule) return task.schedule;
    try { return JSON.parse(localStorage.getItem(LAST_SCHEDULE_KEY) ?? "null") ?? defaultSchedule; }
    catch { return defaultSchedule; }
  });
  const [provider, setProvider] = useState<ProviderKey>(task?.provider ?? "groq");
  const [model, setModel] = useState(task?.model ?? PROVIDERS["groq"].models[0]);
  const [enabled, setEnabled] = useState(task?.enabled ?? true);

  const handleProviderChange = (p: ProviderKey) => {
    setProvider(p);
    setModel(PROVIDERS[p].models[0]);
  };

  useEffect(() => {
    fetch("/api/repos").then((r) => r.json()).then(setRepos);
  }, []);

  const toggleRepo = (path: string) => {
    setSelectedRepos((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]
    );
  };

  const setPerm = (key: keyof TaskPermissions, val: boolean) => {
    setPermissions((p) => {
      const next = { ...p, [key]: val };
      // push requires commit — auto-enable commit when push is enabled
      if (key === "push" && val) next.commit = true;
      // disabling commit also disables push
      if (key === "commit" && !val) next.push = false;
      return next;
    });
  };

  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (selectedRepos.length === 0) {
      setFormError("Select at least one repo.");
      return;
    }
    setFormError(null);
    onSave({ name, prompt, repos: selectedRepos, permissions, schedule, model, enabled, provider });
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
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {SCHEDULE_PRESETS.map(({ label, s }) => {
              const active = scheduleMatches(schedule, s);
              return (
                <button key={label} type="button" onClick={() => { setSchedule(s); localStorage.setItem(LAST_SCHEDULE_KEY, JSON.stringify(s)); }}
                  style={{ fontSize: 12, padding: "5px 12px", borderRadius: 20, border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`, background: active ? "rgba(124,110,247,0.15)" : "var(--surface2)", color: active ? "var(--accent)" : "var(--text)", cursor: "pointer", fontWeight: active ? 600 : 400 }}>
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Provider & Model */}
        <div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Provider &amp; Model</div>
          <select value={provider} onChange={(e) => handleProviderChange(e.target.value as ProviderKey)} style={inputStyle}>
            {(Object.keys(PROVIDERS) as ProviderKey[]).map((p) => (
              <option key={p} value={p}>{PROVIDERS[p].label}</option>
            ))}
          </select>
          <select value={model} onChange={(e) => setModel(e.target.value)} style={{ ...inputStyle, marginTop: 8 }}>
            {PROVIDERS[provider].models.map((m: string) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

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
