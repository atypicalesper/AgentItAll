import { EventEmitter } from "events";

const STREAM_TTL_MS = 30 * 60 * 1000; // 30 min — forcibly evict stuck streams

interface Entry { emitter: EventEmitter; createdAt: number }
const store = new Map<string, Entry>();

// Prune entries older than TTL (called on each create to avoid a separate timer)
function prune() {
  const now = Date.now();
  for (const [id, entry] of store) {
    if (now - entry.createdAt > STREAM_TTL_MS) {
      entry.emitter.removeAllListeners();
      store.delete(id);
    }
  }
}

export function createStream(runId: string): EventEmitter {
  prune();
  const emitter = new EventEmitter();
  store.set(runId, { emitter, createdAt: Date.now() });
  return emitter;
}

export function getStream(runId: string): EventEmitter | undefined {
  return store.get(runId)?.emitter;
}

export function emit(runId: string, event: string, data: string): void {
  store.get(runId)?.emitter.emit(event, data);
}

export function closeStream(runId: string): void {
  const entry = store.get(runId);
  if (entry) {
    entry.emitter.emit("done");
    entry.emitter.removeAllListeners();
    store.delete(runId);
  }
}
