"use client";

import { useEffect, useState } from "react";
import type { AppConfig } from "@/lib/types";
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
    const data = JSON.parse(text);
    await fetch("/api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
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

      {/* General */}
      <Section title="General">
        <Field label="Base Directory">
          <input value={config.baseDir} onChange={(e) => setConfig({ ...config, baseDir: e.target.value })} style={inputStyle} />
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
      <Section title="Email (SMTP)">
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <input type="checkbox" checked={config.smtp.enabled} onChange={(e) => setConfig({ ...config, smtp: { ...config.smtp, enabled: e.target.checked } })} style={{ accentColor: "var(--accent)", width: 16, height: 16 }} />
          <span style={{ fontSize: 14 }}>Enable email digests after runs</span>
        </label>
        <Field label="SMTP Host"><input value={config.smtp.host} onChange={(e) => setConfig({ ...config, smtp: { ...config.smtp, host: e.target.value } })} style={inputStyle} /></Field>
        <Field label="SMTP Port"><input type="number" value={config.smtp.port} onChange={(e) => setConfig({ ...config, smtp: { ...config.smtp, port: +e.target.value } })} style={inputStyle} /></Field>
        <Field label="Username"><input value={config.smtp.user} onChange={(e) => setConfig({ ...config, smtp: { ...config.smtp, user: e.target.value } })} style={inputStyle} /></Field>
        <Field label="Password"><input type="password" value={config.smtp.pass} onChange={(e) => setConfig({ ...config, smtp: { ...config.smtp, pass: e.target.value } })} placeholder="Gmail App Password" style={inputStyle} /></Field>
        <Field label="Send To"><input type="email" value={config.smtp.toAddress} onChange={(e) => setConfig({ ...config, smtp: { ...config.smtp, toAddress: e.target.value } })} style={inputStyle} /></Field>
        <button onClick={testEmail} disabled={testingEmail || !config.smtp.enabled} style={{ ...secondaryBtn, opacity: config.smtp.enabled ? 1 : 0.5 }}>
          {testingEmail ? "Sending…" : "Send Test Email"}
        </button>
      </Section>

      {/* Security */}
      <Section title="Security">
        <Field label="Dashboard Password">
          <input type="password" value={config.password ?? ""} onChange={(e) => setConfig({ ...config, password: e.target.value })}
            placeholder="Leave blank to disable password protection" style={inputStyle} />
        </Field>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          When set, all dashboard routes require this password. Leave blank to disable auth.
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
