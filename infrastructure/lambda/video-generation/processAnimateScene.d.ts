import { SQSRecord } from 'aws-lambda';
export interface AnimateSceneRequest {
    type?: 'animate-scene';
    userId: string;
    timestamp: string;
    sceneId: number;
    animationPrompt: string;
}
export declare function processAnimateScene(request: AnimateSceneRequest, record?: SQSRecord): Promise<any>;
