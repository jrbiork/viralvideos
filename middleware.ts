import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const SESSION_SECRET =
  process.env.SESSION_SECRET || 'your-session-secret-key-change-in-production';
const SESSION_COOKIE_NAME = 'viral-videos-session';

// Routes that require authentication
const protectedRoutes = ['/create', '/videos', '/debug'];

// Routes that should redirect to login if not authenticated
const authRoutes = ['/auth/callback'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for API routes and static files
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon.ico')
  ) {
    return NextResponse.next();
  }

  // Check if the route requires authentication
  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route),
  );
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route));

  if (!isProtectedRoute && !isAuthRoute) {
    return NextResponse.next();
  }

  // Get the session cookie
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME);

  if (!sessionToken) {
    // No session, redirect to login for protected routes
    if (isProtectedRoute) {
      const loginUrl = new URL('/', request.url);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  try {
    // Verify the session token
    const { payload } = await jwtVerify(
      sessionToken.value,
      new TextEncoder().encode(SESSION_SECRET),
    );

    // Check if session is expired
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      // Session expired, redirect to login for protected routes
      if (isProtectedRoute) {
        const loginUrl = new URL('/', request.url);
        return NextResponse.redirect(loginUrl);
      }
      return NextResponse.next();
    }

    // Session is valid, allow access
    return NextResponse.next();
  } catch (error) {
    // Invalid session, redirect to login for protected routes
    if (isProtectedRoute) {
      const loginUrl = new URL('/', request.url);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
