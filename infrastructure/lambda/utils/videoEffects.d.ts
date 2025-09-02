export interface Scene {
    description: string;
    duration: number;
    narration: string;
    id: number;
}
export declare function getVideoEffectUrls(userId: string, timestamp: string, scenes: Omit<Scene, 'description' | 'narration'>[]): Promise<Array<{
    [key: string]: string;
}>>;
export declare function generateVideoEffects(scenes: Omit<Scene, 'description' | 'narration'>[], userId: string, timestamp: string): Promise<Array<{
    [key: string]: string;
}>>;
