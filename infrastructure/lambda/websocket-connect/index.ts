import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const dynamodb = new DynamoDBClient({ region: process.env.AWS_REGION });
const lambda = new LambdaClient({ region: process.env.AWS_REGION });
const connectionsTableName = process.env.WEBSOCKET_CONNECTIONS_TABLE_NAME!;
const usersTableName = process.env.USERS_TABLE_NAME!;
const jwtAuthorizerLambdaArn = process.env.JWT_AUTHORIZER_LAMBDA_ARN!;

interface JWTPayload {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  exp: number;
  iat: number;
  iss: string;
  aud: string;
  token_use: string;
  auth_time: number;
  username?: string;
  [key: string]: any;
}

async function validateTokenWithAuthorizer(
  token: string,
): Promise<JWTPayload | null> {
  try {
    // Create a mock API Gateway authorizer event
    const authorizerEvent = {
      authorizationToken: `Bearer ${token}`,
      methodArn:
        'arn:aws:execute-api:us-east-1:123456789012:api-id/prod/GET/resource', // Mock ARN
    };

    // Invoke the JWT authorizer lambda
    const command = new InvokeCommand({
      FunctionName: jwtAuthorizerLambdaArn,
      Payload: JSON.stringify(authorizerEvent),
    });

    const response = await lambda.send(command);

    if (response.StatusCode !== 200) {
      console.error(
        'JWT authorizer lambda failed with status:',
        response.StatusCode,
      );
      return null;
    }

    const payload = JSON.parse(new TextDecoder().decode(response.Payload!));

    if (payload.errorMessage) {
      console.error('JWT authorizer error:', payload.errorMessage);
      return null;
    }

    // Extract user information from the authorizer context
    const context = payload.context;
    if (!context || !context.userId) {
      console.error('No user context in authorizer response');
      return null;
    }

    // Create a JWTPayload object from the authorizer context
    const jwtPayload: JWTPayload = {
      sub: context.userId,
      email: context.email || '',
      name: context.name || '',
      picture: context.picture || '',
      exp: Math.floor(Date.now() / 1000) + 3600, // Mock expiration
      iat: Math.floor(Date.now() / 1000),
      iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_xxx',
      aud: process.env.COGNITO_CLIENT_ID || '',
      token_use: 'access',
      auth_time: Math.floor(Date.now() / 1000),
      username: context.email || context.name || 'unknown',
    };

    return jwtPayload;
  } catch (error) {
    console.error('Error calling JWT authorizer:', error);
    return null;
  }
}

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  console.log('WebSocket connect event:', JSON.stringify(event, null, 2));

  const connectionId = event.requestContext.connectionId!;
  const queryParams = event.queryStringParameters || {};
  const token = queryParams.token;

  if (!token) {
    console.log('No token provided, rejecting connection');
    return {
      statusCode: 401,
      body: JSON.stringify({ message: 'No authentication token provided' }),
    };
  }

  try {
    // Validate the JWT token using the JWT authorizer lambda
    const payload = await validateTokenWithAuthorizer(token);

    if (!payload) {
      console.log('Invalid JWT token, rejecting connection');
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Invalid authentication token' }),
      };
    }

    const userId = payload.sub;
    const username = payload.username || payload.email || 'unknown';

    // Validate required fields
    if (!userId) {
      console.log('Invalid token payload - missing sub, rejecting connection');
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Invalid token payload' }),
      };
    }

    // Store connection in DynamoDB
    const connectionItem = {
      connectionId,
      userId,
      username: username || 'unknown',
      connectedAt: new Date().toISOString(),
      ttl: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24 hours TTL
    };

    await dynamodb.send(
      new PutItemCommand({
        TableName: connectionsTableName,
        Item: marshall(connectionItem),
      }),
    );

    console.log(
      `Connection ${connectionId} established for user ${userId} (${
        username || 'unknown'
      })`,
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Connected successfully',
        userId,
        username: username || 'unknown',
      }),
    };
  } catch (error) {
    console.error('Error during connection:', error);
    return {
      statusCode: 401,
      body: JSON.stringify({ message: 'Invalid authentication token' }),
    };
  }
};
