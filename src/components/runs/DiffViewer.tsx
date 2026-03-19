"use client";

import type { FileEdit } from "@/lib/types";

export default function DiffViewer({ edits }: { edits: FileEdit[] }) {
  if (!edits.length) return <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No file changes recorded.</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {edits.map((edit, i) => (
        <div key={i}>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6, fontFamily: "monospace" }}>{edit.path}</div>
          <pre style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: 12, fontSize: 12, fontFamily: "monospace", overflowX: "auto", margin: 0 }}>
            {edit.diff.split("\n").map((line, j) => (
              <span key={j} style={{
                display: "block",
                color: line.startsWith("+") && !line.startsWith("+++") ? "var(--success)" : line.startsWith("-") && !line.startsWith("---") ? "var(--error)" : line.startsWith("@@") ? "var(--accent)" : "var(--text-muted)",
              }}>
                {line}
              </span>
            ))}
          </pre>
        </div>
      ))}
    </div>
  );
}
