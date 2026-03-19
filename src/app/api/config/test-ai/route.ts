import { NextResponse } from "next/server";
import { getConfig } from "@/lib/db";
import { getModel } from "@/lib/providers";
import { generateText } from "ai";

export async function POST() {
  const config = getConfig();
  const { provider, model, keys } = config.ai;
  const apiKey = keys[provider];
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: `No API key configured for ${provider}.` });
  }
  try {
    const llm = getModel(provider, model, apiKey);
    const { text } = await generateText({ model: llm, prompt: "ping" });
    return NextResponse.json({ ok: true, reply: text });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) });
  }
}
