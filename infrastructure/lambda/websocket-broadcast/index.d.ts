import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
export declare const handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
declare function broadcastMessage(message: any, domainName: string, stage: string, userId: string): Promise<void>;
export { broadcastMessage };
