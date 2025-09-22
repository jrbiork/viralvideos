import { UserItem } from './user';
export interface Scene {
    description: string;
    duration: number;
    narration: string;
    id: number;
}
export declare function getVideoEffectUrls(userId: string, timestamp: string, scenes: Omit<Scene, 'description' | 'narration'>[], user: UserItem | null): Promise<Array<{
    [key: string]: string;
}>>;
export declare function generateVideoEffects(scenes: Omit<Scene, 'description' | 'narration'>[], userId: string, timestamp: string, user: UserItem | null): Promise<Array<{
    [key: string]: string;
}>>;
