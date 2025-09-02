import { SQSRecord } from 'aws-lambda';
export interface AnimateImageRequest {
    type?: 'animate-image';
    userId: string;
    timestamp: string;
    sceneId: number;
    animationPrompt: string;
    imageUrl: string;
    duration: 5 | 10;
}
export declare function processAnimateImage(request: AnimateImageRequest, record?: SQSRecord): Promise<any>;
