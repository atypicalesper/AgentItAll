import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SECRET = process.env.AUTH_SECRET ?? "agentitall-local-secret";

async function makeToken(password: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(password));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always allow auth endpoints, static assets
  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname === "/login"
  ) {
    return NextResponse.next();
  }

  // Fetch config to check if password is set — read from data/config.json via API
  // We can't import server-side db here (middleware runs in Edge runtime),
  // so we make an internal request to /api/config
  try {
    const configRes = await fetch(new URL("/api/config", req.url));
    if (configRes.ok) {
      const config = await configRes.json() as { password?: string };
      if (!config.password) return NextResponse.next(); // no password set, open access

      const cookie = req.cookies.get("aia_auth")?.value ?? "";
      const expected = await makeToken(config.password);
      if (cookie !== expected) {
        const loginUrl = new URL("/login", req.url);
        loginUrl.searchParams.set("from", pathname);
        return NextResponse.redirect(loginUrl);
      }
    }
  } catch {
    // If we can't fetch config, allow through (fail open for local tool)
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
