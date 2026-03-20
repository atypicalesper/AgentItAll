import { NextResponse } from "next/server";
import { saveTasks, saveRuns, saveConfig } from "@/lib/db";
import { refreshScheduler } from "@/lib/scheduler";
import type { Task, RunLog, AppConfig } from "@/lib/types";

function isValidTask(t: unknown): t is Task {
  if (!t || typeof t !== "object") return false;
  const o = t as Record<string, unknown>;
  return typeof o.id === "string" && typeof o.name === "string" && typeof o.prompt === "string";
}

function isValidRun(r: unknown): r is RunLog {
  if (!r || typeof r !== "object") return false;
  const o = r as Record<string, unknown>;
  return typeof o.id === "string" && typeof o.taskId === "string" && typeof o.startedAt === "string";
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as { tasks?: unknown; runs?: unknown; config?: unknown };
    if (body.tasks !== undefined && !Array.isArray(body.tasks))
      return NextResponse.json({ ok: false, error: "tasks must be an array" }, { status: 400 });
    if (body.runs !== undefined && !Array.isArray(body.runs))
      return NextResponse.json({ ok: false, error: "runs must be an array" }, { status: 400 });

    if (Array.isArray(body.tasks)) {
      const invalid = body.tasks.filter((t) => !isValidTask(t));
      if (invalid.length) return NextResponse.json({ ok: false, error: `${invalid.length} task(s) missing required fields (id, name, prompt)` }, { status: 400 });
      saveTasks(body.tasks as Task[]);
    }
    if (Array.isArray(body.runs)) {
      const invalid = body.runs.filter((r) => !isValidRun(r));
      if (invalid.length) return NextResponse.json({ ok: false, error: `${invalid.length} run(s) missing required fields (id, taskId, startedAt)` }, { status: 400 });
      saveRuns(body.runs as RunLog[]);
    }
    if (body.config !== undefined) {
      if (!body.config || typeof body.config !== "object" || Array.isArray(body.config))
        return NextResponse.json({ ok: false, error: "config must be an object" }, { status: 400 });
      const c = body.config as Record<string, unknown>;
      if (c.ai !== undefined && (typeof c.ai !== "object" || Array.isArray(c.ai)))
        return NextResponse.json({ ok: false, error: "config.ai must be an object" }, { status: 400 });
      saveConfig(body.config as AppConfig);
    }
    refreshScheduler();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 400 });
  }
}
