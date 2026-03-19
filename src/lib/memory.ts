import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const MEMORY_DIR = join(process.cwd(), "data", "memory");
const MAX_MEMORIES = 5;

export function loadMemory(taskId: string): string[] {
  const p = join(MEMORY_DIR, `${taskId}.json`);
  if (!existsSync(p)) return [];
  try {
    return (JSON.parse(readFileSync(p, "utf8")) as string[]).slice(-3);
  } catch {
    return [];
  }
}

export function appendMemory(taskId: string, summary: string): void {
  mkdirSync(MEMORY_DIR, { recursive: true });
  const p = join(MEMORY_DIR, `${taskId}.json`);
  const existing: string[] = existsSync(p)
    ? JSON.parse(readFileSync(p, "utf8")) as string[]
    : [];
  existing.push(summary);
  writeFileSync(p, JSON.stringify(existing.slice(-MAX_MEMORIES), null, 2));
}
