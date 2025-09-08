import { SQSEvent, SQSBatchResponse } from 'aws-lambda';

import { SQSClient } from '@aws-sdk/client-sqs';

import { processSaveImage } from './processSaveImage';
import { processAnimateImage } from './processAnimateImage';
import {
  processVideoGeneration,
  VideoGenerationRequest,
} from './processVideoGeneration';
import { processVideoCombine } from './processVideoCombine';
import { processCreateScene } from './processCreateScene';

const sqs = new SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  return await handleSQSEvent(event);
};

async function handleSQSEvent(event: SQSEvent): Promise<SQSBatchResponse> {
  const batchItemFailures: { itemIdentifier: string }[] = [];

  for (const record of event.Records) {
    try {
      // Parse the message body
      const request: VideoGenerationRequest = JSON.parse(record.body);

      console.log('🔍 Raw SQS record body:', record.body);
      console.log('🔍 Parsed request object:', request);
      console.log('🔍 Request voice field:', request.voice);

      // Dispatch based on request type; default to generate video
      if (request.type === 'save-image') {
        await processSaveImage(request as any, record);
      } else if (request.type === 'animate-image') {
        await processAnimateImage(request as any, record);
      } else if (request.type === 'combine-video') {
        await processVideoCombine(request as any, record);
      } else if (request.type === 'create-scene') {
        await processCreateScene(request as any, record);
      } else {
        await processVideoGeneration(request, record);
      }
    } catch (error) {
      console.error('❌ Error processing record:', record.messageId, error);
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return {
    batchItemFailures,
  };
}

// Re-export the broadcastProgress function for backward compatibility
export { broadcastProgress } from './broadcastProgress';
