import { useUserDataCache } from '../hooks/useUserDataCache';

export type Plan = 'free' | 'creator' | 'pro';

interface PlanLimits {
  videoLimit: number; // free = lifetime cap, creator/pro = monthly cap
  maxScenes: number;
  imageGenLimit: number; // free = lifetime cap, creator/pro = monthly cap
  animationLimit: number; // 0 for free (animations always rejected)
}

const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: { videoLimit: 1, maxScenes: 3, imageGenLimit: 3, animationLimit: 0 },
  creator: { videoLimit: 10, maxScenes: 5, imageGenLimit: 20, animationLimit: 5 },
  pro: { videoLimit: 20, maxScenes: 6, imageGenLimit: 40, animationLimit: 10 },
};

export const FREE_VIDEO_LIMIT = PLAN_LIMITS.free.videoLimit;
export const FREE_MAX_SCENES = PLAN_LIMITS.free.maxScenes;
export const CREATOR_MONTHLY_VIDEO_LIMIT = PLAN_LIMITS.creator.videoLimit;
export const CREATOR_MAX_SCENES = PLAN_LIMITS.creator.maxScenes;
export const PRO_MONTHLY_VIDEO_LIMIT = PLAN_LIMITS.pro.videoLimit;
export const PRO_MAX_SCENES = PLAN_LIMITS.pro.maxScenes;

export const FREE_IMAGE_GEN_LIMIT = PLAN_LIMITS.free.imageGenLimit;
export const CREATOR_IMAGE_GEN_MONTHLY_LIMIT = PLAN_LIMITS.creator.imageGenLimit;
export const PRO_IMAGE_GEN_MONTHLY_LIMIT = PLAN_LIMITS.pro.imageGenLimit;

export const CREATOR_ANIMATION_MONTHLY_LIMIT = PLAN_LIMITS.creator.animationLimit;
export const PRO_ANIMATION_MONTHLY_LIMIT = PLAN_LIMITS.pro.animationLimit;

export interface VideoQuota {
  plan: Plan;
  used: number;
  limit: number;
  remaining: number;
  maxScenes: number;
}

export interface ImageQuota {
  plan: Plan;
  used: number;
  limit: number;
  remaining: number;
}

// Free plan always reports limit/remaining 0 (animationLimit is 0).
export interface AnimationQuota {
  plan: Plan;
  used: number;
  limit: number;
  remaining: number;
}

// Legacy subscription modes (starter/influencer) collapse into pro.
function derivePlan(user: { subscription?: { mode: string; status: string } } | undefined): Plan {
  if (!user?.subscription || user.subscription.status !== 'active') {
    return 'free';
  }
  if (user.subscription.mode === 'creator') {
    return 'creator';
  }
  if (user.subscription.mode === 'free') {
    return 'free';
  }
  return 'pro';
}

// Mirrors infrastructure/lambda/utils/quota.ts — the server is the authority,
// this is display-only.
export function useUserQuota(): {
  quota: VideoQuota;
  imageQuota: ImageQuota;
  animationQuota: AnimationQuota;
  loading: boolean;
  error: string | null;
  refreshQuota: () => Promise<unknown>;
} {
  const { userData, loading, error, refresh } = useUserDataCache();

  const user = userData?.user;
  const plan = derivePlan(user);
  const limits = PLAN_LIMITS[plan];
  const currentMonth = new Date().toISOString().slice(0, 7);

  let quota: VideoQuota;
  if (plan === 'free') {
    const used = user?.videosCreated || 0;
    quota = {
      plan,
      used,
      limit: limits.videoLimit,
      remaining: Math.max(0, limits.videoLimit - used),
      maxScenes: limits.maxScenes,
    };
  } else {
    const used =
      user?.quotaPeriodStart === currentMonth
        ? user?.videosCreatedThisMonth || 0
        : 0;
    quota = {
      plan,
      used,
      limit: limits.videoLimit,
      remaining: Math.max(0, limits.videoLimit - used),
      maxScenes: limits.maxScenes,
    };
  }

  let imageQuota: ImageQuota;
  if (plan === 'free') {
    const used = user?.imagesGenerated || 0;
    imageQuota = {
      plan,
      used,
      limit: limits.imageGenLimit,
      remaining: Math.max(0, limits.imageGenLimit - used),
    };
  } else {
    const used =
      user?.imageQuotaPeriodStart === currentMonth
        ? user?.imagesGeneratedThisMonth || 0
        : 0;
    imageQuota = {
      plan,
      used,
      limit: limits.imageGenLimit,
      remaining: Math.max(0, limits.imageGenLimit - used),
    };
  }

  let animationQuota: AnimationQuota;
  if (plan === 'free') {
    animationQuota = { plan, used: 0, limit: 0, remaining: 0 };
  } else {
    const used =
      user?.animationQuotaPeriodStart === currentMonth
        ? user?.animationsGeneratedThisMonth || 0
        : 0;
    animationQuota = {
      plan,
      used,
      limit: limits.animationLimit,
      remaining: Math.max(0, limits.animationLimit - used),
    };
  }

  return {
    quota,
    imageQuota,
    animationQuota,
    loading,
    error,
    refreshQuota: refresh,
  };
}
