import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(req: NextRequest) {
  const dir = req.nextUrl.searchParams.get("path") ?? process.env.HOME ?? "/";
  const resolved = path.resolve(dir);

  try {
    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b));

    const parent = path.dirname(resolved) !== resolved ? path.dirname(resolved) : null;

    return NextResponse.json({ path: resolved, parent, dirs });
  } catch {
    return NextResponse.json({ error: "Cannot read directory" }, { status: 400 });
  }
}
