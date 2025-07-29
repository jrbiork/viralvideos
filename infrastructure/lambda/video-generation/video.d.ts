export interface Scene {
    description: string;
    duration: number;
    narration: string;
}
export declare function generateVideoClip(description: string, duration: number, sceneIndex: number, userId: string, timestamp: string): Promise<string>;
