import { SQSEvent, SQSBatchResponse } from 'aws-lambda';

import { DeleteMessageCommand, SQSClient } from '@aws-sdk/client-sqs';

import {
  processVideoGeneration,
  VideoGenerationRequest,
} from './processVideoGeneration';
import { processVideoCombine } from './processVideoCombine';
import { processBatchEdit } from './processBatchEdit';
import { processAnimateScene } from './processAnimateScene';
import { broadcastProgress } from '../utils/broadcastProgress';

const sqs = new SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  return await handleSQSEvent(event);
};

async function handleSQSEvent(event: SQSEvent): Promise<SQSBatchResponse> {
  const batchItemFailures: { itemIdentifier: string }[] = [];

  for (const record of event.Records) {
    const request: VideoGenerationRequest = JSON.parse(record.body);
    try {
      console.log('🔍 Raw SQS record body:', record.body);
      console.log('🔍 Parsed request object:', request);
      console.log('🔍 Request voice field:', request.voice);

      // Dispatch based on request type; default to generate video
      if (request.type === 'combine-video') {
        await processVideoCombine(request as any, record);
      } else if (request.type === 'batch-edit') {
        await processBatchEdit(request as any, record);
      } else if (request.type === 'animate-scene') {
        await processAnimateScene(request as any, record);
      } else {
        await processVideoGeneration(request, record);
      }
    } catch (error) {
      console.error('❌ Error processing record:', record.messageId, error);
      // broadcast error
      await broadcastProgress(
        'error',
        request.userId,
        request.timestamp,
        { error: error instanceof Error ? error.message : 'Unknown error' },
        error instanceof Error ? error.message : 'Unknown error',
      );

      // remove message from queue
      if (record && process.env.VIDEO_QUEUE_URL) {
        const deleteCommand = new DeleteMessageCommand({
          QueueUrl: process.env.VIDEO_QUEUE_URL,
          ReceiptHandle: record.receiptHandle,
        });
        await sqs.send(deleteCommand);
      }

      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return {
    batchItemFailures,
  };
}
