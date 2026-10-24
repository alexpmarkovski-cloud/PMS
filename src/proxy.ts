import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/dashboard"];

function isProtected(pathname: string) {
  return PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
}

// Refreshes the Supabase auth session on every matched request (expired
// tokens are re-issued here, since Server Components can't write cookies)
// and redirects signed-out users away from protected routes.
//
// Failure policy: this proxy fronts every route, so an unhandled exception
// here would 500 the entire site. If the auth check itself blows up
// (Supabase outage, network failure), public routes fail OPEN (page still
// serves) and protected routes fail CLOSED (redirect to /login) — never
// serve protected content on an unverified session.
export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value),
            );
            supabaseResponse = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options),
            );
          },
        },
      },
    );

    // Do not run code between createServerClient and getUser — a stale
    // session could otherwise be forwarded to the page.
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user && isProtected(request.nextUrl.pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }

    return supabaseResponse;
  } catch (error) {
    // Baseline logging until an error-reporting decision is made
    // (launch_decisions.md — Sentry vs plain logging). In production this
    // lands in the host's function logs (e.g. Vercel).
    console.error("[proxy] auth check failed:", error);

    if (isProtected(request.nextUrl.pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    return NextResponse.next({ request });
  }
}

export const config = {
  matcher: [
    // Skip static assets and the health endpoint.
    "/((?!_next/static|_next/image|favicon.ico|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
