import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  console.log('WebSocket message event:', JSON.stringify(event, null, 2));

  const connectionId = event.requestContext.connectionId!;
  const messageBody = event.body || '{}';

  try {
    // Parse the incoming message
    const message = JSON.parse(messageBody);
    console.log('Received message:', message);

    // Handle different message types
    switch (message.action) {
      case 'ping':
        return await sendMessage(
          connectionId,
          {
            action: 'pong',
            timestamp: new Date().toISOString(),
          },
          event,
        );

      default:
        return await sendMessage(
          connectionId,
          {
            action: 'error',
            message: 'Unknown action',
          },
          event,
        );
    }
  } catch (error) {
    console.error('Error processing message:', error);
    return await sendMessage(
      connectionId,
      {
        action: 'error',
        message: 'Error processing message',
      },
      event,
    );
  }
};

async function sendMessage(
  connectionId: string,
  message: any,
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const domainName = event.requestContext.domainName!;
  const stage = event.requestContext.stage!;
  const endpoint = `https://${domainName}/${stage}`;
  const apiGateway = new ApiGatewayManagementApiClient({ endpoint });

  try {
    await apiGateway.send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: JSON.stringify(message),
      }),
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Message sent successfully' }),
    };
  } catch (error) {
    console.error('Error sending message:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Error sending message' }),
    };
  }
}
