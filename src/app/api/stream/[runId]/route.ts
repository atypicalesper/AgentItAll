import { getStream } from "@/lib/streamStore";

export async function GET(_: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;

  const stream = new ReadableStream({
    start(controller) {
      const emitter = getStream(runId);

      const send = (chunk: string) => {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`));
      };

      if (!emitter) {
        send("[stream] Run not found or already completed.");
        controller.close();
        return;
      }

      emitter.on("chunk", send);
      emitter.on("done", () => {
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        controller.close();
      });
      emitter.on("error", (err: string) => {
        send(`[error] ${err}`);
        controller.close();
      });
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
