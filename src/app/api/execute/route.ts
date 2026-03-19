import { NextResponse } from "next/server";
import { getTask } from "@/lib/db";
import { runAgent } from "@/lib/agentExecutor";
import { defaultRateLimit } from "@/lib/rateLimit";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  if (!defaultRateLimit(`execute:${ip}`)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { taskId, inputVarValues } = await req.json() as {
    taskId: string;
    inputVarValues?: Record<string, string>;
  };
  const task = getTask(taskId);
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const runId = crypto.randomUUID();
  runAgent(task, runId, "manual", inputVarValues).catch((err) =>
    console.error(`[execute] Run ${runId} failed:`, err)
  );
  return NextResponse.json({ runId });
}
