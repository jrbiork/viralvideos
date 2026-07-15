import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
/**
 * Scene animation via Runway routinely takes longer than API Gateway's hard
 * 29s integration timeout, so this handler only validates the request and
 * quota, then enqueues the actual work to the video-generation SQS queue
 * (processAnimateScene). The frontend is notified of completion via the
 * existing WebSocket broadcast channel ('scene_animated' / 'error'), the
 * same pattern already used for video generation and batch edits.
 */
export declare const handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
