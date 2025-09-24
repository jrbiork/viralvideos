export interface Scene {
    description: string;
    duration: number;
    narration: string;
    id: number;
}
export declare function animateImageToVideo(description: string, duration: 5 | 10, scenePosition: number, userId: string, timestamp: string, seed: number, imageUrl?: string): Promise<string>;
