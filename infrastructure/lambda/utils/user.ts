import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const docClient = DynamoDBDocumentClient.from(client);

const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME || 'viral-videos-users';

export interface UserSubscription {
  // 'influencer' is a legacy mode, treated as 'pro' by getPlan()
  mode: 'free' | 'creator' | 'pro' | 'starter' | 'influencer';
  renewalDate: string | null;
  status: 'active' | 'cancelled' | 'expired';
}

export interface UserItem {
  userId: string;
  username: string;
  email: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  subscription?: UserSubscription;
  videosCreated?: number;
  videosCreatedThisMonth?: number;
  quotaPeriodStart?: string; // ISO month, e.g. "2026-07"
  imagesGenerated?: number; // free-tier lifetime counter, via "Generate image" button
  imagesGeneratedThisMonth?: number; // pro-tier monthly counter
  imageQuotaPeriodStart?: string; // ISO month, e.g. "2026-07" — only used by the pro monthly counter
  animationsGeneratedThisMonth?: number; // pro-tier monthly counter, via "Animate scene" button
  animationQuotaPeriodStart?: string; // ISO month, e.g. "2026-07"
  [key: string]: any;
}

/**
 * Fetch the user's subscription info by userId (partition key).
 * Falls back to a free subscription if user not found or subscription missing.
 */
export async function getUser(userId: string): Promise<UserItem | null> {
  try {
    const queryCommand = new QueryCommand({
      TableName: USERS_TABLE_NAME,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
      Limit: 1,
    });

    const result = await docClient.send(queryCommand);

    const user: UserItem | undefined = result.Items?.[0] as
      | UserItem
      | undefined;

    if (!user) {
      return null;
    }

    return user;
  } catch (error) {
    console.error('Error fetching user subscription:', error);
    return null;
  }
}
