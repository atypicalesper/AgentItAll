import { NextResponse } from "next/server";
import { getRun, getTask } from "@/lib/db";
import { runAgent } from "@/lib/agentExecutor";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = getRun(id);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  const task = getTask(run.taskId);
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const runId = crypto.randomUUID();
  runAgent(task, runId, "manual", run.inputVarValues).catch(console.error);
  return NextResponse.json({ runId });
}
