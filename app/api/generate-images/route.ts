import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '../../../lib/session-utils';
import { cookies } from 'next/headers';

const COGNITO_TOKEN_COOKIE_NAME = 'viral-videos-cognito-token';

export async function POST(request: NextRequest) {
  console.log('🚀 generate-images API route called');

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

    const { scenes, seed } = await request.json();

    if (!scenes || !Array.isArray(scenes) || scenes.length === 0) {
      return NextResponse.json(
        { error: 'Scenes array is required and must not be empty' },
        { status: 400 },
      );
    }

    // Validate each scene has required fields
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      if (!scene.description) {
        return NextResponse.json(
          {
            error: `Scene ${i} is missing required field: description`,
          },
          { status: 400 },
        );
      }
    }

    console.log('🔧 Environment check (generate-images):', {
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
      scenes,
      seed: seed || Math.floor(Math.random() * 1000000),
    };

    // Call the API Gateway endpoint
    const apiGatewayUrl = `${process.env.API_GATEWAY_URL}generate-images`;
    console.log('🔗 Calling API Gateway (generate-images):', apiGatewayUrl);
    console.log('🔗 Full URL breakdown (generate-images):', {
      baseUrl: process.env.API_GATEWAY_URL,
      endpoint: 'generate-images',
      fullUrl: apiGatewayUrl,
    });
    console.log(
      '🔑 Using Cognito token length (generate-images):',
      cognitoToken.length,
    );

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
      imageUrls: responsePayload.imageUrls,
      message: responsePayload.message,
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
        error: 'Failed to generate images',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
