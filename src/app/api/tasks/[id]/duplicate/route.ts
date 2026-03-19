import { NextResponse } from "next/server";
import { getTask, upsertTask } from "@/lib/db";
import { refreshScheduler } from "@/lib/scheduler";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const original = getTask(id);
  if (!original) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const now = new Date().toISOString();
  const copy = { ...original, id: crypto.randomUUID(), name: `${original.name} (copy)`, createdAt: now, updatedAt: now };
  upsertTask(copy);
  refreshScheduler();
  return NextResponse.json(copy, { status: 201 });
}
