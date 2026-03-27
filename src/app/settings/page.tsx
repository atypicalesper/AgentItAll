"use client";

// TODO: Multi-folder selection in Settings
// Currently `baseDir` is a single root directory. Evolve this into a
// multi-select folder picker so users can choose specific repos/folders
// to watch rather than scanning an entire root.
//
// Future integrations to trigger from agent-it-all on a schedule:
//   - dev-atlas doc generation / sync
//   - COMET RAG re-indexing when source files change
//   - rag-backend vector store refresh
//   - Portfolio auto-deploy on content changes
// Each integration should be a named "flow" that can be enabled/disabled
// per-task, with its own schedule and target folder(s).

import { useEffect, useState } from "react";
import type { AppConfig, DigestFrequency } from "@/lib/types";
import { PROVIDERS } from "@/lib/providers";
import type { ProviderKey } from "@/lib/providers";

const PROVIDER_KEYS = Object.keys(PROVIDERS) as ProviderKey[];

export default function SettingsPage() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [saved, setSaved] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [testingAI, setTestingAI] = useState(false);
  const [aiStatus, setAiStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Set<ProviderKey>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [browseData, setBrowseData] = useState<{ path: string; parent: string | null; dirs: string[] } | null>(null);

  const browseTo = async (dir: string) => {
    const res = await fetch(`/api/browse?path=${encodeURIComponent(dir)}`);
    const data = await res.json();
    if (!data.error) setBrowseData(data);
  };

  const [addingDir, setAddingDir] = useState(false);

  const openPicker = (forAdd = false) => {
    setAddingDir(forAdd);
    setPickerOpen(true);
    browseTo(config?.baseDirs?.[0] ?? config?.baseDir ?? process.env.HOME ?? "/");
  };

  const toggleKeyVisibility = (p: ProviderKey) =>
    setVisibleKeys((prev) => { const next = new Set(prev); next.has(p) ? next.delete(p) : next.add(p); return next; });

  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then(setConfig);
  }, []);

  const save = async () => {
    if (!config) return;
    await fetch("/api/config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
    setSaved(true);
    setAiStatus(null);
    setTimeout(() => setSaved(false), 2000);
  };

  const setTheme = (theme: "dark" | "light") => {
    if (!config) return;
    setConfig({ ...config, theme });
    window.dispatchEvent(new CustomEvent("theme-change", { detail: { theme } }));
  };

  const testAI = async () => {
    if (!config) return;
    setTestingAI(true);
    setAiStatus(null);
    try {
      await fetch("/api/config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
      const res = await fetch("/api/config/test-ai", { method: "POST" });
      const { ok, error } = await res.json();
      setAiStatus({ ok, msg: ok ? "Connection successful" : error });
    } finally {
      setTestingAI(false);
    }
  };

  const testEmail = async () => {
    setTestingEmail(true);
    try {
      const res = await fetch("/api/config/test-email", { method: "POST" });
      const { ok, error, etherealUrl } = await res.json();
      if (!ok) { alert(`Failed: ${error}`); return; }
      if (etherealUrl) {
        window.open(etherealUrl, "_blank");
      } else {
        alert("Test email sent!");
      }
    } finally {
      setTestingEmail(false);
    }
  };

  const exportData = async () => {
    const res = await fetch("/api/export");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agentItAll-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    let data: unknown;
    try { data = JSON.parse(text); }
    catch { alert("Invalid JSON file."); return; }
    const res = await fetch("/api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    const result = await res.json() as { ok: boolean; error?: string };
    if (!result.ok) { alert(`Import failed: ${result.error}`); return; }
    alert("Import complete. Reload to see updated data.");
  };

  const setKey = (provider: ProviderKey, val: string) => {
    if (!config) return;
    setConfig({ ...config, ai: { ...config.ai, keys: { ...config.ai.keys, [provider]: val } } });
  };

  if (!config) return <div style={{ color: "var(--text-muted)" }}>Loading…</div>;

  const activeProvider = config.ai.provider;

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ margin: "0 0 28px", fontSize: 24, fontWeight: 700 }}>Settings</h1>

      {/* Folder picker modal */}
      {pickerOpen && browseData && (
        <div onClick={() => setPickerOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, width: 480, maxHeight: "70vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>Select Folder</span>
              <button onClick={() => setPickerOpen(false)} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>
            <div style={{ padding: "10px 20px", borderBottom: "1px solid var(--border)", fontSize: 12, color: "var(--text-muted)", fontFamily: "monospace", wordBreak: "break-all" }}>
              {browseData.path}
            </div>
            <div style={{ overflowY: "auto", flex: 1 }}>
              {browseData.parent && (
                <button onClick={() => browseTo(browseData.parent!)} style={{ width: "100%", textAlign: "left", padding: "10px 20px", background: "none", border: "none", borderBottom: "1px solid var(--border)", color: "var(--text-muted)", fontSize: 13, cursor: "pointer" }}>
                  ↑ ..
                </button>
              )}
              {browseData.dirs.length === 0 && (
                <div style={{ padding: "16px 20px", fontSize: 13, color: "var(--text-muted)" }}>No subdirectories</div>
              )}
              {browseData.dirs.map((d) => (
                <button key={d} onClick={() => browseTo(`${browseData.path}/${d}`)} style={{ width: "100%", textAlign: "left", padding: "10px 20px", background: "none", border: "none", borderBottom: "1px solid var(--border)", color: "var(--text)", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "var(--accent)" }}>📁</span> {d}
                </button>
              ))}
            </div>
            <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setPickerOpen(false)} style={secondaryBtn}>Cancel</button>
              <button onClick={() => {
                if (addingDir) {
                  const dirs = config.baseDirs ?? [config.baseDir];
                  if (!dirs.includes(browseData.path)) setConfig({ ...config, baseDirs: [...dirs, browseData.path] });
                } else {
                  setConfig({ ...config, baseDirs: [browseData.path], baseDir: browseData.path });
                }
                setPickerOpen(false);
              }} style={primaryBtn}>Select This Folder</button>
            </div>
          </div>
        </div>
      )}

      {/* General */}
      <Section title="General">
        <Field label="Watched Directories">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(config.baseDirs ?? [config.baseDir]).map((dir, i) => (
              <div key={dir} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input value={dir} onChange={(e) => {
                  const dirs = [...(config.baseDirs ?? [config.baseDir])];
                  dirs[i] = e.target.value;
                  setConfig({ ...config, baseDirs: dirs, baseDir: dirs[0] });
                }} style={{ ...inputStyle, flex: 1, fontFamily: "monospace", fontSize: 13 }} />
                <button onClick={() => {
                  const dirs = (config.baseDirs ?? [config.baseDir]).filter((_, j) => j !== i);
                  setConfig({ ...config, baseDirs: dirs.length ? dirs : [config.baseDir], baseDir: dirs[0] ?? config.baseDir });
                }} disabled={(config.baseDirs ?? []).length <= 1} title="Remove"
                  style={{ ...secondaryBtn, padding: "8px 12px", opacity: (config.baseDirs ?? [config.baseDir]).length <= 1 ? 0.3 : 1 }}>✕</button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => openPicker(true)} style={{ ...secondaryBtn, fontSize: 13 }}>+ Add Folder</button>
              <button onClick={() => openPicker(false)} style={{ ...secondaryBtn, fontSize: 13, color: "var(--text-muted)" }}>Browse…</button>
            </div>
          </div>
        </Field>
        <Field label="Theme">
          <div style={{ display: "flex", gap: 8 }}>
            {(["dark", "light"] as const).map((t) => (
              <button key={t} onClick={() => setTheme(t)} style={{
                ...secondaryBtn,
                flex: 1,
                background: config.theme === t ? "var(--accent)" : "var(--surface2)",
                color: config.theme === t ? "#fff" : "var(--text)",
                border: `1px solid ${config.theme === t ? "var(--accent)" : "var(--border)"}`,
                fontWeight: config.theme === t ? 600 : 400,
              }}>
                {t === "dark" ? "🌙 Dark" : "☀️ Light"}
              </button>
            ))}
          </div>
        </Field>
      </Section>

      {/* AI Provider */}
      <Section title="AI Provider">
        {/* Provider selector */}
        <Field label="Active Provider">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {PROVIDER_KEYS.map((p) => {
              const meta = PROVIDERS[p];
              const active = activeProvider === p;
              return (
                <button key={p} onClick={() => setConfig({ ...config, ai: { ...config.ai, provider: p, model: meta.models[0] } })}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: active ? "rgba(124,110,247,0.1)" : "var(--surface2)", border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`, borderRadius: 8, cursor: "pointer", textAlign: "left" }}>
                  <span style={{ fontWeight: active ? 600 : 400, color: "var(--text)", fontSize: 14 }}>{meta.label}</span>
                  {meta.free && <span style={{ fontSize: 11, padding: "2px 8px", background: "rgba(74,222,128,0.1)", border: "1px solid var(--success)", borderRadius: 10, color: "var(--success)", fontWeight: 600 }}>FREE</span>}
                  {active && <span style={{ fontSize: 11, color: "var(--accent)", fontWeight: 600 }}>✓ Active</span>}
                </button>
              );
            })}
          </div>
        </Field>

        {/* Model for active provider */}
        <Field label="Default Model">
          <select value={config.ai.model} onChange={(e) => setConfig({ ...config, ai: { ...config.ai, model: e.target.value } })} style={inputStyle}>
            {PROVIDERS[activeProvider].models.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>

        {/* API keys for all providers */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {PROVIDER_KEYS.map((p) => (
            <Field key={p} label={PROVIDERS[p].keyLabel}>
              <div style={{ display: "flex", gap: 6 }}>
                <input type={visibleKeys.has(p) ? "text" : "password"} value={config.ai.keys[p] ?? ""} onChange={(e) => setKey(p, e.target.value)}
                  placeholder={PROVIDERS[p].keyPlaceholder} style={{ ...inputStyle, borderColor: activeProvider === p ? "var(--accent)" : "var(--border)", flex: 1 }} />
                <button type="button" onClick={() => toggleKeyVisibility(p)} title={visibleKeys.has(p) ? "Hide key" : "Show key"}
                  style={{ ...secondaryBtn, padding: "0 12px", fontSize: 15, flexShrink: 0 }}>
                  {visibleKeys.has(p) ? "🙈" : "👁"}
                </button>
              </div>
            </Field>
          ))}
        </div>

        {/* Test connection */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={testAI} disabled={testingAI || !config.ai.keys[activeProvider]} style={{ ...secondaryBtn, opacity: config.ai.keys[activeProvider] ? 1 : 0.5 }}>
            {testingAI ? "Testing…" : `Test ${PROVIDERS[activeProvider].label}`}
          </button>
          {aiStatus && (
            <span style={{ fontSize: 13, color: aiStatus.ok ? "var(--success)" : "var(--error)" }}>
              {aiStatus.ok ? "✓" : "✗"} {aiStatus.msg}
            </span>
          )}
        </div>
      </Section>

      {/* SMTP */}
      <Section title="Email">
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <input type="checkbox" checked={config.smtp.enabled} onChange={(e) => setConfig({ ...config, smtp: { ...config.smtp, enabled: e.target.checked } })} style={{ accentColor: "var(--accent)", width: 16, height: 16 }} />
          <span style={{ fontSize: 14 }}>Enable email updates after runs</span>
        </label>
        <Field label="Receive updates at">
          <input type="email" value={config.smtp.toAddress} onChange={(e) => setConfig({ ...config, smtp: { ...config.smtp, toAddress: e.target.value } })} placeholder="you@example.com" style={inputStyle} />
        </Field>
        <button onClick={testEmail} disabled={testingEmail || !config.smtp.enabled} style={{ ...secondaryBtn, opacity: config.smtp.enabled ? 1 : 0.5 }}>
          {testingEmail ? "Sending…" : "Send Test Email"}
        </button>
      </Section>

      {/* Digest */}
      <Section title="Digest">
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <input type="checkbox" checked={config.digest?.enabled ?? false}
            onChange={(e) => setConfig({ ...config, digest: { ...(config.digest ?? { frequency: "daily", hour: 8 }), enabled: e.target.checked } })}
            style={{ accentColor: "var(--accent)", width: 16, height: 16 }} />
          <span style={{ fontSize: 14 }}>Send a digest email summarising agent runs</span>
        </label>
        <Field label="Frequency">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {([
              { value: "every_2h",  label: "Every 2 h" },
              { value: "every_4h",  label: "Every 4 h" },
              { value: "every_6h",  label: "Every 6 h" },
              { value: "every_8h",  label: "Every 8 h" },
              { value: "every_12h", label: "Every 12 h" },
              { value: "daily",     label: "Once daily" },
            ] as { value: DigestFrequency; label: string }[]).map(({ value, label }) => {
              const active = (config.digest?.frequency ?? "daily") === value;
              return (
                <button key={value} onClick={() => setConfig({ ...config, digest: { ...(config.digest ?? { enabled: false, hour: 8 }), frequency: value } })}
                  style={{ padding: "8px 4px", fontSize: 13, borderRadius: 8, border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`, background: active ? "rgba(124,110,247,0.12)" : "var(--surface2)", color: active ? "var(--accent)" : "var(--text)", fontWeight: active ? 600 : 400, cursor: "pointer" }}>
                  {label}
                </button>
              );
            })}
          </div>
        </Field>
        {(config.digest?.frequency ?? "daily") === "daily" && (
          <Field label="Send at (hour, 0–23)">
            <input type="number" min={0} max={23} value={config.digest?.hour ?? 8}
              onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) setConfig({ ...config, digest: { ...(config.digest ?? { enabled: false, frequency: "daily" }), hour: Math.min(23, Math.max(0, v)) } }); }}
              style={{ ...inputStyle, width: 90 }} />
          </Field>
        )}
        <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
          Each digest covers the period since the last one was sent. Requires the Email section to be enabled with a recipient address.
        </div>
      </Section>

      {/* Security */}
      <Section title="Security">
        <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6 }}>
          Set <code style={{ fontFamily: "monospace", background: "var(--surface2)", padding: "1px 6px", borderRadius: 4 }}>AUTH_PASSWORD</code> in <code style={{ fontFamily: "monospace", background: "var(--surface2)", padding: "1px 6px", borderRadius: 4 }}>.env.local</code> to enable password protection.
          Leave it unset for open access.
        </div>
        <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px", fontFamily: "monospace", fontSize: 13, color: "var(--text)" }}>
          AUTH_PASSWORD=yourpassword
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          Restart the dev server after changing .env.local.
        </div>
      </Section>

      {/* Integrations */}
      <Section title="Integrations">
        <Field label="GitHub Token">
          <input type="password" value={config.githubToken ?? ""} onChange={(e) => setConfig({ ...config, githubToken: e.target.value })}
            placeholder="ghp_… — needed for auto PR creation" style={inputStyle} />
        </Field>
        <Field label="Webhook Secret">
          <input value={config.webhookSecret ?? ""} onChange={(e) => setConfig({ ...config, webhookSecret: e.target.value })}
            placeholder="Random string — used to verify webhook calls" style={inputStyle} />
        </Field>
        {config.webhookSecret && (
          <div style={{ fontSize: 12, color: "var(--text-muted)", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px" }}>
            Webhook URL: <code style={{ fontFamily: "monospace", color: "var(--text)" }}>{typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/[taskId]</code>
            <br />Pass <code style={{ fontFamily: "monospace" }}>Authorization: Bearer {config.webhookSecret}</code>
          </div>
        )}
      </Section>

      {/* Export / Import */}
      <Section title="Export &amp; Import">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={exportData} style={secondaryBtn}>⬇ Export Data</button>
          <label style={{ ...secondaryBtn, cursor: "pointer", display: "inline-flex", alignItems: "center" }}>
            ⬆ Import Data
            <input type="file" accept=".json" onChange={importData} style={{ display: "none" }} />
          </label>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          Export downloads all tasks, runs, and settings as JSON. Import merges data from a previously exported file.
        </div>
      </Section>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={save} style={primaryBtn}>Save Settings</button>
        {saved && <span style={{ fontSize: 13, color: "var(--success)" }}>✓ Saved</span>}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px 24px", marginBottom: 20 }}>
      <h2 style={{ margin: "0 0 16px", fontSize: 13, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>{title}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = { background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", color: "var(--text)", fontSize: 14, width: "100%", outline: "none" };
const primaryBtn: React.CSSProperties = { background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, padding: "10px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer" };
const secondaryBtn: React.CSSProperties = { background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer" };
