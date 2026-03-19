import { NextResponse } from "next/server";
import { getTask, upsertTask, deleteTask } from "@/lib/db";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const task = getTask(id);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(task);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const task = getTask(id);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json();
  const updated = { ...task, ...body, id, updatedAt: new Date().toISOString() };
  upsertTask(updated);
  return NextResponse.json(updated);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  deleteTask(id);
  return NextResponse.json({ ok: true });
}
