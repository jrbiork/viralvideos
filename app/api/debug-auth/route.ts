import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '../../../lib/session-utils';
import { cookies } from 'next/headers';

const COGNITO_TOKEN_COOKIE_NAME = 'viral-videos-cognito-token';

export async function GET(request: NextRequest) {
  console.log('🔍 Debug auth endpoint called');

  try {
    // Verify session
    const session = await verifySession();
    console.log('📋 Session verification result:', {
      hasSession: !!session,
      userId: session?.sub,
      email: session?.email,
    });

    if (!session) {
      return NextResponse.json({ error: 'No valid session' }, { status: 401 });
    }

    // Get the Cognito JWT token from the httpOnly cookie
    const cookieStore = cookies();
    const cognitoTokenCookie = cookieStore.get(COGNITO_TOKEN_COOKIE_NAME);

    if (!cognitoTokenCookie) {
      return NextResponse.json(
        { error: 'No Cognito token found in cookie' },
        { status: 401 },
      );
    }

    const cognitoToken = cognitoTokenCookie.value;

    return NextResponse.json({
      success: true,
      session: {
        userId: session.sub,
        email: session.email,
        name: session.name,
      },
      token: {
        length: cognitoToken.length,
        // Don't expose the full token for security
        preview: cognitoToken.substring(0, 20) + '...',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('💥 Debug auth error:', error);
    return NextResponse.json(
      {
        error: 'Debug auth failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
