import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '../../../lib/session-utils';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

export async function POST(request: NextRequest) {
  try {
    console.log('🎬 Create Scene API route called');

    // Verify session and get user info
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.sub;
    if (!userId) {
      return NextResponse.json({ error: 'User ID not found' }, { status: 400 });
    }

    // Get parameters from request body
    const body = await request.json();

    const { imageUrl, sceneId, timestamp, captionText, scenePosition } = body;

    console.log('🔍 Extracted values:', {
      imageUrl,
      sceneId,
      timestamp,
      captionText,
      scenePosition,
    });

    if (!imageUrl) {
      return NextResponse.json({ error: 'Missing imageUrl' }, { status: 400 });
    }

    if (sceneId === undefined || sceneId === null) {
      return NextResponse.json({ error: 'Missing sceneId' }, { status: 400 });
    }

    if (!timestamp) {
      return NextResponse.json({ error: 'Missing timestamp' }, { status: 400 });
    }

    if (!captionText) {
      return NextResponse.json(
        { error: 'Missing captionText' },
        { status: 400 },
      );
    }

    if (scenePosition === undefined || scenePosition === null) {
      return NextResponse.json(
        { error: 'Missing scenePosition' },
        { status: 400 },
      );
    }

    // Enqueue to SQS so the shared consumer handles create-scene
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
      type: 'create-scene' as const,
      userId,
      timestamp,
      sceneId,
      scenePosition,
      imageUrl,
      captionText,
    };

    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(messageBody),
      MessageAttributes: {
        RequestType: { DataType: 'String', StringValue: 'CreateScene' },
        UserId: { DataType: 'String', StringValue: userId },
      },
    });

    const sqsResponse = await sqs.send(command);
    console.log('✅ Enqueued create-scene message:', sqsResponse.MessageId);

    return NextResponse.json({
      status: 'queued',
      messageId: sqsResponse.MessageId,
    });
  } catch (error) {
    console.error('❌ Error in create-scene API route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
