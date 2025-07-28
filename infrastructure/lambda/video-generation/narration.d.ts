export interface Scene {
    description: string;
    duration: number;
    narration: string;
}
export declare function generateNarration(scenes: Scene[], userId: string): Promise<string[]>;
export declare function generateStoryBreakdown(prompt: string, sceneCount: number, totalDuration: number): Promise<Scene[]>;
