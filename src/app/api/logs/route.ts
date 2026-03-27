import { NextRequest, NextResponse } from "next/server";
import { getDbLogs } from "@/lib/db";

export async function GET(req: NextRequest) {
  const since = Number(req.nextUrl.searchParams.get("since") ?? "0");
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? "500");
  return NextResponse.json({ logs: getDbLogs(since, limit) });
}
