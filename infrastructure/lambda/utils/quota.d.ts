import { UserItem } from './user';
export declare const FREE_VIDEO_LIMIT = 1;
export declare const MAX_SCENES = 6;
export declare const FREE_MAX_SCENES = 6;
export declare const PRO_MONTHLY_VIDEO_LIMIT = 15;
export declare const PRO_MAX_SCENES = 6;
export declare const FREE_IMAGE_GEN_LIMIT = 3;
export declare const PRO_IMAGE_GEN_DAILY_LIMIT = 15;
export type Plan = 'free' | 'pro';
export interface VideoQuota {
    plan: Plan;
    used: number;
    limit: number;
    remaining: number;
    maxScenes: number;
}
export declare function getPlan(user: UserItem | null): Plan;
/**
 * Read-only quota lookup for display purposes.
 */
export declare function getVideoQuota(userId: string): Promise<VideoQuota>;
/**
 * Check whether the user may create another video and, if so, consume one
 * quota unit (increments lifetime and monthly counters).
 */
export declare function checkAndConsumeVideoQuota(userId: string): Promise<{
    allowed: boolean;
    quota: VideoQuota;
}>;
/**
 * Check whether the user may generate another image via the "Generate image"
 * button and, if so, consume one unit. Free is a lifetime cap; pro is a
 * daily cap that resets at midnight UTC.
 */
export declare function checkAndConsumeImageGenQuota(userId: string): Promise<{
    allowed: boolean;
    used: number;
    limit: number;
    plan: Plan;
}>;
