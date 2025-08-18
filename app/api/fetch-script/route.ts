import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '../../../lib/session-utils';
import { cookies } from 'next/headers';

const COGNITO_TOKEN_COOKIE_NAME = 'viral-videos-cognito-token';

export async function GET(request: NextRequest) {
  try {
    // Verify session
    const session = await verifySession();

    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized: No valid session found' },
        { status: 401 },
      );
    }

    // Use session user info
    const userInfo = {
      id: session.sub,
      email: session.email,
    };

    if (!process.env.API_GATEWAY_URL) {
      return NextResponse.json(
        { error: 'API Gateway URL not configured' },
        { status: 500 },
      );
    }

    // Get the Cognito JWT token from the httpOnly cookie
    const cookieStore = cookies();
    const cognitoTokenCookie = cookieStore.get(COGNITO_TOKEN_COOKIE_NAME);

    if (!cognitoTokenCookie) {
      return NextResponse.json(
        { error: 'Unauthorized: No valid Cognito token found' },
        { status: 401 },
      );
    }

    const cognitoToken = cognitoTokenCookie.value;
    const authHeaderValue = `Bearer ${cognitoToken}`;

    // Get timestamp from query parameters
    const { searchParams } = new URL(request.url);
    const timestamp = searchParams.get('timestamp');

    // Build API Gateway URL with parameters
    const apiGatewayParams = new URLSearchParams();
    apiGatewayParams.append('userId', userInfo.id);
    if (timestamp) {
      apiGatewayParams.append('timestamp', timestamp);
    }

    const apiGatewayUrl = `${
      process.env.API_GATEWAY_URL
    }fetch-script?${apiGatewayParams.toString()}`;

    const lambdaResponse = await fetch(apiGatewayUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeaderValue,
      },
    });

    if (!lambdaResponse.ok) {
      return NextResponse.json(
        {
          error: `API Gateway error: ${lambdaResponse.status} ${lambdaResponse.statusText}`,
        },
        { status: lambdaResponse.status },
      );
    }

    const responsePayload = await lambdaResponse.json();

    if (responsePayload.error) {
      return NextResponse.json(
        { error: responsePayload.error },
        { status: 500 },
      );
    }

    return NextResponse.json(responsePayload);
  } catch (error) {
    console.error('Error in script fetch:', error);

    return NextResponse.json(
      {
        error: 'Failed to fetch script',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
