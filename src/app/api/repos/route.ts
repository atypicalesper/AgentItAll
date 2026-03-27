import { NextResponse } from "next/server";
import { getConfig } from "@/lib/db";
import { scanMultipleDirs } from "@/lib/repoScanner";

export async function GET() {
  const config = getConfig();
  const repos = scanMultipleDirs(config.baseDirs);
  return NextResponse.json(repos);
}
