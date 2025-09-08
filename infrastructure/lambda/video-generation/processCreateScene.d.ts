import { SQSRecord } from 'aws-lambda';
export interface CreateSceneRequest {
    imageUrl: string;
    sceneId: number;
    sceneIndex: number;
    userId: string;
    timestamp: string;
    captionText: string;
}
export declare function processCreateScene(request: CreateSceneRequest, record?: SQSRecord): Promise<{
    statusCode: number;
    body: string;
}>;
