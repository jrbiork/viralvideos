import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getUser, UserItem } from './user';

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const docClient = DynamoDBDocumentClient.from(client);

const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME || 'viral-videos-users';

export const FREE_VIDEO_LIMIT = 1;
export const MAX_SCENES = 6;
export const FREE_MAX_SCENES = MAX_SCENES;
export const PRO_MONTHLY_VIDEO_LIMIT = 15;
export const PRO_MAX_SCENES = MAX_SCENES;

export const FREE_IMAGE_GEN_LIMIT = 3; // lifetime, via the "Generate image" button
export const PRO_IMAGE_GEN_MONTHLY_LIMIT = 30;

export type Plan = 'free' | 'pro';

export interface VideoQuota {
  plan: Plan;
  used: number;
  limit: number;
  remaining: number;
  maxScenes: number;
}

// Any active paid subscription counts as pro (legacy modes starter/creator/influencer included)
export function getPlan(user: UserItem | null): Plan {
  if (
    user?.subscription &&
    user.subscription.mode !== 'free' &&
    user.subscription.status === 'active'
  ) {
    return 'pro';
  }
  return 'free';
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7); // e.g. "2026-07"
}

function quotaFromUser(user: UserItem | null): VideoQuota {
  const plan = getPlan(user);
  if (plan === 'pro') {
    // Monthly counter only valid for the current period
    const used =
      user?.quotaPeriodStart === currentMonth()
        ? user?.videosCreatedThisMonth || 0
        : 0;
    return {
      plan,
      used,
      limit: PRO_MONTHLY_VIDEO_LIMIT,
      remaining: Math.max(0, PRO_MONTHLY_VIDEO_LIMIT - used),
      maxScenes: PRO_MAX_SCENES,
    };
  }
  const used = user?.videosCreated || 0;
  return {
    plan,
    used,
    limit: FREE_VIDEO_LIMIT,
    remaining: Math.max(0, FREE_VIDEO_LIMIT - used),
    maxScenes: FREE_MAX_SCENES,
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

  // Pro: monthly cap
  const month = currentMonth();
  const used =
    user.imageQuotaPeriodStart === month ? user.imagesGeneratedThisMonth || 0 : 0;
  const limit = PRO_IMAGE_GEN_MONTHLY_LIMIT;

  if (used >= limit) {
    console.log(
      `Image quota exhausted for user ${userId}: ${used}/${limit} (pro, ${month})`,
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
