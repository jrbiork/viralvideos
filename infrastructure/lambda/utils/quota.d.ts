import { UserItem } from './user';
export type Plan = 'free' | 'starter' | 'creator' | 'pro';
export declare const FREE_VIDEO_LIMIT: number;
export declare const FREE_MAX_SCENES: number;
export declare const STARTER_MONTHLY_VIDEO_LIMIT: number;
export declare const STARTER_MAX_SCENES: number;
export declare const CREATOR_MONTHLY_VIDEO_LIMIT: number;
export declare const CREATOR_MAX_SCENES: number;
export declare const PRO_MONTHLY_VIDEO_LIMIT: number;
export declare const PRO_MAX_SCENES: number;
export declare const FREE_IMAGE_GEN_LIMIT: number;
export declare const STARTER_IMAGE_GEN_MONTHLY_LIMIT: number;
export declare const CREATOR_IMAGE_GEN_MONTHLY_LIMIT: number;
export declare const PRO_IMAGE_GEN_MONTHLY_LIMIT: number;
export declare const FREE_ANIMATION_LIMIT: number;
export declare const STARTER_ANIMATION_MONTHLY_LIMIT: number;
export declare const CREATOR_ANIMATION_MONTHLY_LIMIT: number;
export declare const PRO_ANIMATION_MONTHLY_LIMIT: number;
export interface VideoQuota {
    plan: Plan;
    used: number;
    limit: number;
    remaining: number;
    maxScenes: number;
}
export declare function getPlan(user: UserItem | null): Plan;
export declare function getMaxScenesForUser(userId: string): Promise<number>;
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
 * monthly cap that resets with the billing-period counter.
 */
export declare function checkAndConsumeImageGenQuota(userId: string): Promise<{
    allowed: boolean;
    used: number;
    limit: number;
    plan: Plan;
}>;
/**
 * Check whether the user may animate another scene via Runway and, if so,
 * consume one unit. Free is a lifetime cap; starter/creator/pro is a
 * monthly cap that resets with the billing-period counter.
 */
export declare function checkAndConsumeAnimationQuota(userId: string): Promise<{
    allowed: boolean;
    used: number;
    limit: number;
    plan: Plan;
}>;
