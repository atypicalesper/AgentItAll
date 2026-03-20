import { getTasks, getRuns, getRunsCount, getConfig } from "@/lib/db";

const PAGE = 200; // runs per chunk — keeps peak memory bounded

export async function GET() {
  const enc = new TextEncoder();
  const tasks = getTasks();
  const config = getConfig();
  const total = getRunsCount();

  const stream = new ReadableStream({
    async start(controller) {
      // Open the outer JSON object
      controller.enqueue(enc.encode('{\n  "tasks": '));
      controller.enqueue(enc.encode(JSON.stringify(tasks, null, 2)));
      controller.enqueue(enc.encode(',\n  "config": '));
      controller.enqueue(enc.encode(JSON.stringify(config, null, 2)));
      controller.enqueue(enc.encode(',\n  "runs": [\n'));

      // Stream runs page by page
      let written = 0;
      for (let page = 1; written < total; page++) {
        const batch = getRuns({ page, limit: PAGE });
        for (const run of batch) {
          if (written > 0) controller.enqueue(enc.encode(",\n"));
          controller.enqueue(enc.encode(JSON.stringify(run)));
          written++;
        }
        if (batch.length < PAGE) break;
      }

      controller.enqueue(enc.encode("\n  ]\n}"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="agentitall-export-${Date.now()}.json"`,
    },
  });
}
