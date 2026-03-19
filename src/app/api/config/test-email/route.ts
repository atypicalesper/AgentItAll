import { NextResponse } from "next/server";
import { getConfig } from "@/lib/db";
import { sendEmail } from "@/lib/emailer";

export async function POST() {
  const config = getConfig();
  try {
    await sendEmail(config.smtp, "[agentItAll] Test Email", "Your SMTP config is working correctly.");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) });
  }
}
