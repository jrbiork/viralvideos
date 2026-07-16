import { SQSRecord } from 'aws-lambda';
export interface BatchEditRequest {
    type?: 'batch-edit';
    userId: string;
    timestamp: string;
    edits: {
        narrationEdits: {
            sceneId: number;
            scenePosition: number;
            narration: string;
        }[];
        imageEdits: {
            sceneId: number;
            generatedImageUrl: string;
        }[];
        addedScenes: {
            sceneId: number;
            scenePosition: number;
            captionText: string;
            imageUrl: string;
        }[];
        removedSceneIds: number[];
        animationEdits?: {
            sceneId: number;
            animatedVideoUrl: string;
            animationPrompt: string;
        }[];
        sceneOrder?: number[] | null;
    };
}
/**
 * Processes all pending scene edits from the UI in a single pass:
 * one manifest read, one manifest write, one WebSocket broadcast.
 */
export declare function processBatchEdit(request: BatchEditRequest, record?: SQSRecord): Promise<any>;
