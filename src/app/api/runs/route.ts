import { NextResponse } from "next/server";
import { getRuns } from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get("taskId");
  const runs = getRuns();
  const filtered = taskId ? runs.filter((r) => r.taskId === taskId) : runs;
  // newest first
  return NextResponse.json(filtered.sort((a, b) => b.startedAt.localeCompare(a.startedAt)));
}
