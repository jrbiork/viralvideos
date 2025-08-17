import { NextRequest, NextResponse } from 'next/server';
import { verifyCognitoTokenBoolean } from './lib/auth-utils';

const COGNITO_TOKEN_COOKIE_NAME = 'viral-videos-cognito-token';

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

  // Get the Cognito token cookie
  const cognitoToken = request.cookies.get(COGNITO_TOKEN_COOKIE_NAME);

  if (!cognitoToken) {
    // No token, redirect to login for protected routes
    if (isProtectedRoute) {
      const loginUrl = new URL('/', request.url);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  try {
    // Verify the Cognito token
    const isValid = await verifyCognitoTokenBoolean(cognitoToken.value);

    if (!isValid) {
      // Invalid token, redirect to login for protected routes
      if (isProtectedRoute) {
        const loginUrl = new URL('/', request.url);
        return NextResponse.redirect(loginUrl);
      }
      return NextResponse.next();
    }

    // Token is valid, allow access
    return NextResponse.next();
  } catch (error) {
    // Token verification failed, redirect to login for protected routes
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
