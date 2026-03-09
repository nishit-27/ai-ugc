import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

const publicPaths = ["/login", "/access-denied", "/api/auth", "/api/fal-webhook", "/api/recover-stuck-jobs", "/api/analytics/cron"];

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
