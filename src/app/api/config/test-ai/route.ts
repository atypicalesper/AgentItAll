import { NextResponse } from "next/server";
import { getConfig } from "@/lib/db";
import Anthropic from "@anthropic-ai/sdk";

export async function POST() {
  const config = getConfig();
  if (!config.ai.apiKey) {
    return NextResponse.json({ ok: false, error: "No API key configured." });
  }
  try {
    const client = new Anthropic({ apiKey: config.ai.apiKey });
    const msg = await client.messages.create({
      model: config.ai.model,
      max_tokens: 16,
      messages: [{ role: "user", content: "ping" }],
    });
    const reply = msg.content.find((b) => b.type === "text")?.text ?? "ok";
    return NextResponse.json({ ok: true, reply });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) });
  }
}
