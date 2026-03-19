import { NextResponse } from "next/server";
import { getTasks, upsertTask } from "@/lib/db";
import { refreshScheduler } from "@/lib/scheduler";
import { validateCronExpr } from "@/lib/scheduleUtils";
import type { Task } from "@/lib/types";

export async function GET() {
  return NextResponse.json(getTasks());
}

export async function POST(req: Request) {
  const body = await req.json();
  if (body.schedule?.kind === "cron") {
    const err = validateCronExpr(body.schedule.expr ?? "");
    if (err) return NextResponse.json({ error: `Invalid cron expression: ${err}` }, { status: 400 });
  }
  const task: Task = {
    ...body,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  upsertTask(task);
  refreshScheduler();
  return NextResponse.json(task, { status: 201 });
}
