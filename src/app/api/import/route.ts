import { NextResponse } from "next/server";
import { saveTasks, saveRuns, saveConfig } from "@/lib/db";
import { refreshScheduler } from "@/lib/scheduler";
import type { Task, RunLog, AppConfig } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const body = await req.json() as { tasks?: Task[]; runs?: RunLog[]; config?: AppConfig };
    if (body.tasks && Array.isArray(body.tasks)) saveTasks(body.tasks);
    if (body.runs && Array.isArray(body.runs)) saveRuns(body.runs);
    if (body.config && typeof body.config === "object") saveConfig(body.config);
    refreshScheduler();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 400 });
  }
}
