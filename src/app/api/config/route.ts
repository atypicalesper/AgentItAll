import { NextResponse } from "next/server";
import { getConfig, saveConfig } from "@/lib/db";

export async function GET() {
  return NextResponse.json(getConfig());
}

export async function PATCH(req: Request) {
  const body = await req.json();
  const current = getConfig();
  const updated = {
    ...current,
    ...body,
    ai: { ...current.ai, ...(body.ai ?? {}) },
    smtp: { ...current.smtp, ...(body.smtp ?? {}) },
  };
  saveConfig(updated);
  return NextResponse.json(updated);
}
