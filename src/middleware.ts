import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PASSWORD = process.env.AUTH_PASSWORD ?? "";
const SECRET = process.env.AUTH_SECRET ?? "agentitall-local-secret";

// Cache the derived HMAC key across requests (module-level, evaluated once)
const keyPromise: Promise<CryptoKey> = crypto.subtle.importKey(
  "raw",
  new TextEncoder().encode(SECRET),
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign"],
);

async function makeToken(password: string): Promise<string> {
  const key = await keyPromise;
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(password));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // No password configured — open access (empty string = auth disabled)
  if (!PASSWORD.trim()) return NextResponse.next();

  // Always pass auth endpoints and login page
  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname === "/login"
  ) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get("aia_auth")?.value ?? "";
  const expected = await makeToken(PASSWORD);
  if (cookie !== expected) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
