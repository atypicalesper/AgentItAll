import { NextRequest, NextResponse } from "next/server";
import { getLogs } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const since = Number(req.nextUrl.searchParams.get("since") ?? "0");
  return NextResponse.json({ logs: getLogs(since) });
}
