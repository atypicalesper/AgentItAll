import { NextResponse } from "next/server";
import { getConfig } from "@/lib/db";
import { getTask } from "@/lib/db";
import { runAgent } from "@/lib/agentExecutor";

export async function POST(req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const config = getConfig();

  if (config.webhookSecret) {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (token !== config.webhookSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const task = getTask(taskId);
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const runId = crypto.randomUUID();
  runAgent(task, runId, "manual").catch(console.error);
  return NextResponse.json({ runId }, { status: 202 });
}
