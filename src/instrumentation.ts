export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initScheduler } = await import("./lib/scheduler");
    const { initFileWatcher } = await import("./lib/fileWatcher");
    const { getTasks } = await import("./lib/db");
    initScheduler();
    const tasks = getTasks();
    initFileWatcher(tasks).catch(console.error);
  }
}
