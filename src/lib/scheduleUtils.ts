import { CronExpressionParser } from "cron-parser";
import type { ScheduleType } from "./types";

export function getNextRun(schedule: ScheduleType): Date | null {
  try {
    const expr = toCronExpr(schedule);
    if (!expr) return null;
    return CronExpressionParser.parse(expr).next().toDate();
  } catch {
    return null;
  }
}

export function describeSchedule(schedule: ScheduleType): string {
  switch (schedule.kind) {
    case "manual":  return "Manual";
    case "hourly":  return "Every hour";
    case "daily":   return `Daily ${String(schedule.hour).padStart(2, "0")}:${String(schedule.minute).padStart(2, "0")}`;
    case "weekly": {
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      return `${days[schedule.dayOfWeek]} ${String(schedule.hour).padStart(2, "0")}:${String(schedule.minute).padStart(2, "0")}`;
    }
    case "monthly": return `Day ${schedule.dayOfMonth} ${String(schedule.hour).padStart(2, "0")}:${String(schedule.minute).padStart(2, "0")}`;
    case "cron":    return schedule.expr;
  }
}

export function formatTimeUntil(date: Date): string {
  const ms = date.getTime() - Date.now();
  if (ms < 0) return "overdue";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 24) return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh > 0 ? `${d}d ${rh}h` : `${d}d`;
}

/** Returns null if valid, error message if invalid */
export function validateCronExpr(expr: string): string | null {
  try {
    CronExpressionParser.parse(expr);
    return null;
  } catch (e) {
    return String(e instanceof Error ? e.message : e);
  }
}

function toCronExpr(schedule: ScheduleType): string | null {
  switch (schedule.kind) {
    case "manual":  return null;
    case "hourly":  return "0 * * * *";
    case "daily":   return `${schedule.minute} ${schedule.hour} * * *`;
    case "weekly":  return `${schedule.minute} ${schedule.hour} * * ${schedule.dayOfWeek}`;
    case "monthly": return `${schedule.minute} ${schedule.hour} ${schedule.dayOfMonth} * *`;
    case "cron":    return schedule.expr;
  }
}
