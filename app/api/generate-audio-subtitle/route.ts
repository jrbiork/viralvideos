import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '../../../lib/session-utils';
import { cookies } from 'next/headers';

const COGNITO_TOKEN_COOKIE_NAME = 'viral-videos-cognito-token';

export async function POST(request: NextRequest) {
  console.log('🚀 generate-audio-subtitle API route called');

  try {
    // Verify session
    console.log('🔍 Verifying session...');
    const session = await verifySession();
    console.log('📋 Session verification result:', {
      hasSession: !!session,
      userId: session?.sub,
      email: session?.email,
    });

    if (!session) {
      console.log('❌ No valid session found, returning 401');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Use session user info
    const userInfo = {
      id: session.sub,
      email: session.email,
    };

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
    console.log(
      '🔍 Found Cognito token in cookie, length:',
      cognitoToken.length,
    );

    const { scene, instructions, timestamp, voice, broadcastProgress } =
      await request.json();

    if (!scene) {
      return NextResponse.json(
        { error: 'Scene object is required' },
        { status: 400 },
      );
    }

    // Validate scene has required fields
    if (!scene.narration || !scene.duration) {
      return NextResponse.json(
        {
          error: 'Scene is missing required fields: narration and duration',
        },
        { status: 400 },
      );
    }

    if (!timestamp) {
      return NextResponse.json(
        { error: 'timestamp is required' },
        { status: 400 },
      );
    }

    console.log('🔧 Environment check (generate-audio-subtitle):', {
      hasApiGatewayUrl: !!process.env.API_GATEWAY_URL,
      apiGatewayUrl: process.env.API_GATEWAY_URL,
    });

    if (!process.env.API_GATEWAY_URL) {
      return NextResponse.json(
        { error: 'API Gateway URL not configured' },
        { status: 500 },
      );
    }

    // Prepare Lambda payload with userId and selected scene
    const lambdaPayload = {
      scene,
      voiceToneInstruction: instructions,
      voice: voice || 'alloy',
      broadcastProgress: broadcastProgress || false,
    };

    // Call the API Gateway endpoint with timestamp as query string
    const apiGatewayUrl = `${
      process.env.API_GATEWAY_URL
    }generate-audio-subtitle?timestamp=${encodeURIComponent(timestamp)}`;

    const authHeaderValue = `Bearer ${cognitoToken}`;

    const lambdaResponse = await fetch(apiGatewayUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeaderValue,
      },
      body: JSON.stringify(lambdaPayload),
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
      message: 'Audio and subtitles generated successfully',
    });
  } catch (error) {
    console.error('💥 Error in audio-subtitle generation:', error);
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
        error: 'Failed to generate audio and subtitles',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
