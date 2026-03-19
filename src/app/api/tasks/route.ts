import { NextResponse } from "next/server";
import { getTasks, upsertTask } from "@/lib/db";
import type { Task } from "@/lib/types";

export async function GET() {
  return NextResponse.json(getTasks());
}

export async function POST(req: Request) {
  const body = await req.json();
  const task: Task = {
    ...body,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  upsertTask(task);
  return NextResponse.json(task, { status: 201 });
}
