import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '../../../lib/session-utils';

export async function GET(request: NextRequest) {
  console.log('🚀 Starting video fetch request...');

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
      console.log('❌ Unauthorized: No valid session found');
      return NextResponse.json(
        { error: 'Unauthorized: No valid session found' },
        { status: 401 },
      );
    }

    // Use session user info
    const userInfo = {
      id: session.userId,
      email: session.email,
    };

    console.log('✅ Authenticated user:', userInfo.id);

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || userInfo.id;

    console.log('👤 User info:', {
      userId: userId,
      userInfoId: userInfo.id,
      searchParamsUserId: searchParams.get('userId'),
    });

    console.log('🔧 Environment check:', {
      hasApiGatewayUrl: !!process.env.API_GATEWAY_URL,
      apiGatewayUrl: process.env.API_GATEWAY_URL,
    });

    if (!process.env.API_GATEWAY_URL) {
      console.log('❌ Error: API_GATEWAY_URL is not set');
      return NextResponse.json(
        { error: 'API Gateway URL not configured' },
        { status: 500 },
      );
    }

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

    console.log('Session data for fetch-videos:', {
      userId: session.userId,
      email: session.email,
      hasCognitoToken: !!cognitoToken,
      cognitoTokenLength: cognitoToken?.length,
    });

    if (!cognitoToken) {
      console.log('❌ No Cognito JWT token found in session or headers');
      return NextResponse.json(
        { error: 'Unauthorized: No valid Cognito token found' },
        { status: 401 },
      );
    }

    const authHeader = `Bearer ${cognitoToken}`;

    // Call the API Gateway endpoint
    const apiGatewayUrl = `${
      process.env.API_GATEWAY_URL
    }fetch-videos?userId=${encodeURIComponent(userId)}`;

    console.log('🔗 Calling API Gateway:', apiGatewayUrl);
    console.log('🔗 Full URL breakdown:', {
      baseUrl: process.env.API_GATEWAY_URL,
      endpoint: 'fetch-videos',
      userId: userId,
      encodedUserId: encodeURIComponent(userId),
      fullUrl: apiGatewayUrl,
    });
    console.log('🔑 Using Cognito token length:', cognitoToken.length);

    const lambdaResponse = await fetch(apiGatewayUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
    });

    console.log('📡 API Gateway response:', {
      status: lambdaResponse.status,
      statusText: lambdaResponse.statusText,
      ok: lambdaResponse.ok,
    });

    if (!lambdaResponse.ok) {
      console.log(
        '❌ API Gateway error:',
        lambdaResponse.status,
        lambdaResponse.statusText,
      );
      return NextResponse.json(
        {
          error: `API Gateway error: ${lambdaResponse.status} ${lambdaResponse.statusText}`,
        },
        { status: lambdaResponse.status },
      );
    }

    const responsePayload = await lambdaResponse.json();

    if (responsePayload.error) {
      console.log('❌ Lambda error:', responsePayload.error);
      return NextResponse.json(
        { error: responsePayload.error },
        { status: 500 },
      );
    }

    console.log('✅ Successfully fetched videos from API Gateway');
    return NextResponse.json(responsePayload);
  } catch (error) {
    console.error('💥 Error in video fetch:', error);
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
        error: 'Failed to fetch videos',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
