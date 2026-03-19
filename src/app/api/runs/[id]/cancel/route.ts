import { NextResponse } from "next/server";
import { getRun, upsertRun } from "@/lib/db";
import { closeStream } from "@/lib/streamStore";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = getRun(id);
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (run.status !== "running") return NextResponse.json({ error: "Run is not active" }, { status: 400 });

  // Mark cancelled and close the SSE stream
  upsertRun({ ...run, status: "cancelled", finishedAt: new Date().toISOString() });
  closeStream(id);

  return NextResponse.json({ ok: true });
}
