import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '../../../lib/session-utils';
import { cookies } from 'next/headers';

const COGNITO_TOKEN_COOKIE_NAME = 'viral-videos-cognito-token';

export async function POST(request: NextRequest) {
  console.log('🚀 generate-image API route called');

  try {
    // Verify session
    console.log('🔍 Verifying session...');
    const session = await verifySession();

    if (!session) {
      console.log('❌ No valid session found, returning 401');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the Cognito JWT token from the httpOnly cookie
    const cookieStore = cookies();
    const cognitoTokenCookie = cookieStore.get(COGNITO_TOKEN_COOKIE_NAME);

    if (!cognitoTokenCookie) {
      console.log('❌ No Cognito JWT token found in cookie');
      return NextResponse.json(
        { error: 'Unauthorized: No valid Cognito token found' },
        { status: 401 },
      );
    }

    const cognitoToken = cognitoTokenCookie.value;

    const { imagePrompt, timestamp } = await request.json();

    if (!imagePrompt) {
      return NextResponse.json(
        { error: 'imagePrompt is required' },
        { status: 400 },
      );
    }

    if (!timestamp) {
      return NextResponse.json(
        { error: 'timestamp is required' },
        { status: 400 },
      );
    }

    if (!process.env.API_GATEWAY_URL) {
      return NextResponse.json(
        { error: 'API Gateway URL not configured' },
        { status: 500 },
      );
    }

    // Call the API Gateway endpoint with timestamp as query string
    const apiGatewayUrl = `${
      process.env.API_GATEWAY_URL
    }generate-image?timestamp=${encodeURIComponent(timestamp)}`;

    const authHeaderValue = `Bearer ${cognitoToken}`;

    const lambdaResponse = await fetch(apiGatewayUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeaderValue,
      },
      body: JSON.stringify({ imagePrompt }),
    });

    console.log('📡 API Gateway response:', {
      status: lambdaResponse.status,
      statusText: lambdaResponse.statusText,
      ok: lambdaResponse.ok,
    });

    if (!lambdaResponse.ok) {
      const errorText = await lambdaResponse.text();
      console.error('❌ API Gateway error response:', errorText);
      return NextResponse.json(
        {
          error: `API Gateway error: ${lambdaResponse.status} ${lambdaResponse.statusText}`,
          details: errorText,
        },
        { status: lambdaResponse.status },
      );
    }

    // Parse the response JSON
    const responsePayload = await lambdaResponse.json();
    console.log('✅ API Gateway success response:', responsePayload);

    if (responsePayload.error) {
      return NextResponse.json(
        { error: responsePayload.error },
        { status: 500 },
      );
    }

    return NextResponse.json({
      data: responsePayload,
      message: 'Image generated successfully',
    });
  } catch (error) {
    console.error('💥 Error in image generation:', error);
    console.error(
      'Error stack:',
      error instanceof Error ? error.stack : 'No stack trace',
    );
    console.error(
      'Error message:',
      error instanceof Error ? error.message : 'Unknown error',
    );

    return NextResponse.json(
      {
        error: 'Failed to generate image',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
