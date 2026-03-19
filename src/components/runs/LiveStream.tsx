"use client";

import { useEffect, useRef, useState } from "react";

export default function LiveStream({ runId }: { runId: string }) {
  const [lines, setLines] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const ref = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const es = new EventSource(`/api/stream/${runId}`);
    es.onmessage = (e) => {
      if (e.data === "[DONE]") { setDone(true); es.close(); return; }
      try {
        const text = JSON.parse(e.data) as string;
        setLines((prev) => [...prev, text]);
        setTimeout(() => ref.current?.scrollTo(0, ref.current.scrollHeight), 10);
      } catch { /* ignore */ }
    };
    es.onerror = () => { setDone(true); es.close(); };
    return () => es.close();
  }, [runId]);

  return (
    <div>
      <pre
        ref={ref}
        style={{
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: 16,
          fontSize: 13,
          fontFamily: "monospace",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          maxHeight: 400,
          overflowY: "auto",
          color: "var(--text)",
        }}
      >
        {lines.join("") || "Waiting for output…"}
      </pre>
      {done && <p style={{ fontSize: 12, color: "var(--success)", marginTop: 6 }}>✓ Stream complete</p>}
    </div>
  );
}
