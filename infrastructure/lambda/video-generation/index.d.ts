import { SQSEvent, SQSBatchResponse } from 'aws-lambda';
export declare const handler: (event: SQSEvent) => Promise<SQSBatchResponse>;
export declare function broadcastProgress(action: 'script_created' | 'image_created' | 'audio_subtitle_created' | 'video_scene_created' | 'preview_completed' | 'video_completed' | 'credit_updated', userId: string, timestamp: string, data?: any, message?: string): Promise<void>;
