import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const docClient = DynamoDBDocumentClient.from(client);

const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME || 'viral-videos-users';

interface RequestBody {
  userId: string;
  username: string;
  email: string;
  name?: string;
}

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  console.log('Upsert user API received:', event);

  try {
    // Extract user info from the request body
    let userId: string;
    let username: string;
    let email: string;
    let name: string | undefined;

    if (!event.body) {
      console.error('No request body found');
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'Request body is required' }),
      };
    }

    const requestBody: RequestBody = JSON.parse(event.body);
    userId = requestBody.userId;
    username = requestBody.username;
    email = requestBody.email;
    name = requestBody.name;

    if (!userId || !username || !email) {
      console.error('Missing required user info in request body:', requestBody);
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          error: 'userId, username, and email are required in request body',
        }),
      };
    }

    // Handle POST requests only
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'Method not allowed' }),
      };
    }

    const now = new Date().toISOString();
    return await handleCreateOrUpdateUser(userId, username, email, name, now);
  } catch (error) {
    console.error('Upsert user error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};

async function handleCreateOrUpdateUser(
  userId: string,
  username: string,
  email: string,
  name: string | undefined,
  now: string,
): Promise<APIGatewayProxyResult> {
  // Check if user already exists
  const getCommand = new GetCommand({
    TableName: USERS_TABLE_NAME,
    Key: {
      userId: userId,
      username: username,
    },
  });

  const existingUser = await docClient.send(getCommand);

  if (existingUser.Item) {
    // User exists, update lastLoginAt and name if provided
    let updateExpression = 'SET lastLoginAt = :lastLoginAt';
    const expressionAttributeValues: any = {
      ':lastLoginAt': now,
    };

    if (name) {
      updateExpression += ', #name = :name';
      expressionAttributeValues[':name'] = name;
    }

    const updateCommand = new UpdateCommand({
      TableName: USERS_TABLE_NAME,
      Key: {
        userId: userId,
        username: username,
      },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ExpressionAttributeNames: name ? { '#name': 'name' } : undefined,
      ReturnValues: 'ALL_NEW',
    });

    const result = await docClient.send(updateCommand);

    console.log('User updated in DynamoDB:', {
      userId,
      username,
      email,
      lastLoginAt: now,
      creditsAvailable: result.Attributes?.creditsAvailable,
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        success: true,
        user: result.Attributes,
        action: 'updated',
      }),
    };
  } else {
    // User doesn't exist, create new user
    const putCommand = new PutCommand({
      TableName: USERS_TABLE_NAME,
      Item: {
        userId: userId,
        username: username,
        email: email,
        name: name,
        createdAt: now,
        lastLoginAt: now,
        creditsAvailable: 10,
        plan: 'free',
        lastPaymentAt: null,
        subscription: {
          mode: 'free',
          renewalDate: null,
          status: 'active',
        },
      },
    });

    await docClient.send(putCommand);

    console.log('New user created in DynamoDB:', {
      userId,
      username,
      email,
      name,
      createdAt: now,
      lastLoginAt: now,
      creditsAvailable: 10,
    });

    return {
      statusCode: 201,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        success: true,
        user: {
          userId: userId,
          username: username,
          email: email,
          name: name,
          createdAt: now,
          lastLoginAt: now,
          creditsAvailable: 10,
          subscription: {
            mode: 'free',
            renewalDate: null,
            status: 'active',
          },
        },
        action: 'created',
      }),
    };
  }
}
