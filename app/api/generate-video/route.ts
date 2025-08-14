import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  console.log('🚀 Starting video generation request...');

  try {
    // Extract authentication info from headers
    const authHeader = request.headers.get('authorization');

    if (!authHeader) {
      console.log('❌ Missing authorization header');
      return NextResponse.json(
        { error: 'Missing authorization header' },
        { status: 401 },
      );
    }

    // Create user info object (will be validated by API Gateway authorizer)
    const userInfo = {
      id: 'temp-user-id', // Will be replaced by API Gateway authorizer
      email: 'temp@example.com', // Will be replaced by API Gateway authorizer
    };

    console.log('📝 Parsing request body...');
    const { prompt, totalDuration = 30, sceneCount = 1 } = await request.json();
    console.log('✅ Request parsed:', { prompt, totalDuration, sceneCount });

    if (!prompt) {
      console.log('❌ Error: Prompt is required');
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 },
      );
    }

    // Validate totalDuration
    const videoTotalDuration = Math.max(10, Math.min(60, totalDuration));
    console.log('⏱️  Video duration set to:', videoTotalDuration);

    // Validate scene count
    const numScenes = Math.max(1, Math.min(6, sceneCount));
    console.log('🎬 Number of scenes set to:', numScenes);

    // Check environment variables
    console.log('🔍 Checking environment variables...');
    console.log('API_GATEWAY_URL:', process.env.API_GATEWAY_URL);

    if (!process.env.API_GATEWAY_URL) {
      console.log('❌ Error: API_GATEWAY_URL is not set');
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
      timestamp: new Date().toISOString(),
    };
    console.log('📦 Lambda payload prepared:', lambdaPayload);

    // Call the API Gateway endpoint
    console.log('🔧 Calling API Gateway endpoint...');
    const apiGatewayUrl = `${process.env.API_GATEWAY_URL}generate-video`;
    console.log('📡 Sending request to:', apiGatewayUrl);

    const lambdaResponse = await fetch(apiGatewayUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify(lambdaPayload),
    });

    console.log('📡 API Gateway response status:', lambdaResponse.status);

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
    console.log('✅ API Gateway response received:', responsePayload);

    if (responsePayload.error) {
      console.log('❌ Lambda returned error:', responsePayload.error);
      return NextResponse.json(
        { error: responsePayload.error },
        { status: 500 },
      );
    }

    console.log('🎉 Video generation request queued successfully');
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
