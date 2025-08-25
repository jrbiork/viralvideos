export interface Scene {
    description: string;
    duration: number;
    narration: string;
    id: number;
}
export declare function addSceneIds(scenes: any[]): Scene[];
export declare function generateStoryBreakdown(prompt: string, sceneCount: number, sceneDuration: number, totalDuration: number, userId: string, timestamp: string): Promise<{
    scenes: Scene[];
    voiceToneInstruction: string;
}>;
