import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '../../../lib/session-utils';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

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

    const {
      timestamp,
      sceneId,
      generatedImageUrl,
      duration,
      inMemoryEditScene,
    } = body;

    console.log('🔍 Extracted values:', {
      timestamp,
      sceneId,
      generatedImageUrl,
      duration,
      inMemoryEditScene,
    });

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

    if (!duration) {
      return NextResponse.json({ error: 'Missing duration' }, { status: 400 });
    }

    // Enqueue to SQS so the shared consumer handles save-image
    const queueUrl = process.env.VIDEO_QUEUE_URL;
    if (!queueUrl) {
      console.error('❌ VIDEO_QUEUE_URL environment variable not set');
      return NextResponse.json(
        { error: 'SQS queue URL not configured' },
        { status: 500 },
      );
    }

    const sqs = new SQSClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });

    const messageBody = {
      type: 'save-image' as const,
      userId,
      timestamp,
      sceneId,
      generatedImageUrl,
      duration,
      inMemoryEditScene,
    };

    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(messageBody),
      MessageAttributes: {
        RequestType: { DataType: 'String', StringValue: 'SaveImage' },
        UserId: { DataType: 'String', StringValue: userId },
      },
    });

    const sqsResponse = await sqs.send(command);
    console.log('✅ Enqueued save-image message:', sqsResponse.MessageId);

    return NextResponse.json({
      status: 'queued',
      messageId: sqsResponse.MessageId,
    });
  } catch (error) {
    console.error('❌ Error in save-image API route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
