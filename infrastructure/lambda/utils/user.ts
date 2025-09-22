import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const docClient = DynamoDBDocumentClient.from(client);

const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME || 'viral-videos-users';

export interface UserSubscription {
  mode: 'free' | 'starter' | 'creator' | 'influencer';
  renewalDate: string | null;
  status: 'active' | 'cancelled' | 'expired';
}

export interface UserItem {
  userId: string;
  username: string;
  subscription?: UserSubscription;
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
