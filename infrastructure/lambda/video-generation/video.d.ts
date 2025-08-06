export interface Scene {
    description: string;
    duration: number;
    narration: string;
    id: number;
}
export declare function generateVideoClip(description: string, duration: number, sceneIndex: number, userId: string, timestamp: string, seed: number, sceneId?: number): Promise<string>;
