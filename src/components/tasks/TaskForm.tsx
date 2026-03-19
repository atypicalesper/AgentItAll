"use client";

import { useState, useEffect } from "react";
import type { Task, TaskPermissions, ScheduleType, CustomTool } from "@/lib/types";
import { PROVIDERS } from "@/lib/providers";
import type { ProviderKey } from "@/lib/providers";
import { TASK_TEMPLATES } from "@/lib/taskTemplates";
import { validateCronExpr } from "@/lib/scheduleUtils";

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
  const [allTasks, setAllTasks] = useState<Task[]>([]);
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
  // Advanced
  const [branchPerRun, setBranchPerRun] = useState(task?.branchPerRun ?? false);
  const [githubPrOnPush, setGithubPrOnPush] = useState(task?.githubPrOnPush ?? false);
  const [requiresApproval, setRequiresApproval] = useState(task?.requiresApproval ?? false);
  const [retryOnFailure, setRetryOnFailure] = useState(task?.retryOnFailure ?? false);
  const [maxRetries, setMaxRetries] = useState(task?.maxRetries ?? 3);
  const [triggerTaskIds, setTriggerTaskIds] = useState<string[]>(task?.triggerTaskIds ?? []);
  // New fields
  const [dryRun, setDryRun] = useState(task?.dryRun ?? false);
  const [costBudget, setCostBudget] = useState(task?.costBudget ?? "");
  const [inputVars, setInputVars] = useState((task?.inputVars ?? []).join(", "));
  const [slackWebhook, setSlackWebhook] = useState(task?.slackWebhook ?? "");
  const [discordWebhook, setDiscordWebhook] = useState(task?.discordWebhook ?? "");
  const [createIssueOnFailure, setCreateIssueOnFailure] = useState(task?.createIssueOnFailure ?? false);
  const [watchPaths, setWatchPaths] = useState((task?.watchPaths ?? []).join("\n"));
  const [cronExpr, setCronExpr] = useState(task?.schedule?.kind === "cron" ? task.schedule.expr : "");
  const [customTools, setCustomTools] = useState<CustomTool[]>(task?.customTools ?? []);
  const [envVarsText, setEnvVarsText] = useState(
    Object.entries(task?.envVars ?? {}).map(([k, v]) => `${k}=${v}`).join("\n")
  );
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleProviderChange = (p: ProviderKey) => {
    setProvider(p);
    setModel(PROVIDERS[p].models[0]);
  };

  useEffect(() => {
    fetch("/api/repos").then((r) => r.json()).then(setRepos);
    fetch("/api/tasks").then((r) => r.json()).then(setAllTasks);
  }, []);

  const toggleRepo = (path: string) => {
    setSelectedRepos((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]
    );
  };

  const toggleTrigger = (id: string) => {
    setTriggerTaskIds((prev) => prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]);
  };

  const setPerm = (key: keyof TaskPermissions, val: boolean) => {
    setPermissions((p) => {
      const next = { ...p, [key]: val };
      if (key === "push" && val) next.commit = true;
      if (key === "commit" && !val) next.push = false;
      return next;
    });
  };

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (selectedRepos.length === 0) { setFormError("Select at least one repo."); return; }
    if (cronExpr.trim()) {
      const cronErr = validateCronExpr(cronExpr.trim());
      if (cronErr) { setFormError(`Invalid cron expression: ${cronErr}`); return; }
    }
    setFormError(null);
    const resolvedSchedule: typeof schedule = cronExpr.trim()
      ? { kind: "cron", expr: cronExpr.trim() }
      : schedule;
    onSave({
      name, prompt, repos: selectedRepos, permissions, schedule: resolvedSchedule, model, enabled, provider,
      branchPerRun, githubPrOnPush, requiresApproval,
      retryOnFailure, maxRetries: retryOnFailure ? maxRetries : undefined,
      triggerTaskIds: triggerTaskIds.length ? triggerTaskIds : undefined,
      dryRun,
      costBudget: costBudget !== "" ? Number(costBudget) : undefined,
      inputVars: inputVars.trim() ? inputVars.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
      slackWebhook: slackWebhook.trim() || undefined,
      discordWebhook: discordWebhook.trim() || undefined,
      createIssueOnFailure: createIssueOnFailure || undefined,
      watchPaths: watchPaths.trim() ? watchPaths.split("\n").map((s) => s.trim()).filter(Boolean) : undefined,
      customTools: customTools.length ? customTools : undefined,
      envVars: envVarsText.trim() ? Object.fromEntries(
        envVarsText.split("\n").map((s) => s.trim()).filter(Boolean).map((line) => {
          const idx = line.indexOf("=");
          return idx > 0 ? [line.slice(0, idx), line.slice(idx + 1)] : [line, ""];
        })
      ) : undefined,
    });
  };

  const otherTasks = allTasks.filter((t) => t.id !== task?.id);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <form onSubmit={handleSubmit} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 32, width: "min(660px, 95vw)", maxHeight: "90vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 20 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{task ? "Edit Task" : "New Task"}</h2>

        {/* Templates (new task only) */}
        {!task && (
          <div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Templates</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {TASK_TEMPLATES.map((t) => (
                <button key={t.name} type="button"
                  onClick={() => { setName(t.name); setPrompt(t.prompt); }}
                  style={{ fontSize: 12, padding: "5px 10px", borderRadius: 8, border: "1px solid var(--border)", background: name === t.name ? "rgba(124,110,247,0.15)" : "var(--surface2)", color: name === t.name ? "var(--accent)" : "var(--text)", cursor: "pointer" }}>
                  {t.icon} {t.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Name */}
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={labelStyle}>Task Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Update deps in my-repo" style={inputStyle} />
        </label>

        {/* Prompt */}
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={labelStyle}>Prompt / Instructions</span>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} required rows={5} placeholder="Describe exactly what the agent should do..." style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
        </label>

        {/* Repos */}
        <div>
          <div style={labelStyle}>Target Repos</div>
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
          <div style={labelStyle}>Permissions</div>
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
          <div style={labelStyle}>Schedule</div>
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
          <div style={labelStyle}>Provider &amp; Model</div>
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

        {/* Advanced */}
        <div>
          <button type="button" onClick={() => setShowAdvanced(!showAdvanced)}
            style={{ fontSize: 12, color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 6 }}>
            {showAdvanced ? "▼" : "▶"} Advanced options
          </button>
          {showAdvanced && (
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
              <label style={checkRow}>
                <input type="checkbox" checked={requiresApproval} onChange={(e) => setRequiresApproval(e.target.checked)} style={{ accentColor: "var(--accent)" }} />
                <div>
                  <div style={{ fontSize: 13 }}>Require approval before committing</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Agent writes files but holds commit until you approve in the run view</div>
                </div>
              </label>

              <label style={checkRow}>
                <input type="checkbox" checked={branchPerRun} onChange={(e) => setBranchPerRun(e.target.checked)} style={{ accentColor: "var(--accent)" }} />
                <div>
                  <div style={{ fontSize: 13 }}>Create a branch per run</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Commits go to agent/&lt;runId&gt; instead of current branch</div>
                </div>
              </label>

              {branchPerRun && (
                <label style={checkRow}>
                  <input type="checkbox" checked={githubPrOnPush} onChange={(e) => setGithubPrOnPush(e.target.checked)} style={{ accentColor: "var(--accent)" }} />
                  <div>
                    <div style={{ fontSize: 13 }}>Open GitHub PR after push</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Requires Push permission and a GitHub token in Settings</div>
                  </div>
                </label>
              )}

              <label style={checkRow}>
                <input type="checkbox" checked={retryOnFailure} onChange={(e) => setRetryOnFailure(e.target.checked)} style={{ accentColor: "var(--accent)" }} />
                <div>
                  <div style={{ fontSize: 13 }}>Retry on failure</div>
                </div>
              </label>
              {retryOnFailure && (
                <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 13, color: "var(--text-muted)", whiteSpace: "nowrap" }}>Max retries:</span>
                  <input type="number" min={1} max={10} value={maxRetries} onChange={(e) => setMaxRetries(+e.target.value)} style={{ ...inputStyle, width: 70 }} />
                </label>
              )}

              {otherTasks.length > 0 && (
                <div>
                  <div style={{ fontSize: 13, marginBottom: 6 }}>Trigger tasks on success</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {otherTasks.map((t) => (
                      <label key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                        <input type="checkbox" checked={triggerTaskIds.includes(t.id)} onChange={() => toggleTrigger(t.id)} style={{ accentColor: "var(--accent)" }} />
                        {t.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Dry run */}
              <label style={checkRow}>
                <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} style={{ accentColor: "var(--accent)" }} />
                <div>
                  <div style={{ fontSize: 13 }}>Dry run</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Agent reads and plans but never writes files or commits</div>
                </div>
              </label>

              {/* Cost budget */}
              <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 13, color: "var(--text-muted)", whiteSpace: "nowrap" }}>Cost budget (USD):</span>
                <input type="number" min={0} step={0.01} value={costBudget} onChange={(e) => setCostBudget(e.target.value)}
                  placeholder="e.g. 0.05" style={{ ...inputStyle, width: 90 }} />
              </label>

              {/* Custom cron */}
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Custom cron expression (overrides schedule preset)</span>
                <input value={cronExpr} onChange={(e) => setCronExpr(e.target.value)}
                  placeholder="e.g. 0 9 * * 1-5  (weekdays 9am)" style={inputStyle} />
              </label>

              {/* Input variables */}
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Input variables (comma-separated)</span>
                <input value={inputVars} onChange={(e) => setInputVars(e.target.value)}
                  placeholder="e.g. version, branch" style={inputStyle} />
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Use {"{{version}}"} in your prompt — values passed at run time</span>
              </label>

              {/* File watch paths */}
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Watch paths (one per line)</span>
                <textarea value={watchPaths} onChange={(e) => setWatchPaths(e.target.value)}
                  rows={3} placeholder={"/path/to/watch\n/another/path"} style={{ ...inputStyle, resize: "vertical", fontFamily: "monospace" }} />
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Task runs automatically when any of these files or directories change</span>
              </label>

              {/* Notifications */}
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Slack webhook URL</span>
                <input value={slackWebhook} onChange={(e) => setSlackWebhook(e.target.value)}
                  placeholder="https://hooks.slack.com/services/…" style={inputStyle} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Discord webhook URL</span>
                <input value={discordWebhook} onChange={(e) => setDiscordWebhook(e.target.value)}
                  placeholder="https://discord.com/api/webhooks/…" style={inputStyle} />
              </label>
              <label style={checkRow}>
                <input type="checkbox" checked={createIssueOnFailure} onChange={(e) => setCreateIssueOnFailure(e.target.checked)} style={{ accentColor: "var(--accent)" }} />
                <div>
                  <div style={{ fontSize: 13 }}>Open GitHub issue on failure</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Requires GitHub token in Settings → Integrations</div>
                </div>
              </label>

              {/* Env vars */}
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Environment variables (KEY=value, one per line)</span>
                <textarea value={envVarsText} onChange={(e) => setEnvVarsText(e.target.value)}
                  rows={3} placeholder={"API_URL=https://example.com\nDEBUG=true"} style={{ ...inputStyle, resize: "vertical", fontFamily: "monospace", fontSize: 13 }} />
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Injected into run_command and custom tool environments</span>
              </label>

              {/* Custom tools */}
              <div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 8 }}>Custom agent tools</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {customTools.map((ct, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}>
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                        <input value={ct.name} onChange={(e) => setCustomTools((prev) => prev.map((t, j) => j === i ? { ...t, name: e.target.value } : t))}
                          placeholder="tool_name" style={{ ...inputStyle, fontSize: 13, padding: "6px 10px" }} />
                        <input value={ct.description} onChange={(e) => setCustomTools((prev) => prev.map((t, j) => j === i ? { ...t, description: e.target.value } : t))}
                          placeholder="What this tool does (shown to the AI)" style={{ ...inputStyle, fontSize: 13, padding: "6px 10px" }} />
                        <input value={ct.command} onChange={(e) => setCustomTools((prev) => prev.map((t, j) => j === i ? { ...t, command: e.target.value } : t))}
                          placeholder="shell command — use {{repo_path}} and {{input}}" style={{ ...inputStyle, fontSize: 13, padding: "6px 10px", fontFamily: "monospace" }} />
                      </div>
                      <button type="button" onClick={() => setCustomTools((prev) => prev.filter((_, j) => j !== i))}
                        style={{ background: "transparent", border: "none", color: "var(--error)", cursor: "pointer", fontSize: 16, padding: "4px 6px" }}>✕</button>
                    </div>
                  ))}
                  <button type="button" onClick={() => setCustomTools((prev) => [...prev, { name: "", description: "", command: "" }])}
                    style={{ fontSize: 12, padding: "6px 12px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", cursor: "pointer", alignSelf: "flex-start" }}>
                    + Add custom tool
                  </button>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>Tools the AI can call during a run. Use {"{{input}}"} for the AI-provided argument.</div>
              </div>
            </div>
          )}
        </div>

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

const labelStyle: React.CSSProperties = { fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 };
const checkRow: React.CSSProperties = { display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" };

const inputStyle: React.CSSProperties = {
  background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8,
  padding: "10px 12px", color: "var(--text)", fontSize: 14, width: "100%", outline: "none",
};
const primaryBtn: React.CSSProperties = {
  background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8,
  padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer",
};
const secondaryBtn: React.CSSProperties = {
  background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--border)",
  borderRadius: 8, padding: "10px 20px", fontSize: 14, cursor: "pointer",
};
