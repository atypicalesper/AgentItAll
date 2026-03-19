"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.push(params.get("from") ?? "/");
        router.refresh();
      } else {
        const { error: err } = await res.json() as { error: string };
        setError(err ?? "Invalid password");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
      <form onSubmit={handleSubmit} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 36, width: "min(380px, 95vw)", display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 20, color: "var(--accent)" }}>agentItAll</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>Enter your dashboard password</div>
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          required
          style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", color: "var(--text)", fontSize: 14, outline: "none" }}
        />
        {error && <div style={{ fontSize: 13, color: "var(--error)" }}>{error}</div>}
        <button type="submit" disabled={loading} style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, padding: "10px 0", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: loading ? 0.7 : 1 }}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
