import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const docClient = DynamoDBDocumentClient.from(client);

const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME || 'viral-videos-users';

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  console.log('Get user API received:', event);

  try {
    // Extract user info from query parameters
    let userId: string;
    let username: string;

    if (!event.queryStringParameters) {
      console.error('No query parameters found');
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'Query parameters are required' }),
      };
    }

    userId = event.queryStringParameters.userId || '';
    username = event.queryStringParameters.username || '';

    if (!userId) {
      console.error(
        'Missing required userId in query parameters:',
        event.queryStringParameters,
      );
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          error: 'userId is required in query parameters',
        }),
      };
    }

    console.log('Received query parameters:', {
      userId,
      username,
    });

    // Handle GET requests only
    if (event.httpMethod !== 'GET') {
      return {
        statusCode: 405,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'Method not allowed' }),
      };
    }

    return await handleGetUser(userId, username);
  } catch (error) {
    console.error('Get user error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};

async function handleGetUser(
  userId: string,
  username: string,
): Promise<APIGatewayProxyResult> {
  const getCommand = new GetCommand({
    TableName: USERS_TABLE_NAME,
    Key: {
      userId: userId,
      username: username,
    },
  });

  const result = await docClient.send(getCommand);

  // No additional validation needed since we're using the composite key (userId + username)
  // If the item exists, it means both userId and username match

  if (!result.Item) {
    return {
      statusCode: 404,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ error: 'User not found' }),
    };
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      success: true,
      user: result.Item,
    }),
  };
}
