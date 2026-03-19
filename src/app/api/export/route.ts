import { getTasks, getRuns, getConfig } from "@/lib/db";

export async function GET() {
  const payload = { tasks: getTasks(), runs: getRuns(), config: getConfig() };
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="agentitall-export-${Date.now()}.json"`,
    },
  });
}
