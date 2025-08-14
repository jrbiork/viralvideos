import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify, createRemoteJWKSet } from 'jose';

const COGNITO_TOKEN_COOKIE_NAME = 'viral-videos-cognito-token';

// Routes that require authentication
const protectedRoutes = ['/create', '/videos', '/debug'];

// Routes that should redirect to login if not authenticated
const authRoutes = ['/auth/callback'];

async function verifyCognitoToken(token: string): Promise<boolean> {
  try {
    const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
    const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
    const region = process.env.NEXT_PUBLIC_COGNITO_REGION || 'us-east-1';

    if (!userPoolId || !clientId) {
      return false;
    }

    const jwksUrl = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`;
    const JWKS = createRemoteJWKSet(new URL(jwksUrl));

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`,
      algorithms: ['RS256'],
    });

    // Manual audience validation
    const tokenClientId = payload.client_id || payload.aud;
    if (tokenClientId !== clientId) {
      return false;
    }

    // Additional validation
    if (payload.token_use !== 'access') {
      return false;
    }

    // Check if token is expired
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return false;
    }

    return true;
  } catch (error) {
    console.error('Cognito token verification failed:', error);
    return false;
  }
}

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
    const isValid = await verifyCognitoToken(cognitoToken.value);

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
