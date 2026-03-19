"use client";

import { useEffect, useState } from "react";
import type { AppConfig } from "@/lib/types";

const MODELS = [
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-6",
  "claude-opus-4-6",
];

export default function SettingsPage() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [saved, setSaved] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [testingAI, setTestingAI] = useState(false);
  const [aiStatus, setAiStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then(setConfig);
  }, []);

  const save = async () => {
    await fetch("/api/config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
    setSaved(true);
    setAiStatus(null);
    setTimeout(() => setSaved(false), 2000);
  };

  const testEmail = async () => {
    setTestingEmail(true);
    try {
      const res = await fetch("/api/config/test-email", { method: "POST" });
      const { ok, error } = await res.json();
      alert(ok ? "Test email sent!" : `Failed: ${error}`);
    } finally {
      setTestingEmail(false);
    }
  };

  const testAI = async () => {
    setTestingAI(true);
    setAiStatus(null);
    try {
      // save first so the server uses latest key
      await fetch("/api/config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
      const res = await fetch("/api/config/test-ai", { method: "POST" });
      const { ok, error } = await res.json();
      setAiStatus({ ok, msg: ok ? "Connection successful" : error });
    } finally {
      setTestingAI(false);
    }
  };

  if (!config) return <div style={{ color: "var(--text-muted)" }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ margin: "0 0 28px", fontSize: 24, fontWeight: 700 }}>Settings</h1>

      {/* General */}
      <Section title="General">
        <Field label="Base Directory (where your repos live)">
          <input value={config.baseDir} onChange={(e) => setConfig({ ...config, baseDir: e.target.value })} style={inputStyle} />
        </Field>
      </Section>

      {/* AI */}
      <Section title="AI Provider">
        <Field label="Provider">
          <select value={config.ai.provider} style={inputStyle} disabled>
            <option value="anthropic">Anthropic (Claude)</option>
          </select>
        </Field>
        <Field label="API Key">
          <input type="password" value={config.ai.apiKey} onChange={(e) => setConfig({ ...config, ai: { ...config.ai, apiKey: e.target.value } })} placeholder="sk-ant-..." style={inputStyle} />
        </Field>
        <Field label="Default Model">
          <select value={config.ai.model} onChange={(e) => setConfig({ ...config, ai: { ...config.ai, model: e.target.value } })} style={inputStyle}>
            {MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={testAI} disabled={testingAI || !config.ai.apiKey} style={{ ...secondaryBtn, opacity: config.ai.apiKey ? 1 : 0.5 }}>
            {testingAI ? "Testing…" : "Test AI Connection"}
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
        <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, cursor: "pointer" }}>
          <input type="checkbox" checked={config.smtp.enabled} onChange={(e) => setConfig({ ...config, smtp: { ...config.smtp, enabled: e.target.checked } })} style={{ accentColor: "var(--accent)", width: 16, height: 16 }} />
          <span style={{ fontSize: 14 }}>Enable email digests after runs</span>
        </label>
        <Field label="SMTP Host"><input value={config.smtp.host} onChange={(e) => setConfig({ ...config, smtp: { ...config.smtp, host: e.target.value } })} style={inputStyle} /></Field>
        <Field label="SMTP Port"><input type="number" value={config.smtp.port} onChange={(e) => setConfig({ ...config, smtp: { ...config.smtp, port: +e.target.value } })} style={inputStyle} /></Field>
        <Field label="Username (Gmail address)"><input value={config.smtp.user} onChange={(e) => setConfig({ ...config, smtp: { ...config.smtp, user: e.target.value } })} style={inputStyle} /></Field>
        <Field label="Password (Gmail App Password)"><input type="password" value={config.smtp.pass} onChange={(e) => setConfig({ ...config, smtp: { ...config.smtp, pass: e.target.value } })} placeholder="xxxx-xxxx-xxxx-xxxx" style={inputStyle} /></Field>
        <Field label="Send Digest To"><input type="email" value={config.smtp.toAddress} onChange={(e) => setConfig({ ...config, smtp: { ...config.smtp, toAddress: e.target.value } })} style={inputStyle} /></Field>
        <button onClick={testEmail} disabled={testingEmail || !config.smtp.enabled} style={{ ...secondaryBtn, opacity: config.smtp.enabled ? 1 : 0.5 }}>
          {testingEmail ? "Sending…" : "Send Test Email"}
        </button>
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
      <h2 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>{title}</h2>
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
