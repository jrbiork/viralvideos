import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getUser, UserItem } from './user';

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const docClient = DynamoDBDocumentClient.from(client);

const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME || 'viral-videos-users';

export type Plan = 'free' | 'starter' | 'creator' | 'pro';

interface PlanLimits {
  videoLimit: number; // free = lifetime cap, starter/creator/pro = monthly cap
  maxScenes: number;
  imageGenLimit: number; // free = lifetime cap, starter/creator/pro = monthly cap
  animationLimit: number; // 0 for free (animations always rejected)
}

const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: { videoLimit: 1, maxScenes: 3, imageGenLimit: 3, animationLimit: 0 },
  starter: { videoLimit: 8, maxScenes: 4, imageGenLimit: 10, animationLimit: 3 },
  creator: { videoLimit: 10, maxScenes: 5, imageGenLimit: 20, animationLimit: 5 },
  pro: { videoLimit: 20, maxScenes: 6, imageGenLimit: 40, animationLimit: 10 },
};

export const FREE_VIDEO_LIMIT = PLAN_LIMITS.free.videoLimit;
export const FREE_MAX_SCENES = PLAN_LIMITS.free.maxScenes;
export const STARTER_MONTHLY_VIDEO_LIMIT = PLAN_LIMITS.starter.videoLimit;
export const STARTER_MAX_SCENES = PLAN_LIMITS.starter.maxScenes;
export const CREATOR_MONTHLY_VIDEO_LIMIT = PLAN_LIMITS.creator.videoLimit;
export const CREATOR_MAX_SCENES = PLAN_LIMITS.creator.maxScenes;
export const PRO_MONTHLY_VIDEO_LIMIT = PLAN_LIMITS.pro.videoLimit;
export const PRO_MAX_SCENES = PLAN_LIMITS.pro.maxScenes;

export const FREE_IMAGE_GEN_LIMIT = PLAN_LIMITS.free.imageGenLimit; // lifetime, via the "Generate image" button
export const STARTER_IMAGE_GEN_MONTHLY_LIMIT = PLAN_LIMITS.starter.imageGenLimit;
export const CREATOR_IMAGE_GEN_MONTHLY_LIMIT = PLAN_LIMITS.creator.imageGenLimit;
export const PRO_IMAGE_GEN_MONTHLY_LIMIT = PLAN_LIMITS.pro.imageGenLimit;

export const STARTER_ANIMATION_MONTHLY_LIMIT = PLAN_LIMITS.starter.animationLimit; // via the "Animate scene" button
export const CREATOR_ANIMATION_MONTHLY_LIMIT = PLAN_LIMITS.creator.animationLimit;
export const PRO_ANIMATION_MONTHLY_LIMIT = PLAN_LIMITS.pro.animationLimit;

export interface VideoQuota {
  plan: Plan;
  used: number;
  limit: number;
  remaining: number;
  maxScenes: number;
}

// Legacy 'influencer' subscription mode collapses into pro.
export function getPlan(user: UserItem | null): Plan {
  if (!user?.subscription || user.subscription.status !== 'active') {
    return 'free';
  }
  if (user.subscription.mode === 'starter') {
    return 'starter';
  }
  if (user.subscription.mode === 'creator') {
    return 'creator';
  }
  if (user.subscription.mode === 'free') {
    return 'free';
  }
  return 'pro';
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7); // e.g. "2026-07"
}

export async function getMaxScenesForUser(userId: string): Promise<number> {
  const user = await getUser(userId);
  return PLAN_LIMITS[getPlan(user)].maxScenes;
}

function quotaFromUser(user: UserItem | null): VideoQuota {
  const plan = getPlan(user);
  const limits = PLAN_LIMITS[plan];

  if (plan === 'free') {
    const used = user?.videosCreated || 0;
    return {
      plan,
      used,
      limit: limits.videoLimit,
      remaining: Math.max(0, limits.videoLimit - used),
      maxScenes: limits.maxScenes,
    };
  }

  // Monthly counter only valid for the current period
  const used =
    user?.quotaPeriodStart === currentMonth()
      ? user?.videosCreatedThisMonth || 0
      : 0;
  return {
    plan,
    used,
    limit: limits.videoLimit,
    remaining: Math.max(0, limits.videoLimit - used),
    maxScenes: limits.maxScenes,
  };
}

/**
 * Read-only quota lookup for display purposes.
 */
export async function getVideoQuota(userId: string): Promise<VideoQuota> {
  const user = await getUser(userId);
  return quotaFromUser(user);
}

/**
 * Check whether the user may create another video and, if so, consume one
 * quota unit (increments lifetime and monthly counters).
 */
export async function checkAndConsumeVideoQuota(
  userId: string,
): Promise<{ allowed: boolean; quota: VideoQuota }> {
  const user = await getUser(userId);

  if (!user) {
    console.error(`Quota check failed: user not found for userId ${userId}`);
    return { allowed: false, quota: quotaFromUser(null) };
  }

  const quota = quotaFromUser(user);

  if (quota.remaining <= 0) {
    console.log(
      `Quota exhausted for user ${userId}: ${quota.used}/${quota.limit} (${quota.plan})`,
    );
    return { allowed: false, quota };
  }

  const month = currentMonth();
  // Monthly counter resets lazily when the period rolls over
  const monthlyUsed =
    user.quotaPeriodStart === month ? user.videosCreatedThisMonth || 0 : 0;

  const updateCommand = new UpdateCommand({
    TableName: USERS_TABLE_NAME,
    Key: {
      userId: user.userId,
      username: user.username,
    },
    UpdateExpression:
      'SET videosCreated = if_not_exists(videosCreated, :zero) + :one, ' +
      'videosCreatedThisMonth = :newMonthlyUsed, quotaPeriodStart = :month',
    ExpressionAttributeValues: {
      ':zero': 0,
      ':one': 1,
      ':newMonthlyUsed': monthlyUsed + 1,
      ':month': month,
    },
  });

  await docClient.send(updateCommand);

  return {
    allowed: true,
    quota: {
      ...quota,
      used: quota.used + 1,
      remaining: quota.remaining - 1,
    },
  };
}

/**
 * Check whether the user may generate another image via the "Generate image"
 * button and, if so, consume one unit. Free is a lifetime cap; pro is a
 * monthly cap that resets with the billing-period counter.
 */
export async function checkAndConsumeImageGenQuota(
  userId: string,
): Promise<{ allowed: boolean; used: number; limit: number; plan: Plan }> {
  const user = await getUser(userId);

  if (!user) {
    console.error(
      `Image quota check failed: user not found for userId ${userId}`,
    );
    return { allowed: false, used: 0, limit: FREE_IMAGE_GEN_LIMIT, plan: 'free' };
  }

  const plan = getPlan(user);

  if (plan === 'free') {
    const used = user.imagesGenerated || 0;
    const limit = FREE_IMAGE_GEN_LIMIT;

    if (used >= limit) {
      console.log(
        `Image quota exhausted for user ${userId}: ${used}/${limit} (free)`,
      );
      return { allowed: false, used, limit, plan };
    }

    await docClient.send(
      new UpdateCommand({
        TableName: USERS_TABLE_NAME,
        Key: { userId: user.userId, username: user.username },
        UpdateExpression:
          'SET imagesGenerated = if_not_exists(imagesGenerated, :zero) + :one',
        ExpressionAttributeValues: { ':zero': 0, ':one': 1 },
      }),
    );

    return { allowed: true, used: used + 1, limit, plan };
  }

  // Creator/pro: monthly cap
  const month = currentMonth();
  const used =
    user.imageQuotaPeriodStart === month ? user.imagesGeneratedThisMonth || 0 : 0;
  const limit = PLAN_LIMITS[plan].imageGenLimit;

  if (used >= limit) {
    console.log(
      `Image quota exhausted for user ${userId}: ${used}/${limit} (${plan}, ${month})`,
    );
    return { allowed: false, used, limit, plan };
  }

  await docClient.send(
    new UpdateCommand({
      TableName: USERS_TABLE_NAME,
      Key: { userId: user.userId, username: user.username },
      UpdateExpression:
        'SET imagesGeneratedThisMonth = :newUsed, imageQuotaPeriodStart = :month',
      ExpressionAttributeValues: { ':newUsed': used + 1, ':month': month },
    }),
  );

  return { allowed: true, used: used + 1, limit, plan };
}

/**
 * Check whether the user may animate another scene via Runway and, if so,
 * consume one unit. Free plan is always rejected (animationLimit is 0).
 * Monthly cap resets with the same lazy billing-period pattern as
 * image/video quotas.
 */
export async function checkAndConsumeAnimationQuota(
  userId: string,
): Promise<{ allowed: boolean; used: number; limit: number; plan: Plan }> {
  const user = await getUser(userId);

  if (!user) {
    console.error(
      `Animation quota check failed: user not found for userId ${userId}`,
    );
    return {
      allowed: false,
      used: 0,
      limit: PLAN_LIMITS.free.animationLimit,
      plan: 'free',
    };
  }

  const plan = getPlan(user);
  const limit = PLAN_LIMITS[plan].animationLimit;

  if (plan === 'free') {
    console.log(
      `Animation quota rejected for user ${userId}: scene animation requires Creator or Pro`,
    );
    return { allowed: false, used: 0, limit, plan };
  }

  const month = currentMonth();
  const used =
    user.animationQuotaPeriodStart === month
      ? user.animationsGeneratedThisMonth || 0
      : 0;

  if (used >= limit) {
    console.log(
      `Animation quota exhausted for user ${userId}: ${used}/${limit} (${plan}, ${month})`,
    );
    return { allowed: false, used, limit, plan };
  }

  await docClient.send(
    new UpdateCommand({
      TableName: USERS_TABLE_NAME,
      Key: { userId: user.userId, username: user.username },
      UpdateExpression:
        'SET animationsGeneratedThisMonth = :newUsed, animationQuotaPeriodStart = :month',
      ExpressionAttributeValues: { ':newUsed': used + 1, ':month': month },
    }),
  );

  return { allowed: true, used: used + 1, limit, plan };
}
