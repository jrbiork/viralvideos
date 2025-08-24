import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '../../../lib/session-utils';
import { cookies } from 'next/headers';

const COGNITO_TOKEN_COOKIE_NAME = 'viral-videos-cognito-token';

export async function DELETE(request: NextRequest) {
  try {
    // Verify session
    const session = await verifySession();

    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized: No valid session found' },
        { status: 401 },
      );
    }

    // Get the timestamp from query parameters
    const { searchParams } = new URL(request.url);
    const timestamp = searchParams.get('timestamp');

    if (!timestamp) {
      return NextResponse.json(
        { error: 'timestamp parameter is required' },
        { status: 400 },
      );
    }

    // Get the API Gateway URL from environment
    const apiGatewayUrl = process.env.API_GATEWAY_URL;
    if (!apiGatewayUrl) {
      console.error('API_GATEWAY_URL environment variable is not set');
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

    // Call the AWS Lambda function via API Gateway
    const response = await fetch(
      `${apiGatewayUrl}delete-video?timestamp=${encodeURIComponent(timestamp)}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: authHeaderValue,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.ok) {
      return NextResponse.json(
        {
          error: `API Gateway error: ${response.status} ${response.statusText}`,
        },
        { status: response.status },
      );
    }

    const responsePayload = await response.json();

    if (responsePayload.error) {
      return NextResponse.json(
        { error: responsePayload.error },
        { status: 500 },
      );
    }

    return NextResponse.json(responsePayload);
  } catch (error) {
    console.error('Error in delete-video API route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
