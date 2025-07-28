import { NextRequest, NextResponse } from 'next/server';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const lambda = new LambdaClient({
  region: process.env.AWS_REGION || 'us-east-1',
});
const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

export async function POST(request: NextRequest) {
  console.log('🚀 Starting video generation request...');

  try {
    console.log('📝 Parsing request body...');
    const { prompt, duration = 30, sceneCount = 1 } = await request.json();
    console.log('✅ Request parsed:', { prompt, duration, sceneCount });

    if (!prompt) {
      console.log('❌ Error: Prompt is required');
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 },
      );
    }

    // Validate duration
    const videoDuration = Math.max(10, Math.min(60, duration));
    console.log('⏱️  Video duration set to:', videoDuration);

    // Validate scene count
    const numScenes = Math.max(1, Math.min(6, sceneCount));
    console.log('🎬 Number of scenes set to:', numScenes);

    // Check environment variables
    console.log('🔍 Checking environment variables...');
    console.log('AWS_REGION:', process.env.AWS_REGION);
    console.log(
      'VIDEO_GENERATION_LAMBDA_ARN:',
      process.env.VIDEO_GENERATION_LAMBDA_ARN,
    );
    console.log('VIDEO_BUCKET_NAME:', process.env.VIDEO_BUCKET_NAME);

    if (!process.env.VIDEO_GENERATION_LAMBDA_ARN) {
      console.log('❌ Error: VIDEO_GENERATION_LAMBDA_ARN is not set');
      return NextResponse.json(
        { error: 'Lambda ARN not configured' },
        { status: 500 },
      );
    }

    if (!process.env.VIDEO_BUCKET_NAME) {
      console.log('❌ Error: VIDEO_BUCKET_NAME is not set');
      return NextResponse.json(
        { error: 'S3 bucket name not configured' },
        { status: 500 },
      );
    }

    // Prepare Lambda payload
    const lambdaPayload = {
      prompt,
      duration: videoDuration,
      sceneCount: numScenes,
      userId: 'demo-user', // In production, get from auth
      timestamp: new Date().toISOString(),
    };
    console.log('📦 Lambda payload prepared:', lambdaPayload);

    // Invoke the Lambda function
    console.log('🔧 Invoking Lambda function...');
    const invokeCommand = new InvokeCommand({
      FunctionName: process.env.VIDEO_GENERATION_LAMBDA_ARN,
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

    // Generate a pre-signed URL for the video
    const videoKey = responsePayload.videoKey;
    console.log('🎬 Video key from Lambda:', videoKey);

    if (!videoKey) {
      console.log('❌ Error: No video key returned from Lambda');
      return NextResponse.json(
        { error: 'Video generation failed - no video key returned' },
        { status: 500 },
      );
    }

    console.log('🔗 Generating pre-signed URL for video...');
    const getObjectCommand = new GetObjectCommand({
      Bucket: process.env.VIDEO_BUCKET_NAME,
      Key: videoKey,
    });

    const videoUrl = await getSignedUrl(s3, getObjectCommand, {
      expiresIn: 3600,
    }); // 1 hour
    console.log('✅ Pre-signed URL generated:', videoUrl);

    console.log('🎉 Video generation completed successfully');
    return NextResponse.json({
      videoUrl,
      videoKey,
      message: 'Video generated successfully',
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
        error: 'Failed to generate video',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
