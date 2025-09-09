export interface Scene {
    description: string;
    duration: number;
    narration: string;
    id: number;
}
export declare function generateNanoBananaImage(description: string, scenePosition: number, userId: string, timestamp: string, seed: number, signedUrl?: boolean): Promise<string | null>;
