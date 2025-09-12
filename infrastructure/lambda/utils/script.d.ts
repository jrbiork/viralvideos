export interface Scene {
    description: string;
    duration: number;
    narration: string;
    id: number;
    scenePosition: number;
    /** Two short bylines repeated every scene, e.g., ["blonde Swiss woman, green-blue eyes", "muscular Brazilian man with mustache"] */
    charactersBrief?: string[];
}
export declare function addSceneIds(scenes: Scene[]): Scene[];
export declare function generateStoryBreakdown(prompt: string, sceneCount: number, sceneDuration: number, totalDuration: number, userId: string, timestamp: string): Promise<{
    scenes: Scene[];
    voiceToneInstruction: string;
}>;
