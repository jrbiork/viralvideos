import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  UpdateCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const docClient = DynamoDBDocumentClient.from(client);

const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME || 'viral-videos-users';

export const CREDITS_COST = {
  preview_video: 10,
  new_audio_subtitle: 1,
  new_image: 5,
  ai_video_5s: 10,
  ai_video_10s: 20,
};

interface User {
  userId: string;
  username: string;
  creditsAvailable: number;
  [key: string]: any;
}

/**
 * Check if user has sufficient credit balance using only userId
 * @param userId - The user ID (partition key)
 * @param costToPay - The costToPay to check against
 * @returns Promise<boolean> - True if user has sufficient credits, false otherwise
 */
export async function hasSufficientCreditsByUserId(
  userId: string,
  costToPay: number,
): Promise<{ hasSufficientCredits: boolean; currentCredits: number }> {
  try {
    console.log(
      `Checking credit balance for userId: ${userId}, costToPay: ${costToPay}`,
    );

    const currentCredits = await getCreditBalanceByUserId(userId);

    console.log(
      `User ${userId} has ${currentCredits} credits, required: ${costToPay}`,
    );

    return {
      hasSufficientCredits: currentCredits >= costToPay,
      currentCredits,
    };
  } catch (error) {
    console.error('Error checking credit balance:', error);
    return { hasSufficientCredits: false, currentCredits: 0 };
  }
}

/**
 * Update user's credit balance by deducting the costToPay using only userId
 * @param userId - The user ID (partition key)
 * @param costToPay - The costToPay to deduct
 * @returns Promise<number> - The updated credit balance
 */
export async function updateCreditBalanceByUserId(
  userId: string,
  costToPay: number,
): Promise<number> {
  try {
    console.log(
      `Updating credit balance for userId: ${userId}, deducting: ${costToPay}`,
    );

    // First check if user has sufficient credits
    const currentCredits = await getCreditBalanceByUserId(userId);

    if (currentCredits < costToPay) {
      throw new Error(
        `Insufficient credits for user ${userId}. Current: ${currentCredits}, Required: ${costToPay}`,
      );
    }

    // Get the user's username first
    const queryCommand = new QueryCommand({
      TableName: USERS_TABLE_NAME,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
      Limit: 1,
    });

    const queryResult = await docClient.send(queryCommand);

    if (!queryResult.Items || queryResult.Items.length === 0) {
      throw new Error(`User not found for userId: ${userId}`);
    }

    const user = queryResult.Items[0] as User;
    const username = user.username;

    // Update the credit balance
    const updateCommand = new UpdateCommand({
      TableName: USERS_TABLE_NAME,
      Key: {
        userId: userId,
        username: username,
      },
      UpdateExpression: 'SET creditsAvailable = creditsAvailable - :costToPay',
      ExpressionAttributeValues: {
        ':costToPay': costToPay,
      },
      ReturnValues: 'ALL_NEW',
    });

    const result = await docClient.send(updateCommand);

    if (!result.Attributes) {
      throw new Error('Failed to update credit balance');
    }

    const updatedCredits = result.Attributes.creditsAvailable as number;

    console.log(
      `Credit balance updated for user ${userId}. New balance: ${updatedCredits}`,
    );

    return updatedCredits;
  } catch (error) {
    console.error('Error updating credit balance:', error);
    throw error;
  }
}

/**
 * Get user's current credit balance using only userId
 * @param userId - The user ID (partition key)
 * @returns Promise<number> - The current credit balance
 */
export async function getCreditBalanceByUserId(
  userId: string,
): Promise<number> {
  try {
    console.log(`Getting credit balance for userId: ${userId}`);

    const queryCommand = new QueryCommand({
      TableName: USERS_TABLE_NAME,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
      Limit: 1,
    });

    const result = await docClient.send(queryCommand);

    if (!result.Items || result.Items.length === 0) {
      console.log(`User not found for userId: ${userId}`);
      return 0;
    }

    const user = result.Items[0] as User;
    const currentCredits = user.creditsAvailable || 0;

    console.log(`User ${userId} has ${currentCredits} credits`);

    return currentCredits;
  } catch (error) {
    console.error('Error getting credit balance:', error);
    return 0;
  }
}

/**
 * Add credits to user's balance
 * @param userId - The user ID (partition key)
 * @param username - The username (sort key)
 * @param credits - The credits to add
 * @returns Promise<number> - The updated credit balance
 */
export async function addCredits(
  userId: string,
  username: string,
  credits: number,
): Promise<number> {
  try {
    console.log(
      `Adding ${credits} credits for userId: ${userId}, username: ${username}`,
    );

    const updateCommand = new UpdateCommand({
      TableName: USERS_TABLE_NAME,
      Key: {
        userId: userId,
        username: username,
      },
      UpdateExpression:
        'SET creditsAvailable = if_not_exists(creditsAvailable, :zero) + :credits',
      ExpressionAttributeValues: {
        ':credits': credits,
        ':zero': 0,
      },
      ReturnValues: 'ALL_NEW',
    });

    const result = await docClient.send(updateCommand);

    if (!result.Attributes) {
      throw new Error('Failed to add credits');
    }

    const updatedCredits = result.Attributes.creditsAvailable as number;

    console.log(
      `Credits added for user ${userId} (${username}). New balance: ${updatedCredits}`,
    );

    return updatedCredits;
  } catch (error) {
    console.error('Error adding credits:', error);
    throw error;
  }
}
