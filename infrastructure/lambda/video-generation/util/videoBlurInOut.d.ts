export interface Scene {
    description: string;
    duration: number;
    narration: string;
    id: number;
}
export declare function generateVideoBlurInOut(scenes: Scene[], userId: string, timestamp: string): Promise<string[]>;
