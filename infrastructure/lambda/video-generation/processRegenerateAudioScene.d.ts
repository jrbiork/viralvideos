import { SQSRecord } from 'aws-lambda';
import { Scene } from '../utils/script';
export interface processRegenerateAudioSceneRequest {
    scene: Scene;
    voice: string;
    language: string;
    userId: string;
    timestamp: string;
}
export declare function processRegenerateAudioScene(request: processRegenerateAudioSceneRequest, record?: SQSRecord): Promise<{
    statusCode: number;
    body: string;
}>;
