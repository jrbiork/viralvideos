import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '../../../lib/session-utils';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

export async function POST(request: NextRequest) {
  console.log('🚀 apply-edits API route called');

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

    const { timestamp, edits } = await request.json();

    if (!timestamp) {
      return NextResponse.json(
        { error: 'timestamp is required' },
        { status: 400 },
      );
    }

    const narrationEdits = edits?.narrationEdits || [];
    const imageEdits = edits?.imageEdits || [];
    const addedScenes = edits?.addedScenes || [];
    const removedSceneIds = edits?.removedSceneIds || [];
    const animationEdits = edits?.animationEdits || [];

    if (
      narrationEdits.length === 0 &&
      imageEdits.length === 0 &&
      addedScenes.length === 0 &&
      removedSceneIds.length === 0 &&
      animationEdits.length === 0
    ) {
      return NextResponse.json(
        { error: 'No edits to apply' },
        { status: 400 },
      );
    }

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
      type: 'batch-edit' as const,
      userId,
      timestamp,
      edits: {
        narrationEdits,
        imageEdits,
        addedScenes,
        removedSceneIds,
        animationEdits,
      },
    };

    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(messageBody),
      MessageAttributes: {
        RequestType: { DataType: 'String', StringValue: 'BatchEdit' },
        UserId: { DataType: 'String', StringValue: userId },
      },
    });

    const sqsResponse = await sqs.send(command);
    console.log('✅ Enqueued batch-edit message:', sqsResponse.MessageId);

    return NextResponse.json({
      status: 'queued',
      messageId: sqsResponse.MessageId,
    });
  } catch (error) {
    console.error('💥 Error in apply-edits API route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
