import { NextResponse } from "next/server";
import { getRun, getTask, upsertRun } from "@/lib/db";
import { commitAll, push, pushBranch, discardChanges, getDiff } from "@/lib/gitOps";
import { parseDiff } from "@/lib/diffParser";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { action } = await req.json() as { action: "approve" | "reject" };

  const run = getRun(id);
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (run.approvalStatus !== "pending") return NextResponse.json({ error: "Not pending approval" }, { status: 400 });

  const task = getTask(run.taskId);

  if (action === "reject") {
    for (const repoPath of run.repos) discardChanges(repoPath);
    upsertRun({ ...run, approvalStatus: "rejected" });
    return NextResponse.json({ ok: true });
  }

  if (!task) {
    // Task was deleted — still commit the written files but skip push
    const newEdits = [...run.edits];
    const shas: string[] = [];
    for (const repoPath of run.repos) {
      const diff = getDiff(repoPath);
      const sha = commitAll(repoPath, run.pendingCommitMessage ?? "agent: approved commit");
      if (sha) shas.push(sha);
      if (diff) newEdits.push(...parseDiff(diff));
    }
    upsertRun({ ...run, approvalStatus: "approved", commitSha: shas[0], edits: newEdits });
    return NextResponse.json({ ok: true, warning: "Task was deleted; changes committed but not pushed" });
  }

  // approve — commit each repo, collect all SHAs
  const shas: string[] = [];
  const newEdits = [...run.edits];
  let pushed = false;
  for (const repoPath of run.repos) {
    const diff = getDiff(repoPath);
    const sha = commitAll(repoPath, run.pendingCommitMessage ?? "agent: approved commit");
    if (sha) shas.push(sha);
    if (diff) newEdits.push(...parseDiff(diff));
    if (task.permissions.push) {
      try {
        if (run.branchName) pushBranch(repoPath, run.branchName);
        else push(repoPath);
        pushed = true;
      } catch (err) {
        console.error(`[approve] push failed for ${repoPath}:`, err);
      }
    }
  }

  upsertRun({ ...run, approvalStatus: "approved", commitSha: shas[0], commitShas: shas, pushed, edits: newEdits });
  return NextResponse.json({ ok: true });
}
