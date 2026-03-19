import { execSync, execFileSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

function run(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch (e: unknown) {
    const err = e as { stderr?: Buffer };
    throw new Error(err.stderr?.toString() ?? String(e));
  }
}

function runSafe(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return "";
  }
}

export function getFileTree(repoPath: string): string {
  return runSafe("git ls-files", repoPath);
}

export function readFile(repoPath: string, filePath: string): string {
  const full = join(repoPath, filePath);
  if (!existsSync(full)) return "(file not found)";
  const content = readFileSync(full, "utf8") as string;
  if (content.length > 100_000) return "(file too large — > 100 KB, skipped)";
  return content;
}

export function getDiff(repoPath: string): string {
  return runSafe("git diff HEAD", repoPath);
}

export function getStatus(repoPath: string): string {
  return runSafe("git status --short", repoPath);
}

export function commitAll(repoPath: string, message: string): string {
  runSafe("git add -A", repoPath);
  try {
    execFileSync("git", ["commit", "-m", message], {
      cwd: repoPath, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    return "";
  }
  return runSafe("git rev-parse --short HEAD", repoPath);
}

export function push(repoPath: string): void {
  run("git push", repoPath);
}

export function createBranch(repoPath: string, branch: string): void {
  try {
    execFileSync("git", ["checkout", "-b", branch], {
      cwd: repoPath, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (e: unknown) {
    const err = e as { stderr?: Buffer };
    throw new Error(err.stderr?.toString() ?? String(e));
  }
}

export function pushBranch(repoPath: string, branch: string): void {
  try {
    execFileSync("git", ["push", "-u", "origin", branch], {
      cwd: repoPath, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (e: unknown) {
    const err = e as { stderr?: Buffer };
    throw new Error(err.stderr?.toString() ?? String(e));
  }
}

export function getRemoteUrl(repoPath: string): string {
  return runSafe("git remote get-url origin", repoPath);
}

export function discardChanges(repoPath: string): void {
  runSafe("git checkout -- .", repoPath);
  runSafe("git clean -fd", repoPath);
}

/** Parse "owner/repo" from an https or ssh remote URL */
export function parseOwnerRepo(remoteUrl: string): { owner: string; repo: string } | null {
  // https://github.com/owner/repo.git or git@github.com:owner/repo.git
  const https = remoteUrl.match(/github\.com[/:]([^/]+)\/([^/\s]+?)(?:\.git)?$/);
  if (https) return { owner: https[1], repo: https[2] };
  return null;
}
