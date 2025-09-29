import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '../../../lib/session-utils';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

export async function POST(request: NextRequest) {
  try {
    console.log('🎞️ Animate Image API route called');

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

    const { animationPrompt, animationDuration, timestamp, sceneId, imageUrl } =
      body;

    console.log('🔍 Extracted values:', {
      animationPrompt,
      animationDuration,
      timestamp,
      sceneId,
      imageUrl,
    });

    if (!animationDuration) {
      return NextResponse.json(
        { error: 'Missing animationDuration' },
        { status: 400 },
      );
    }

    if (!timestamp) {
      return NextResponse.json({ error: 'Missing timestamp' }, { status: 400 });
    }

    if (sceneId === undefined || sceneId === null) {
      return NextResponse.json({ error: 'Missing sceneId' }, { status: 400 });
    }

    if (!imageUrl) {
      return NextResponse.json({ error: 'Missing imageUrl' }, { status: 400 });
    }

    // Normalize duration to 5 or 10 seconds
    let duration: 5 | 10;
    if (animationDuration === '5s' || animationDuration === 5) {
      duration = 5;
    } else if (animationDuration === '10s' || animationDuration === 10) {
      duration = 10;
    } else {
      return NextResponse.json(
        { error: 'animationDuration must be 5s or 10s' },
        { status: 400 },
      );
    }

    // Enqueue to SQS so the shared consumer handles animate-image
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
      type: 'animate-image' as const,
      userId,
      timestamp,
      sceneId,
      animationPrompt,
      imageUrl,
      duration,
    };

    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(messageBody),
      MessageAttributes: {
        RequestType: { DataType: 'String', StringValue: 'AnimateImage' },
        UserId: { DataType: 'String', StringValue: userId },
      },
    });

    const sqsResponse = await sqs.send(command);
    console.log('✅ Enqueued animate-image message:', sqsResponse.MessageId);

    return NextResponse.json({
      status: 'queued',
      messageId: sqsResponse.MessageId,
    });
  } catch (error) {
    console.error('❌ Error in animate-image API route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
