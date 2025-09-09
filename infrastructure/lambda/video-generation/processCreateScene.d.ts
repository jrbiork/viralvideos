import { SQSRecord } from 'aws-lambda';
export interface CreateSceneRequest {
    imageUrl: string;
    sceneId: number;
    scenePosition: number;
    userId: string;
    timestamp: string;
    captionText: string;
}
export declare function processCreateScene(request: CreateSceneRequest, record?: SQSRecord): Promise<{
    statusCode: number;
    body: string;
}>;
