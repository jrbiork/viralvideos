import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  DynamoDBClient,
  QueryCommand,
  DeleteItemCommand,
  ScanCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';

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

    await broadcastMessage(message, domainName, stage, userId);

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

async function broadcastMessage(
  message: any,
  domainName: string,
  stage: string,
  userId: string,
): Promise<void> {
  const endpoint = `https://${domainName}/${stage}`;
  const apiGateway = new ApiGatewayManagementApiClient({ endpoint });

  try {
    // First, let's scan the table to see what connections exist for this userId
    console.log(`Scanning table for userId: ${userId}`);
    const scanParams = {
      TableName: connectionsTableName,
      FilterExpression: 'userId = :userId',
      ExpressionAttributeValues: marshall({
        ':userId': userId,
      }),
    };

    const scanResult = await dynamodb.send(new ScanCommand(scanParams));
    console.log('Scan result:', JSON.stringify(scanResult, null, 2));

    let connections: any[] = [];

    if (scanResult.Items && scanResult.Items.length > 0) {
      console.log(
        `Found ${scanResult.Items.length} connections via scan for userId: ${userId}`,
      );
      connections = scanResult.Items.map((item: any) => unmarshall(item));
    } else {
      // Try using the GSI as fallback
      console.log('No connections found via scan, trying GSI...');
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
      connections = result.Items?.map((item: any) => unmarshall(item)) || [];
    }

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
export { broadcastMessage };
