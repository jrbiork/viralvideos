import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const docClient = DynamoDBDocumentClient.from(client);

const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME || 'viral-videos-users';

interface User {
  userId: string;
  username: string;
  creditsAvailable: number;
  [key: string]: any;
}

/**
 * Check if user has sufficient credit balance
 * @param userId - The user ID (partition key)
 * @param username - The username (sort key)
 * @param costToPay - The costToPay to check against
 * @returns Promise<boolean> - True if user has sufficient credits, false otherwise
 */
export async function hasSufficientCredits(
  userId: string,
  username: string,
  costToPay: number,
): Promise<boolean> {
  try {
    console.log(
      `Checking credit balance for userId: ${userId}, username: ${username}, costToPay: ${costToPay}`,
    );

    const getCommand = new GetCommand({
      TableName: USERS_TABLE_NAME,
      Key: {
        userId: userId,
        username: username,
      },
    });

    const result = await docClient.send(getCommand);

    if (!result.Item) {
      console.log(
        `User not found for userId: ${userId}, username: ${username}`,
      );
      return false;
    }

    const user = result.Item as User;
    const currentCredits = user.creditsAvailable || 0;

    console.log(
      `User ${userId} (${username}) has ${currentCredits} credits, required: ${costToPay}`,
    );

    return currentCredits >= costToPay;
  } catch (error) {
    console.error('Error checking credit balance:', error);
    return false;
  }
}

/**
 * Update user's credit balance by deducting the costToPay
 * @param userId - The user ID (partition key)
 * @param username - The username (sort key)
 * @param costToPay - The costToPay to deduct
 * @returns Promise<number> - The updated credit balance
 */
export async function updateCreditBalance(
  userId: string,
  username: string,
  costToPay: number,
): Promise<number> {
  try {
    console.log(
      `Updating credit balance for userId: ${userId}, username: ${username}, deducting: ${costToPay}`,
    );

    // First check if user has sufficient credits
    const hasCredits = await hasSufficientCredits(userId, username, costToPay);

    if (!hasCredits) {
      throw new Error(`Insufficient credits for user ${userId} (${username})`);
    }

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
      `Credit balance updated for user ${userId} (${username}). New balance: ${updatedCredits}`,
    );

    return updatedCredits;
  } catch (error) {
    console.error('Error updating credit balance:', error);
    throw error;
  }
}

/**
 * Get user's current credit balance
 * @param userId - The user ID (partition key)
 * @param username - The username (sort key)
 * @returns Promise<number> - The current credit balance
 */
export async function getCreditBalance(
  userId: string,
  username: string,
): Promise<number> {
  try {
    console.log(
      `Getting credit balance for userId: ${userId}, username: ${username}`,
    );

    const getCommand = new GetCommand({
      TableName: USERS_TABLE_NAME,
      Key: {
        userId: userId,
        username: username,
      },
    });

    const result = await docClient.send(getCommand);

    if (!result.Item) {
      console.log(
        `User not found for userId: ${userId}, username: ${username}`,
      );
      return 0;
    }

    const user = result.Item as User;
    const currentCredits = user.creditsAvailable || 0;

    console.log(`User ${userId} (${username}) has ${currentCredits} credits`);

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
