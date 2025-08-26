import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
interface VideoProgressMessage {
    action: 'script_created' | 'image_created' | 'audio_subtitle_created' | 'video_scene_created' | 'video_completed';
    data: {
        userId: string;
        timestamp: string;
        message?: string;
        scenes?: any[];
        imageUrls?: any[];
        subtitleUrls?: any[];
        narrationUrls?: any[];
        videoEffectsUrls?: any[];
        videoKey?: string;
        [key: string]: any;
    };
}
interface GenericMessage {
    [key: string]: any;
}
export declare const handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
declare function broadcastVideoProgressMessage(message: VideoProgressMessage, domainName: string, stage: string, userId: string): Promise<void>;
declare function broadcastMessage(message: GenericMessage, domainName: string, stage: string, userId: string): Promise<void>;
export { broadcastMessage, broadcastVideoProgressMessage };
