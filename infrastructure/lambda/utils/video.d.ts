export interface Scene {
    description: string;
    duration: number;
    narration: string;
    id: number;
}
export declare function generateVideoClip(description: string, duration: 5 | 10, sceneIndex: number, userId: string, timestamp: string, seed: number, imageUrl?: string): Promise<string>;
