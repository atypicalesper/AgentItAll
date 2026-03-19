import type { Task } from "./types";

let initialized = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let watcher: any = null;

// taskId → Set of paths it watches
const watchMap = new Map<string, Set<string>>();

export async function initFileWatcher(tasks: Task[]) {
  if (initialized) return;
  initialized = true;

  const watched = tasks.filter((t) => t.enabled && t.watchPaths?.length);
  if (!watched.length) return;

  // dynamic import — chokidar is CJS and only available in Node
  const chokidar = await import("chokidar");
  const { runAgent } = await import("./agentExecutor");
  const { getRuns } = await import("./db");

  const allPaths: string[] = [];
  for (const task of watched) {
    const paths = task.watchPaths!;
    watchMap.set(task.id, new Set(paths));
    allPaths.push(...paths);
  }

  watcher = chokidar.watch(allPaths, { ignoreInitial: true, persistent: true });

  watcher.on("change", (filePath: string) => {
    for (const task of watched) {
      const paths = watchMap.get(task.id);
      if (!paths) continue;
      const matches = [...paths].some((p) => filePath.startsWith(p) || filePath === p);
      if (!matches) continue;

      // skip if already running
      const runs = getRuns({ taskId: task.id, status: "running" });
      if (runs.length > 0) return;

      const runId = crypto.randomUUID();
      console.log(`[fileWatcher] ${filePath} changed → triggering task: ${task.name}`);
      runAgent(task, runId, "scheduled").catch(console.error);
    }
  });

  console.log(`[fileWatcher] Watching ${allPaths.length} paths for ${watched.length} tasks`);
}

export async function refreshFileWatcher(tasks: Task[]) {
  if (watcher) {
    await watcher.close();
    watcher = null;
  }
  initialized = false;
  watchMap.clear();
  await initFileWatcher(tasks);
}
