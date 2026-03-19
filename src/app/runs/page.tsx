"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { RunLog } from "@/lib/types";
import DiffViewer from "@/components/runs/DiffViewer";

const PAGE_SIZE = 25;

const statusColor: Record<string, string> = {
  running: "var(--warning)",
  success: "var(--success)",
  failed: "var(--error)",
  cancelled: "var(--text-muted)",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString();
}

function fmtCost(usd?: number) {
  if (!usd) return null;
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(3)}`;
}

export default function RunsPage() {
  const [runs, setRuns] = useState<RunLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterName, setFilterName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (filterStatus !== "all") params.set("status", filterStatus);
    if (filterName) params.set("search", filterName);
    fetch(`/api/runs?${params}`)
      .then((r) => r.json())
      .then((d: { runs: RunLog[]; total: number }) => { setRuns(d.runs); setTotal(d.total); });
  }, [page, filterStatus, filterName]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  const cancel = async (runId: string) => {
    await fetch(`/api/runs/${runId}/cancel`, { method: "POST" });
    load();
  };

  const deleteRun = async (id: string) => {
    await fetch(`/api/runs/${id}`, { method: "DELETE" });
    setSelected((s) => { const n = new Set(s); n.delete(id); return n; });
    load();
  };

  const deleteBulk = async () => {
    if (!confirm(`Delete ${selected.size} run(s)?`)) return;
    await fetch("/api/runs", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [...selected] }) });
    setSelected(new Set());
    load();
  };

  const toggleSelect = (id: string) =>
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const totalPages = PAGE_SIZE > 0 ? Math.ceil(total / PAGE_SIZE) : 1;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Run History</h1>
          <p style={{ margin: "4px 0 0", color: "var(--text-muted)", fontSize: 14 }}>{total} total run{total !== 1 ? "s" : ""}</p>
        </div>
        {selected.size > 0 && (
          <button onClick={deleteBulk}
            style={{ background: "rgba(248,113,113,0.1)", color: "var(--error)", border: "1px solid var(--error)", borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer" }}>
            Delete {selected.size} selected
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input value={filterName} onChange={(e) => { setFilterName(e.target.value); setPage(1); }}
          placeholder="Search by task name…"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", color: "var(--text)", fontSize: 13, flex: 1, minWidth: 180, outline: "none" }} />
        <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
          style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", color: "var(--text)", fontSize: 13, outline: "none" }}>
          <option value="all">All statuses</option>
          <option value="running">Running</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        {(filterName || filterStatus !== "all") && (
          <button onClick={() => { setFilterName(""); setFilterStatus("all"); setPage(1); }}
            style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", color: "var(--text-muted)", fontSize: 13, cursor: "pointer" }}>
            Clear
          </button>
        )}
      </div>

      {runs.length === 0 && (
        <div style={{ textAlign: "center", padding: "80px 0", color: "var(--text-muted)" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div>No runs yet. Trigger a task from the Tasks page.</div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {runs.map((run) => {
          const open = expanded === run.id;
          const color = statusColor[run.status];
          const cost = fmtCost(run.estimatedCost);

          return (
            <div key={run.id} style={{ background: "var(--surface)", border: `1px solid ${selected.has(run.id) ? "var(--accent)" : "var(--border)"}`, borderRadius: 12, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px" }}>
                {/* Checkbox */}
                <input type="checkbox" checked={selected.has(run.id)} onChange={() => toggleSelect(run.id)}
                  style={{ accentColor: "var(--accent)", flexShrink: 0 }} />

                {/* Status dot */}
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0, boxShadow: run.status === "running" ? `0 0 6px ${color}` : "none" }} />

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Link href={`/tasks/${run.taskId}`} style={{ fontWeight: 600, fontSize: 14, color: "var(--text)", textDecoration: "none" }}>{run.taskName}</Link>
                    <span style={{ fontSize: 11, color, fontWeight: 600, textTransform: "uppercase" }}>{run.status}</span>
                    {run.isDryRun && <span style={{ fontSize: 11, color: "var(--text-muted)", background: "var(--surface2)", padding: "1px 6px", borderRadius: 6 }}>dry-run</span>}
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{run.trigger}</span>
                    {cost && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{cost}</span>}
                    {run.commitSha && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>· {run.commitSha.slice(0, 7)}</span>}
                    {run.approvalStatus === "pending" && <span style={{ fontSize: 11, color: "var(--warning)", fontWeight: 600 }}>⏳ approval</span>}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                    {fmt(run.startedAt)}{run.finishedAt ? ` → ${fmt(run.finishedAt)}` : ""}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {run.status === "running" && (
                    <button onClick={() => cancel(run.id)} style={{ fontSize: 12, padding: "4px 10px", background: "rgba(248,113,113,0.1)", border: "1px solid var(--error)", borderRadius: 6, color: "var(--error)", cursor: "pointer" }}>
                      Cancel
                    </button>
                  )}
                  <Link href={`/runs/${run.id}`} style={{ fontSize: 12, padding: "4px 10px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", textDecoration: "none" }}>
                    {run.status === "running" ? "Live →" : "View →"}
                  </Link>
                  <button onClick={() => deleteRun(run.id)} title="Delete run"
                    style={{ fontSize: 12, padding: "4px 8px", background: "transparent", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-muted)", cursor: "pointer" }}>
                    ✕
                  </button>
                  <button onClick={() => setExpanded(open ? null : run.id)}
                    style={{ fontSize: 12, padding: "4px 8px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-muted)", cursor: "pointer" }}>
                    {open ? "▲" : "▼"}
                  </button>
                </div>
              </div>

              {open && (
                <div style={{ padding: "0 16px 16px", borderTop: "1px solid var(--border)" }}>
                  {run.output && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>OUTPUT PREVIEW</div>
                      <pre style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: 10, fontSize: 12, fontFamily: "monospace", whiteSpace: "pre-wrap", maxHeight: 200, overflowY: "auto", margin: 0 }}>
                        {run.output.slice(0, 1000)}{run.output.length > 1000 ? "\n…(truncated)" : ""}
                      </pre>
                    </div>
                  )}
                  {run.edits.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>FILE CHANGES ({run.edits.length})</div>
                      <DiffViewer edits={run.edits} />
                    </div>
                  )}
                  {run.error && (
                    <div style={{ marginTop: 12, padding: 10, background: "rgba(248,113,113,0.1)", border: "1px solid var(--error)", borderRadius: 8, fontSize: 12, color: "var(--error)" }}>
                      {run.error}
                    </div>
                  )}
                  <div style={{ marginTop: 10 }}>
                    <Link href={`/runs/${run.id}`} style={{ fontSize: 13, color: "var(--accent)", textDecoration: "none" }}>Open full run view →</Link>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 20 }}>
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}
            style={{ padding: "6px 14px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", cursor: page > 1 ? "pointer" : "default", opacity: page <= 1 ? 0.4 : 1, fontSize: 13 }}>
            ← Prev
          </button>
          <span style={{ padding: "6px 14px", fontSize: 13, color: "var(--text-muted)" }}>
            {page} / {totalPages}
          </span>
          <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}
            style={{ padding: "6px 14px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", cursor: page < totalPages ? "pointer" : "default", opacity: page >= totalPages ? 0.4 : 1, fontSize: 13 }}>
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
