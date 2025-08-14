import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '../../../lib/session-utils';

export async function POST(request: NextRequest) {
  console.log('🚀 generate-video API route called');

  try {
    // Verify session
    console.log('🔍 Verifying session...');
    const session = await verifySession();
    console.log('📋 Session verification result:', {
      hasSession: !!session,
      userId: session?.userId,
      email: session?.email,
      hasCognitoToken: !!session?.cognitoToken,
      cognitoTokenLength: session?.cognitoToken?.length,
    });

    if (!session) {
      console.log('❌ No valid session found, returning 401');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Use session user info
    const userInfo = {
      id: session.userId,
      email: session.email,
    };

    // Get the Cognito JWT token from the session or request headers
    let cognitoToken = session.cognitoToken;

    // If not in session, try to get from request headers
    if (!cognitoToken) {
      const authHeader = request.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        cognitoToken = authHeader.replace('Bearer ', '');
        console.log(
          '🔍 Found Cognito token in request headers, length:',
          cognitoToken.length,
        );
      }
    }

    if (!cognitoToken) {
      console.log('❌ No Cognito JWT token found in session or headers');
      return NextResponse.json(
        { error: 'Unauthorized: No valid Cognito token found' },
        { status: 401 },
      );
    }

    const { prompt, totalDuration = 30, sceneCount = 1 } = await request.json();

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 },
      );
    }

    // Validate totalDuration
    const videoTotalDuration = Math.max(10, Math.min(60, totalDuration));

    // Validate scene count
    const numScenes = Math.max(1, Math.min(6, sceneCount));

    if (!process.env.API_GATEWAY_URL) {
      return NextResponse.json(
        { error: 'API Gateway URL not configured' },
        { status: 500 },
      );
    }

    // Prepare Lambda payload
    const lambdaPayload = {
      prompt,
      totalDuration: videoTotalDuration,
      sceneCount: numScenes,
      userId: userInfo.id, // Get from authenticated user
      userEmail: userInfo.email, // Get from authenticated user
      timestamp: new Date().toISOString(),
    };

    // Call the API Gateway endpoint
    const apiGatewayUrl = `${process.env.API_GATEWAY_URL}generate-video`;
    console.log('🔗 Calling API Gateway:', apiGatewayUrl);
    console.log('🔑 Using Cognito token length:', cognitoToken.length);

    const lambdaResponse = await fetch(apiGatewayUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cognitoToken}`,
      },
      body: JSON.stringify(lambdaPayload),
    });

    console.log('📡 API Gateway response:', {
      status: lambdaResponse.status,
      statusText: lambdaResponse.statusText,
      ok: lambdaResponse.ok,
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
