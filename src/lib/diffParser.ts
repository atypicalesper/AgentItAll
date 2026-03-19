import type { FileEdit } from "./types";

export function parseDiff(diff: string): FileEdit[] {
  const edits: FileEdit[] = [];
  const fileBlocks = diff.split(/^diff --git /m).filter(Boolean);
  for (const block of fileBlocks) {
    const match = block.match(/^a\/(.+) b\//);
    if (match) edits.push({ path: match[1], diff: "diff --git " + block });
  }
  return edits;
}
