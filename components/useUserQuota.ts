import { useUserDataCache } from '../hooks/useUserDataCache';

export const FREE_VIDEO_LIMIT = 1;
export const MAX_SCENES = 6;
export const FREE_MAX_SCENES = MAX_SCENES;
export const PRO_MONTHLY_VIDEO_LIMIT = 15;
export const PRO_MAX_SCENES = MAX_SCENES;

export const FREE_IMAGE_GEN_LIMIT = 3;
export const PRO_IMAGE_GEN_MONTHLY_LIMIT = 30;

export interface VideoQuota {
  plan: 'free' | 'pro';
  used: number;
  limit: number;
  remaining: number;
  maxScenes: number;
}

export interface ImageQuota {
  plan: 'free' | 'pro';
  used: number;
  limit: number;
  remaining: number;
}

// Mirrors infrastructure/lambda/utils/quota.ts — the server is the authority,
// this is display-only.
export function useUserQuota(): {
  quota: VideoQuota;
  imageQuota: ImageQuota;
  loading: boolean;
  error: string | null;
  refreshQuota: () => Promise<unknown>;
} {
  const { userData, loading, error, refresh } = useUserDataCache();

  const user = userData?.user;
  const isPro =
    !!user?.subscription &&
    user.subscription.mode !== 'free' &&
    user.subscription.status === 'active';

  let quota: VideoQuota;
  if (isPro) {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const used =
      user?.quotaPeriodStart === currentMonth
        ? user?.videosCreatedThisMonth || 0
        : 0;
    quota = {
      plan: 'pro',
      used,
      limit: PRO_MONTHLY_VIDEO_LIMIT,
      remaining: Math.max(0, PRO_MONTHLY_VIDEO_LIMIT - used),
      maxScenes: PRO_MAX_SCENES,
    };
  } else {
    const used = user?.videosCreated || 0;
    quota = {
      plan: 'free',
      used,
      limit: FREE_VIDEO_LIMIT,
      remaining: Math.max(0, FREE_VIDEO_LIMIT - used),
      maxScenes: FREE_MAX_SCENES,
    };
  }

  let imageQuota: ImageQuota;
  if (isPro) {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const used =
      user?.imageQuotaPeriodStart === currentMonth
        ? user?.imagesGeneratedThisMonth || 0
        : 0;
    imageQuota = {
      plan: 'pro',
      used,
      limit: PRO_IMAGE_GEN_MONTHLY_LIMIT,
      remaining: Math.max(0, PRO_IMAGE_GEN_MONTHLY_LIMIT - used),
    };
  } else {
    const used = user?.imagesGenerated || 0;
    imageQuota = {
      plan: 'free',
      used,
      limit: FREE_IMAGE_GEN_LIMIT,
      remaining: Math.max(0, FREE_IMAGE_GEN_LIMIT - used),
    };
  }

  return { quota, imageQuota, loading, error, refreshQuota: refresh };
}
