import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '../../../lib/session-utils';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    console.log('💾 Save Image API route called');

    // Verify session and get user info
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.sub;
    if (!userId) {
      return NextResponse.json({ error: 'User ID not found' }, { status: 400 });
    }

    // Get timestamp from request body
    const body = await request.json();
    console.log('📥 Received request body:', body);
    console.log('🔍 Body type:', typeof body);
    console.log('🔍 Body keys:', Object.keys(body));

    const { timestamp, sceneId, generatedImageUrl } = body;

    console.log('🔍 Extracted values:', {
      timestamp,
      sceneId,
      generatedImageUrl,
    });
    console.log('🔍 SceneId type:', typeof sceneId, 'Value:', sceneId);

    if (!timestamp) {
      return NextResponse.json({ error: 'Missing timestamp' }, { status: 400 });
    }

    if (sceneId === undefined || sceneId === null) {
      return NextResponse.json({ error: 'Missing sceneId' }, { status: 400 });
    }

    if (!generatedImageUrl) {
      return NextResponse.json(
        { error: 'Missing generatedImageUrl' },
        { status: 400 },
      );
    }

    // Get Cognito JWT token from cookies for authorization
    const cookieStore = cookies();
    const authToken = cookieStore.get('viral-videos-cognito-token')?.value;

    if (!authToken) {
      return NextResponse.json(
        { error: 'No authorization token found' },
        { status: 401 },
      );
    }

    // Construct the API Gateway URL
    const apiGatewayUrl = process.env.API_GATEWAY_URL;
    if (!apiGatewayUrl) {
      console.error('❌ API_GATEWAY_URL environment variable not set');
      return NextResponse.json(
        { error: 'API Gateway URL not configured' },
        { status: 500 },
      );
    }

    // Prepare the payload for the lambda
    const lambdaPayload = {
      timestamp,
      sceneId,
      generatedImageUrl,
    };

    console.log(`🚀 Calling save-image lambda with payload:`, lambdaPayload);

    // Make request to API Gateway
    const response = await fetch(
      `${apiGatewayUrl}/save-image?timestamp=${encodeURIComponent(timestamp)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(lambdaPayload),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Lambda response error:', response.status, errorText);
      return NextResponse.json(
        { error: `Lambda error: ${response.status}` },
        { status: response.status },
      );
    }

    const result = await response.json();
    console.log('✅ Save image lambda response:', result);

    return NextResponse.json(result);
  } catch (error) {
    console.error('❌ Error in save-image API route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
