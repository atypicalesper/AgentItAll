import { getStream } from "@/lib/streamStore";

export async function GET(_: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;

  const stream = new ReadableStream({
    start(controller) {
      const emitter = getStream(runId);
      const enc = new TextEncoder();

      const send = (chunk: string) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(chunk)}\n\n`));
        } catch {
          // Client disconnected — stop listening
          cleanup();
        }
      };

      const onDone = () => {
        try {
          controller.enqueue(enc.encode("data: [DONE]\n\n"));
          controller.close();
        } catch { /* already closed */ }
        cleanup();
      };

      const onError = (err: string) => {
        send(`[error] ${err}`);
        try { controller.close(); } catch { /* already closed */ }
        cleanup();
      };

      const cleanup = () => {
        emitter?.off("chunk", send);
        emitter?.off("done", onDone);
        emitter?.off("error", onError);
      };

      if (!emitter) {
        send("[stream] Run not found or already completed.");
        try { controller.close(); } catch { /* already closed */ }
        return;
      }

      emitter.on("chunk", send);
      emitter.on("done", onDone);
      emitter.on("error", onError);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
