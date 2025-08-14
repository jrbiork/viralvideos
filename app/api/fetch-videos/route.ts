import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '../../../lib/session-utils';
import { cookies } from 'next/headers';

const COGNITO_TOKEN_COOKIE_NAME = 'viral-videos-cognito-token';

export async function GET(request: NextRequest) {
  console.log('🚀 Starting video fetch request...');

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
      console.log('❌ Unauthorized: No valid session found');
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

    console.log('Session data for fetch-videos:', {
      userId: session.sub,
      email: session.email,
      hasCognitoToken: !!cognitoToken,
      cognitoTokenLength: cognitoToken?.length,
    });

    const authHeaderValue = `Bearer ${cognitoToken}`;

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
        Authorization: authHeaderValue,
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
