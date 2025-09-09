export interface Scene {
    description: string;
    duration: number;
    narration: string;
    id: number;
}
export declare function generateImage(description: string, scenePosition: number, userId: string, timestamp: string, seed: number, sceneId?: number): Promise<string>;
