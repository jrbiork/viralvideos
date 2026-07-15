import { UserItem } from './user';
export interface Scene {
    description: string;
    duration: number;
    narration: string;
    id: number;
}
/**
 * Lists which of a video's per-scene Ken-Burns mp4 objects actually exist in
 * S3 today, keyed by full object Key (e.g. "userId/timestamp.scene-1.mp4").
 * Single existence source of truth reused by getVideoEffectUrls and by
 * hydrateManifest (manifestUtils.ts) so signed URLs are never handed out for
 * scenes whose video hasn't been generated yet.
 */
export declare function listExistingSceneMp4Keys(userId: string, timestamp: string): Promise<Set<string>>;
export declare function getVideoEffectUrls(userId: string, timestamp: string, scenes: Omit<Scene, 'description' | 'narration'>[], user: UserItem | null): Promise<Array<{
    [key: string]: string;
}>>;
export declare function generateVideoEffects(scenes: Omit<Scene, 'description' | 'narration'>[], userId: string, timestamp: string, user: UserItem | null): Promise<Array<{
    [key: string]: string;
}>>;
export declare function getImageSignedUrl(imageKey: string): Promise<string | null>;
export declare function generateSceneVideo(imageUrl: string, scene: Omit<Scene, 'description' | 'narration'>, userId: string, timestamp: string, user: UserItem | null): Promise<string>;
