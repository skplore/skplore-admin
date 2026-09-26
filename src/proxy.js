import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

/**
 * proxy.js — Next.js 16 edge proxy (equivalent of middleware)
 * ─────────────────────────────────────────────────────────────────────────────
 * Security layers enforced at the edge on EVERY request:
 *
 *  1. Silently refresh the Supabase JWT access token using the stored refresh
 *     token so server components always see a valid, non-expired session.
 *     (Uses getUser() — validated server-side, cannot be forged locally.)
 *
 *  2. Unauthenticated request to any protected page → redirect to /login
 *     Preserves the original destination in ?next= so we can bounce back.
 *
 *  3. Authenticated user visiting /login → redirect to dashboard.
 *
 * API routes (/api/*) are also covered — the requireAuth() helper in each
 * route provides an additional server-side check (defence in depth).
 */

// Routes that are ALWAYS public — no session required
const PUBLIC_PATHS = ['/login', '/api/gadget-limits'];

// Prefixes we never intercept (Next.js internals + static assets)
const BYPASS_PREFIXES = [
  '/_next/static',
  '/_next/image',
  '/favicon.ico',
  '/robots.txt',
];

function isPublic(pathname) {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );
}

function shouldBypass(pathname) {
  return BYPASS_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function proxy(request) {
  const { pathname } = request.nextUrl;

  // Fast-pass for static assets — don't hit Supabase for every JS chunk
  if (shouldBypass(pathname)) {
    return NextResponse.next({ request });
  }

  // ── Build a Supabase client that can read + write cookies at the edge ─────
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Write refreshed tokens onto both the request (for server components)
          // and the response (so the browser stores the new cookie).
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Always use getUser() — not getSession().
  // getUser() calls Supabase servers to validate the JWT.
  // getSession() only reads the local cookie and can be spoofed.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  const isAuthenticated = !error && !!user;

  // ── 1. Unauthenticated → /login (preserve destination) ───────────────────
  if (!isAuthenticated && !isPublic(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    // Only preserve ?next= for page navigations, not API calls
    if (!pathname.startsWith('/api/')) {
      loginUrl.searchParams.set('next', pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  // ── 2. Already logged in, hitting /login → dashboard ─────────────────────
  if (isAuthenticated && isPublic(pathname)) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = '/';
    dashboardUrl.search = '';
    return NextResponse.redirect(dashboardUrl);
  }

  // ── 3. All good — return the (possibly cookie-refreshed) response ─────────
  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match every route EXCEPT:
     *   _next/static  — compiled JS/CSS bundles
     *   _next/image   — Next.js image optimisation
     *   favicon.ico
     *   Common static file extensions
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|mp3|woff|woff2)$).*)',
  ],
};
