import { NextRequest, NextResponse } from 'next/server';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const lambda = new LambdaClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

export async function POST(request: NextRequest) {
  console.log('🚀 Starting video generation request...');

  try {
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
    console.log('AWS_REGION:', process.env.AWS_REGION);
    console.log(
      'QUEUE_MANAGER_LAMBDA_ARN:',
      process.env.QUEUE_MANAGER_LAMBDA_ARN,
    );

    if (!process.env.QUEUE_MANAGER_LAMBDA_ARN) {
      console.log('❌ Error: QUEUE_MANAGER_LAMBDA_ARN is not set');
      return NextResponse.json(
        { error: 'Queue Manager Lambda ARN not configured' },
        { status: 500 },
      );
    }

    // Prepare Lambda payload
    const lambdaPayload = {
      prompt,
      totalDuration: videoTotalDuration,
      sceneCount: numScenes,
      userId: 'demo-user4', // In production, get from auth
      timestamp: new Date().toISOString(),
    };
    console.log('📦 Lambda payload prepared:', lambdaPayload);

    // Invoke the Queue Manager Lambda function
    console.log('🔧 Invoking Queue Manager Lambda function...');
    const invokeCommand = new InvokeCommand({
      FunctionName: process.env.QUEUE_MANAGER_LAMBDA_ARN,
      Payload: JSON.stringify(lambdaPayload),
    });

    console.log('📡 Sending Lambda request...');
    const lambdaResponse = await lambda.send(invokeCommand);
    console.log('✅ Lambda response received:', {
      statusCode: lambdaResponse.StatusCode,
      functionError: lambdaResponse.FunctionError,
      logResult: lambdaResponse.LogResult,
    });

    if (lambdaResponse.FunctionError) {
      console.log('❌ Lambda function error:', lambdaResponse.FunctionError);
      return NextResponse.json(
        { error: `Lambda function error: ${lambdaResponse.FunctionError}` },
        { status: 500 },
      );
    }

    console.log('📄 Parsing Lambda response payload...');
    const responsePayload = JSON.parse(
      new TextDecoder().decode(lambdaResponse.Payload),
    );
    console.log('✅ Lambda response payload:', responsePayload);

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
