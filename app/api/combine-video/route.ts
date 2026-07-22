import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '../../../lib/session-utils';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

// Marks the manifest as "combining" the moment the request is enqueued
// (rather than waiting for the Lambda consumer to pick it up), so the
// Videos list can block editing this video right away — see
// components/VideoGallery.tsx. Best-effort: a failure here shouldn't block
// video generation, since the SQS message is already queued.
async function markManifestCombining(userId: string, timestamp: string) {
  const bucket = process.env.VIDEO_PARTS_BUCKET_NAME;
  if (!bucket) return;

  const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
  const key = `${userId}/${timestamp}.manifest.json`;

  const existing = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  const body = await existing.Body?.transformToString();
  if (!body) return;

  const manifest = JSON.parse(body);
  manifest.isCombining = true;
  manifest.updatedAt = Date.now().toString();

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(manifest, null, 2),
      ContentType: 'application/json',
    }),
  );
}

export async function POST(request: NextRequest) {
  try {
    console.log('🎬 Combine Video API route called');

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

    const { timestamp, removedScenes } = body;

    console.log('🔍 Extracted values:', {
      timestamp,
      removedScenes,
    });

    if (!timestamp) {
      return NextResponse.json({ error: 'Missing timestamp' }, { status: 400 });
    }

    // Enqueue to SQS so the shared consumer handles combine-video
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
      type: 'combine-video' as const,
      userId,
      timestamp,
      removedScenes: removedScenes || [],
    };

    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(messageBody),
      MessageAttributes: {
        RequestType: { DataType: 'String', StringValue: 'CombineVideo' },
        UserId: { DataType: 'String', StringValue: userId },
      },
    });

    const sqsResponse = await sqs.send(command);
    console.log('✅ Enqueued combine-video message:', sqsResponse.MessageId);

    try {
      await markManifestCombining(userId, timestamp);
    } catch (manifestError) {
      console.warn('⚠️ Failed to mark manifest as combining:', manifestError);
    }

    return NextResponse.json({
      status: 'queued',
      messageId: sqsResponse.MessageId,
    });
  } catch (error) {
    console.error('❌ Error in combine-video API route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
