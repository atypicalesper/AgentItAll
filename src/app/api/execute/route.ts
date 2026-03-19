import { NextResponse } from "next/server";
import { getTask } from "@/lib/db";
import { runAgent } from "@/lib/agentExecutor";

export async function POST(req: Request) {
  const { taskId } = await req.json();
  const task = getTask(taskId);
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const runId = crypto.randomUUID();

  // fire-and-forget — run async, return runId immediately
  runAgent(task, runId, "manual").catch((err) =>
    console.error(`[execute] Run ${runId} failed:`, err)
  );

  return NextResponse.json({ runId });
}
