export interface Scene {
    description: string;
    duration: number;
    narration: string;
    id: number;
    scenePosition: number;
    /** Two short bylines repeated every scene, e.g., ["blonde Swiss woman, green-blue eyes", "muscular Brazilian man with mustache"] */
    charactersBrief?: string[];
    animated: boolean;
}
export declare function addSceneIds(scenes: Scene[]): Scene[];
export declare function generateStoryBreakdown(prompt: string, sceneCount: number, sceneDuration: number, totalDuration: number): Promise<{
    scenes: Scene[];
    voiceToneInstruction: string;
}>;
