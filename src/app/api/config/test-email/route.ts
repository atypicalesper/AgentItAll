import { NextResponse } from "next/server";
import { getConfig } from "@/lib/db";
import { sendEmail } from "@/lib/emailer";

export async function POST() {
  const config = getConfig();
  try {
    const result = await sendEmail(config.smtp, "[agentItAll] Test Email", "Your email config is working correctly.");
    return NextResponse.json({ ok: true, etherealUrl: result.etherealUrl ?? null });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) });
  }
}
