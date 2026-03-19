import { NextResponse } from "next/server";
import { getConfig } from "@/lib/db";
import { scanRepos } from "@/lib/repoScanner";

export async function GET() {
  const config = getConfig();
  const repos = scanRepos(config.baseDir);
  return NextResponse.json(repos);
}
