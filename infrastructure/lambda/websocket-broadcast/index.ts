import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  DynamoDBClient,
  QueryCommand,
  DeleteItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';

// Types for video generation progress messages
interface VideoProgressMessage {
  action:
    | 'script_created'
    | 'image_created'
    | 'audio_subtitle_created'
    | 'video_scene_created'
    | 'video_completed';
  data: {
    userId: string;
    timestamp: string;
    message?: string;
    scenes?: any[];
    imageUrls?: any[];
    subtitleUrls?: any[];
    narrationUrls?: any[];
    videoEffectsUrls?: any[];
    videoKey?: string;
    [key: string]: any;
  };
}

interface GenericMessage {
  [key: string]: any;
}

const dynamodb = new DynamoDBClient({ region: process.env.AWS_REGION });
const connectionsTableName = process.env.WEBSOCKET_CONNECTIONS_TABLE_NAME!;

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  console.log('WebSocket broadcast event:', JSON.stringify(event, null, 2));

  try {
    const body = JSON.parse(event.body || '{}');
    const { message, userId, domainName, stage } = body;

    if (!message || !userId || !domainName || !stage) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error:
            'Missing required parameters: message, userId, domainName, stage',
        }),
      };
    }

    // Handle video generation progress messages with specific action mapping
    if (message.action && message.data) {
      await broadcastVideoProgressMessage(message, domainName, stage, userId);
    } else {
      // Handle generic messages
      await broadcastMessage(message, domainName, stage, userId);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Broadcast completed successfully' }),
    };
  } catch (error) {
    console.error('Error in broadcast handler:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};

async function broadcastVideoProgressMessage(
  message: VideoProgressMessage,
  domainName: string,
  stage: string,
  userId: string,
): Promise<void> {
  const endpoint = `https://${domainName}/${stage}`;
  const apiGateway = new ApiGatewayManagementApiClient({ endpoint });

  try {
    // Use GSI UserIdIndex to query by userId
    console.log(`Querying GSI for userId: ${userId}`);
    const queryParams = {
      TableName: connectionsTableName,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: marshall({
        ':userId': userId,
      }),
    };

    const result = await dynamodb.send(new QueryCommand(queryParams));
    console.log('GSI Query result:', JSON.stringify(result, null, 2));

    const connections =
      result.Items?.map((item: any) => unmarshall(item)) || [];
    console.log(
      `Found ${connections.length} connections via GSI for userId: ${userId}`,
    );

    console.log(
      `Broadcasting video progress to ${connections.length} connections for userId: ${userId}`,
      message,
    );

    // Send message to each connection for the userId
    const promises = connections.map(async (connection) => {
      try {
        await apiGateway.send(
          new PostToConnectionCommand({
            ConnectionId: connection.connectionId,
            Data: JSON.stringify(message),
          }),
        );
      } catch (error) {
        console.error(
          `Error sending to connection ${connection.connectionId}:`,
          error,
        );
        // Remove stale connection
        await dynamodb.send(
          new DeleteItemCommand({
            TableName: connectionsTableName,
            Key: marshall({ connectionId: connection.connectionId }),
          }),
        );
      }
    });

    await Promise.all(promises);
  } catch (error) {
    console.error('Error broadcasting video progress message:', error);
    throw error;
  }
}

async function broadcastMessage(
  message: GenericMessage,
  domainName: string,
  stage: string,
  userId: string,
): Promise<void> {
  const endpoint = `https://${domainName}/${stage}`;
  const apiGateway = new ApiGatewayManagementApiClient({ endpoint });

  try {
    // Use GSI UserIdIndex to query by userId
    console.log(`Querying GSI for userId: ${userId}`);
    const queryParams = {
      TableName: connectionsTableName,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: marshall({
        ':userId': userId,
      }),
    };

    const result = await dynamodb.send(new QueryCommand(queryParams));
    console.log('GSI Query result:', JSON.stringify(result, null, 2));

    const connections =
      result.Items?.map((item: any) => unmarshall(item)) || [];
    console.log(
      `Found ${connections.length} connections via GSI for userId: ${userId}`,
    );

    console.log(
      `Broadcasting to ${connections.length} connections for userId: ${userId}`,
    );

    // Send message to each connection for the userId
    const promises = connections.map(async (connection) => {
      try {
        await apiGateway.send(
          new PostToConnectionCommand({
            ConnectionId: connection.connectionId,
            Data: JSON.stringify(message),
          }),
        );
      } catch (error) {
        console.error(
          `Error sending to connection ${connection.connectionId}:`,
          error,
        );
        // Remove stale connection
        await dynamodb.send(
          new DeleteItemCommand({
            TableName: connectionsTableName,
            Key: marshall({ connectionId: connection.connectionId }),
          }),
        );
      }
    });

    await Promise.all(promises);
  } catch (error) {
    console.error('Error broadcasting message:', error);
    throw error;
  }
}

// Export for use by other Lambda functions
export { broadcastMessage, broadcastVideoProgressMessage };
