import { SQSRecord } from 'aws-lambda';
export interface VideoGenerationRequest {
    type?: 'generate-video' | 'save-image' | 'animate-image' | 'combine-video' | 'create-scene' | 'regenerate-scene';
    prompt?: string;
    userId: string;
    timestamp: string;
    totalDuration: number;
    sceneCount: number;
    step: number;
    voice?: string;
    language?: string;
    imageTemplate: string;
}
export declare function processVideoGeneration(request: VideoGenerationRequest, record?: SQSRecord): Promise<any>;
