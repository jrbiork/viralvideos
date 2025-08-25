import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient, DeleteItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';

const dynamodb = new DynamoDBClient({ region: process.env.AWS_REGION });
const connectionsTableName = process.env.WEBSOCKET_CONNECTIONS_TABLE_NAME!;

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  console.log('WebSocket disconnect event:', JSON.stringify(event, null, 2));

  const connectionId = event.requestContext.connectionId!;

  try {
    // Remove connection from DynamoDB
    await dynamodb.send(
      new DeleteItemCommand({
        TableName: connectionsTableName,
        Key: marshall({
          connectionId,
        }),
      }),
    );

    console.log(`Connection ${connectionId} removed from database`);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Disconnected successfully' }),
    };
  } catch (error) {
    console.error('Error during disconnect:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Error during disconnect' }),
    };
  }
};
