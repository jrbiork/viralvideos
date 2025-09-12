import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '../../../lib/session-utils';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

export async function POST(request: NextRequest) {
  console.log('🚀 generate-audio-subtitle API route called');

  try {
    // Verify session and get user info
    const session = await verifySession();
    if (!session) {
      console.log('❌ No valid session found, returning 401');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.sub;
    if (!userId) {
      return NextResponse.json({ error: 'User ID not found' }, { status: 400 });
    }

    const { scene, instructions, timestamp, voice, broadcastProgress } =
      await request.json();

    if (!scene) {
      return NextResponse.json(
        { error: 'Scene object is required' },
        { status: 400 },
      );
    }

    // Validate scene has required fields
    if (!scene.narration || !scene.duration) {
      return NextResponse.json(
        {
          error: 'Scene is missing required fields: narration and duration',
        },
        { status: 400 },
      );
    }

    if (!timestamp) {
      return NextResponse.json(
        { error: 'timestamp is required' },
        { status: 400 },
      );
    }

    // Enqueue to SQS so the shared consumer handles regenerate-scene
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
      type: 'regenerate-scene' as const,
      userId,
      timestamp,
      scene,
      voiceToneInstruction: instructions,
      voice: voice || 'alloy',
      broadcastProgress: broadcastProgress || false,
    };

    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(messageBody),
      MessageAttributes: {
        RequestType: { DataType: 'String', StringValue: 'RegenerateScene' },
        UserId: { DataType: 'String', StringValue: userId },
      },
    });

    const sqsResponse = await sqs.send(command);
    console.log('✅ Enqueued regenerate-scene message:', sqsResponse.MessageId);

    return NextResponse.json({
      status: 'queued',
      messageId: sqsResponse.MessageId,
    });
  } catch (error) {
    console.error('💥 Error in generate-audio-subtitle API route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
