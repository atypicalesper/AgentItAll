// eslint-disable-next-line @typescript-eslint/no-require-imports
const cron = require("node-cron") as typeof import("node-cron");
import type { Task, ScheduleType } from "./types";
import { getTasks, getRuns, getConfig } from "./db";
import { runAgent } from "./agentExecutor";
import { sendDailyDigest } from "./digest";

let initialized = false;
const jobs = new Map<string, import("node-cron").ScheduledTask>();

function toCronExpression(schedule: ScheduleType): string | null {
  switch (schedule.kind) {
    case "manual":  return null;
    case "hourly":  return "0 * * * *";
    case "daily":   return `${schedule.minute} ${schedule.hour} * * *`;
    case "weekly":  return `${schedule.minute} ${schedule.hour} * * ${schedule.dayOfWeek}`;
    case "monthly": return `${schedule.minute} ${schedule.hour} ${schedule.dayOfMonth} * *`;
    case "cron":    return schedule.expr;
  }
}

function isAlreadyRunning(taskId: string): boolean {
  const runs = getRuns();
  return runs.some((r) => r.taskId === taskId && r.status === "running");
}

function registerTask(task: Task) {
  // remove old job if exists
  jobs.get(task.id)?.stop();
  jobs.delete(task.id);

  if (!task.enabled) return;

  const expr = toCronExpression(task.schedule);
  if (!expr) return;

  let job: import("node-cron").ScheduledTask;
  try {
    job = cron.schedule(expr, async () => {
      if (isAlreadyRunning(task.id)) {
        console.log(`[scheduler] Task ${task.name} already running, skipping.`);
        return;
      }
      const runId = crypto.randomUUID();
      console.log(`[scheduler] Triggering task: ${task.name} (${runId})`);
      runAgent(task, runId, "scheduled").catch((err) =>
        console.error(`[scheduler] Task ${task.name} failed:`, err)
      );
    });
  } catch (err) {
    console.error(`[scheduler] Invalid cron expression for task "${task.name}" (${expr}):`, err);
    return;
  }

  jobs.set(task.id, job);
  console.log(`[scheduler] Registered: ${task.name} → ${expr}`);
}

let digestJob: import("node-cron").ScheduledTask | null = null;

function registerDigest() {
  digestJob?.stop();
  const config = getConfig();
  if (!config.digest?.enabled) return;
  const hour = config.digest.hour ?? 8;
  const expr = `0 ${hour} * * *`;
  digestJob = cron.schedule(expr, () => {
    sendDailyDigest(getConfig()).catch(console.error);
  });
  console.log(`[scheduler] Daily digest registered at ${hour}:00`);
}

export function initScheduler() {
  if (initialized) return;
  initialized = true;

  const tasks = getTasks();
  for (const task of tasks) {
    registerTask(task);
  }
  registerDigest();

  console.log(`[scheduler] Initialized with ${tasks.length} tasks.`);
}

export function refreshScheduler() {
  const tasks = getTasks();
  const taskIds = new Set(tasks.map((t) => t.id));

  // remove stale jobs
  for (const [id, job] of jobs) {
    if (!taskIds.has(id)) {
      job.stop();
      jobs.delete(id);
    }
  }

  // register/update all
  for (const task of tasks) {
    registerTask(task);
  }
  registerDigest();
}
