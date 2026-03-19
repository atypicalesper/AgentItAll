import { NextResponse } from "next/server";
import { getRuns, getRunsCount, deleteRuns } from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get("taskId") ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  const search = searchParams.get("search") ?? undefined;
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = parseInt(searchParams.get("limit") ?? "0", 10);

  const runs = getRuns({ taskId, status, search, page, limit });
  const total = getRunsCount({ taskId, status });
  return NextResponse.json({ runs, total, page, limit });
}

export async function DELETE(req: Request) {
  const { ids } = await req.json() as { ids: string[] };
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids array required" }, { status: 400 });
  }
  deleteRuns(ids);
  return NextResponse.json({ ok: true, deleted: ids.length });
}
