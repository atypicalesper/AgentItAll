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

  // approve — commit each repo
  let sha = "";
  const newEdits = [...run.edits];
  for (const repoPath of run.repos) {
    const diff = getDiff(repoPath);
    sha = commitAll(repoPath, run.pendingCommitMessage ?? "agent: approved commit");
    if (diff) newEdits.push(...parseDiff(diff));
    if (task?.permissions.push) {
      try {
        if (run.branchName) pushBranch(repoPath, run.branchName);
        else push(repoPath);
      } catch { /* non-fatal */ }
    }
  }

  upsertRun({ ...run, approvalStatus: "approved", commitSha: sha || undefined, pushed: !!task?.permissions.push, edits: newEdits });
  return NextResponse.json({ ok: true });
}
