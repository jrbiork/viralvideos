import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyCognitoTokenPayload } from '../../../lib/auth-utils';

const COGNITO_TOKEN_COOKIE_NAME = 'viral-videos-cognito-token';

export async function GET(request: NextRequest) {
  try {
    // Get the Cognito token from the HTTP-only cookie
    const cookieStore = cookies();
    const cognitoToken = cookieStore.get(COGNITO_TOKEN_COOKIE_NAME);

    if (!cognitoToken) {
      return NextResponse.json(
        { error: 'No authentication token available' },
        { status: 401 }
      );
    }

    // Verify the token is valid
    const userData = await verifyCognitoTokenPayload(cognitoToken.value);
    if (!userData) {
      return NextResponse.json(
        { error: 'Invalid authentication token' },
        { status: 401 }
      );
    }

    // Return the token for WebSocket connection
    return NextResponse.json({
      token: cognitoToken.value,
      user: {
        id: userData.sub,
        username: userData.username,
      }
    });
  } catch (error) {
    console.error('Error getting WebSocket token:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
