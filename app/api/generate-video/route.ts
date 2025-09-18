import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '../../../lib/session-utils';
import { cookies } from 'next/headers';

const COGNITO_TOKEN_COOKIE_NAME = 'viral-videos-cognito-token';

export async function POST(request: NextRequest) {
  console.log('🚀 generate-video API route called');

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

    const {
      prompt,
      totalDuration,
      sceneCount,
      timestamp,
      voice,
      imageTemplate,
    } = await request.json();

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 },
      );
    }

    // Validate totalDuration
    const videoTotalDuration = Math.max(10, Math.min(60, totalDuration));
    console.log('videoTotalDuration:', videoTotalDuration);

    // Validate scene count
    const numScenes = Math.max(1, Math.min(6, sceneCount));
    console.log('numScenes:', numScenes);

    const script = (prompt ?? '').toString();
    const duration = videoTotalDuration;
    const aspect_ratio = '9:16';

    // Validate and use selected voice, default to 'alloy' if not provided
    const supportedVoices = [
      'alloy',
      'ash',
      'ballad',
      'coral',
      'fable',
      'nova',
      'onyx',
      'sage',
      'shimmer',
      'verse',
    ];
    const selectedVoice =
      voice && supportedVoices.includes(voice) ? voice : 'alloy';

    const captions = true;

    console.log('🔧 Environment check (generate-video):', {
      hasApiGatewayUrl: !!process.env.API_GATEWAY_URL,
      apiGatewayUrl: process.env.API_GATEWAY_URL,
    });

    if (!process.env.API_GATEWAY_URL) {
      return NextResponse.json(
        { error: 'API Gateway URL not configured' },
        { status: 500 },
      );
    }

    // Prepare Lambda payload
    const lambdaPayload = {
      // Required fields for VideoGenerationRequest
      type: 'generate-video',
      step: 1,
      imageTemplate,
      voice: selectedVoice,
      // prefer the backend-friendly schema
      script,
      duration,
      aspect_ratio,
      captions,
      // keep your originals in case backend accepts them too
      prompt,
      totalDuration: videoTotalDuration,
      sceneCount: numScenes,
      userId: userInfo.id, // Get from authenticated user
      userEmail: userInfo.email, // Get from authenticated user
      timestamp,
    };

    // Call the API Gateway endpoint
    const apiGatewayUrl = `${process.env.API_GATEWAY_URL}generate-video`;
    console.log('🔗 Calling API Gateway (generate-video):', apiGatewayUrl);
    console.log('🔗 Full URL breakdown (generate-video):', {
      baseUrl: process.env.API_GATEWAY_URL,
      endpoint: 'generate-video',
      fullUrl: apiGatewayUrl,
    });
    console.log(
      '🔑 Using Cognito token length (generate-video):',
      cognitoToken.length,
    );

    const authHeaderValue = `Bearer ${cognitoToken}`;

    console.log('🚀 Sending lambdaPayload with voice:', {
      voice: lambdaPayload.voice,
      type: lambdaPayload.type,
      step: lambdaPayload.step,
      fullPayload: lambdaPayload,
    });

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
      messageId: responsePayload.messageId,
      status: responsePayload.status,
      message: responsePayload.message,
    });
  } catch (error) {
    console.error('💥 Error in video generation:', error);
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
        error: 'Failed to queue video generation request',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
