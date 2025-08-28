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

    // Get timestamp from query parameters
    const { searchParams } = new URL(request.url);
    const timestamp = searchParams.get('timestamp');

    if (!timestamp) {
      return NextResponse.json(
        { error: 'Timestamp is required' },
        { status: 400 },
      );
    }

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

    // Call the API Gateway endpoint
    const apiGatewayUrl = `${
      process.env.API_GATEWAY_URL
    }fetch-preview?timestamp=${encodeURIComponent(timestamp)}`;

    const apiResponse = await fetch(apiGatewayUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeaderValue,
      },
    });

    if (!apiResponse.ok) {
      const errorData = await apiResponse.json().catch(() => ({}));
      return NextResponse.json(
        { error: errorData.error || 'API Gateway error' },
        { status: apiResponse.status },
      );
    }

    // Return the successful response
    const responseData = await apiResponse.json();
    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Error in fetch-preview API:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
