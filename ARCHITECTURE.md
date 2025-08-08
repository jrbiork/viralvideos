# Viral Videos - Decoupled Architecture

## Overview

The Viral Videos application has been refactored to use a decoupled, asynchronous architecture to handle long-running video generation tasks. This architecture separates the request handling from the actual video processing, allowing for better scalability and user experience.

## Architecture Components

### 1. Frontend (Next.js)

- **Location**: `app/`
- **Components**:
  - `VideoGenerator`: Handles user input and triggers video generation
  - `VideoPreview`: Displays generated videos
  - `VideoGallery`: Shows all user videos

### 2. API Layer (Next.js API Routes)

- **`/api/generate-video`**: Receives video generation requests and queues them
- **`/api/fetch-videos`**: Retrieves generated videos from S3

### 3. Queue Manager Lambda

- **Location**: `infrastructure/lambda/queue-manager/`
- **Purpose**: Receives video generation requests and puts them in SQS queue
- **Input**: Video generation parameters (prompt, duration, sceneCount, etc.)
- **Output**: Confirmation that request has been queued

### 4. SQS Queue

- **Name**: `video-generation-queue`
- **Purpose**: Stores pending video generation requests
- **Configuration**:
  - Visibility timeout: 15 minutes (matches lambda timeout)
  - Retention period: 4 days
  - Dead letter queue: `video-generation-dlq` (after 3 failed attempts)

### 5. Video Generation Lambda

- **Location**: `infrastructure/lambda/video-generation/`
- **Purpose**: Processes video generation requests from SQS
- **Trigger**: SQS event source
- **Process**:
  1. Receives message from SQS
  2. Generates story breakdown using GPT-4
  3. Creates narration audio with word-level timestamps
  4. Generates subtitles
  5. Combines video, audio, and subtitles
  6. Uploads final video to S3
  7. Deletes message from SQS queue on success

### 6. S3 Storage

- **Video Bucket**: `viral-videos-{account}-{region}`
- **Video Parts Bucket**: `video-parts-{account}-{region}`
- **Structure**: `{userId}/{timestamp}/final-video.mp4`

## Flow Diagram

```
User Input → Frontend → API Route → Queue Manager Lambda → SQS Queue
                                                              ↓
User Polling ← Frontend ← API Route ← S3 ← Video Generation Lambda
```

## Benefits of This Architecture

1. **Asynchronous Processing**: Users don't have to wait for 5+ minute video generation
2. **Scalability**: Multiple video generation requests can be processed in parallel
3. **Reliability**: Failed requests are retried via SQS dead letter queue
4. **User Experience**: Immediate feedback with status updates and progress indication
5. **Resource Management**: Better control over Lambda execution and costs

## Deployment

### Prerequisites

- AWS CLI configured
- Node.js 18+ installed
- CDK installed globally: `npm install -g aws-cdk`

### Steps

1. Navigate to infrastructure directory: `cd infrastructure`
2. Install dependencies: `npm install`
3. Deploy: `./deploy.sh`

### Environment Variables

Update your `.env.local` file with:

```
AWS_REGION=us-east-1
QUEUE_MANAGER_LAMBDA_ARN=arn:aws:lambda:us-east-1:YOUR_ACCOUNT:function:ViralVideosStack-QueueManagerLambda
VIDEO_BUCKET_NAME=viral-videos-YOUR_ACCOUNT-us-east-1
RUNWAY_API_KEY=your_runway_api_key
OPENAI_API_KEY=your_openai_api_key
```

## Monitoring

### CloudWatch Logs

- Queue Manager: `/aws/lambda/ViralVideosStack-QueueManagerLambda`
- Video Generation: `/aws/lambda/ViralVideosStack-VideoGenerationLambda`

### SQS Monitoring

- Queue depth: `aws sqs get-queue-attributes --queue-url <queue-url>`
- Dead letter queue: Check for failed messages

### S3 Monitoring

- Video uploads: Monitor bucket metrics
- Storage costs: Track video file sizes and retention

## Troubleshooting

### Common Issues

1. **Lambda Timeout**: Increase timeout in CDK stack (currently 15 minutes)
2. **SQS Message Not Processed**: Check dead letter queue for failed messages
3. **Video Not Appearing**: Verify S3 permissions and bucket configuration
4. **API Errors**: Check CloudWatch logs for specific error messages

### Debug Commands

```bash
# View lambda logs
aws logs tail /aws/lambda/ViralVideosStack-VideoGenerationLambda --follow

# Check SQS queue
aws sqs get-queue-attributes --queue-url <queue-url>

# List S3 objects
aws s3 ls s3://viral-videos-{account}-{region}/
```

## Future Enhancements

1. **WebSocket Notifications**: Real-time status updates instead of polling
2. **Progress Tracking**: Detailed progress updates during video generation
3. **Batch Processing**: Process multiple videos in a single request
4. **Video Templates**: Pre-defined video styles and formats
5. **Cost Optimization**: Implement video compression and storage lifecycle policies
