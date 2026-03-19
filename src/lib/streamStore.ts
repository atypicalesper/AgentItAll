import { EventEmitter } from "events";

const store = new Map<string, EventEmitter>();

export function createStream(runId: string): EventEmitter {
  const emitter = new EventEmitter();
  store.set(runId, emitter);
  return emitter;
}

export function getStream(runId: string): EventEmitter | undefined {
  return store.get(runId);
}

export function emit(runId: string, event: string, data: string): void {
  store.get(runId)?.emit(event, data);
}

export function closeStream(runId: string): void {
  const emitter = store.get(runId);
  if (emitter) {
    emitter.emit("done");
    emitter.removeAllListeners();
    store.delete(runId);
  }
}
