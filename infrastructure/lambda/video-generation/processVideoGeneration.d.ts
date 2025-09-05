import { SQSRecord } from 'aws-lambda';
export interface VideoGenerationRequest {
    type?: 'generate-video' | 'save-image' | 'animate-image' | 'combine-video';
    prompt?: string;
    userId: string;
    timestamp: string;
    totalDuration: number;
    sceneCount: number;
    step: number;
    voice?: string;
    language?: string;
}
export declare function processVideoGeneration(request: VideoGenerationRequest, record?: SQSRecord): Promise<any>;
