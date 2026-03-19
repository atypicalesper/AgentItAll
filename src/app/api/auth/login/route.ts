import { NextResponse } from "next/server";
import { createHmac } from "crypto";

const PASSWORD = process.env.AUTH_PASSWORD ?? "";
const SECRET = process.env.AUTH_SECRET ?? "agentitall-local-secret";

function makeToken(password: string): string {
  return createHmac("sha256", SECRET).update(password).digest("hex");
}

export async function POST(req: Request) {
  const { password } = await req.json() as { password: string };

  if (!PASSWORD || password !== PASSWORD) {
    return NextResponse.json({ ok: false, error: "Invalid password" }, { status: 401 });
  }

  const token = makeToken(password);
  const res = NextResponse.json({ ok: true });
  res.cookies.set("aia_auth", token, {
    httpOnly: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    sameSite: "lax",
  });
  return res;
}
