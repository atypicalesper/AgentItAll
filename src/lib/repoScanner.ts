import { readdirSync, existsSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import type { Repo } from "./types";

function run(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return "";
  }
}

export function scanRepos(baseDir: string): Repo[] {
  if (!existsSync(baseDir)) return [];

  const repos: Repo[] = [];

  for (const entry of readdirSync(baseDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(baseDir, entry.name);
    if (!existsSync(join(dir, ".git"))) continue;

    const branch = run("git branch --show-current", dir);
    const lastCommit = run('git log -1 --format="%ar — %s"', dir);

    repos.push({
      name: entry.name,
      path: dir,
      branch: branch || "unknown",
      lastCommit: lastCommit || "—",
    });
  }

  return repos;
}

export function scanMultipleDirs(baseDirs: string[]): Repo[] {
  const seen = new Set<string>();
  const repos: Repo[] = [];
  for (const dir of baseDirs) {
    for (const repo of scanRepos(dir)) {
      if (!seen.has(repo.path)) {
        seen.add(repo.path);
        repos.push(repo);
      }
    }
  }
  return repos;
}
