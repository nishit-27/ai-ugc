import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

// Paths that bypass the session check. Add here for: webhooks (no
// session cookie), cron entry points (gated on CRON_SECRET inside the
// route), OAuth redirects (browser has no session yet), and the auth
// pages themselves.
const publicPaths = [
  "/login",
  "/access-denied",
  "/api/auth",
  "/api/fal-webhook",
  "/api/recover-stuck-jobs",
  "/api/analytics/cron",
  "/api/late-analytics/sync",   // Vercel cron — gated on CRON_SECRET in prod
  "/api/late/connect",          // Late OAuth redirect target
  "/api/late/invite",           // Late OAuth invite redirect
  "/api/tiktok/connect",        // TikTok OAuth start
];

/**
 * Internal API paths that are called server-to-server (no session cookie).
 * Matched by checking if the pathname ends with /process.
 */
function isInternalApi(pathname: string) {
  return /^\/api\/templates\/[^/]+\/process$/.test(pathname);
}

function isPublic(pathname: string) {
  return publicPaths.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname) || isInternalApi(pathname)) return NextResponse.next();

  if (!req.auth) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
