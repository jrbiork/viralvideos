import { SQSRecord } from 'aws-lambda';
export interface SaveImageRequest {
    type?: 'save-image';
    userId: string;
    timestamp: string;
    sceneId: number;
    generatedImageUrl: string;
    duration?: number;
}
export declare function processSaveImage(request: SaveImageRequest, record?: SQSRecord): Promise<any>;
