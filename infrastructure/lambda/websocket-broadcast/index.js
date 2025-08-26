"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
exports.broadcastMessage = broadcastMessage;
exports.broadcastVideoProgressMessage = broadcastVideoProgressMessage;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const util_dynamodb_1 = require("@aws-sdk/util-dynamodb");
const client_apigatewaymanagementapi_1 = require("@aws-sdk/client-apigatewaymanagementapi");
const dynamodb = new client_dynamodb_1.DynamoDBClient({ region: process.env.AWS_REGION });
const connectionsTableName = process.env.WEBSOCKET_CONNECTIONS_TABLE_NAME;
const handler = async (event) => {
    console.log('WebSocket broadcast event:', JSON.stringify(event, null, 2));
    try {
        const body = JSON.parse(event.body || '{}');
        const { message, userId, domainName, stage } = body;
        if (!message || !userId || !domainName || !stage) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: 'Missing required parameters: message, userId, domainName, stage',
                }),
            };
        }
        // Handle video generation progress messages with specific action mapping
        if (message.action && message.data) {
            await broadcastVideoProgressMessage(message, domainName, stage, userId);
        }
        else {
            // Handle generic messages
            await broadcastMessage(message, domainName, stage, userId);
        }
        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Broadcast completed successfully' }),
        };
    }
    catch (error) {
        console.error('Error in broadcast handler:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal server error' }),
        };
    }
};
exports.handler = handler;
async function broadcastVideoProgressMessage(message, domainName, stage, userId) {
    const endpoint = `https://${domainName}/${stage}`;
    const apiGateway = new client_apigatewaymanagementapi_1.ApiGatewayManagementApiClient({ endpoint });
    try {
        // Use GSI UserIdIndex to query by userId
        console.log(`Querying GSI for userId: ${userId}`);
        const queryParams = {
            TableName: connectionsTableName,
            IndexName: 'UserIdIndex',
            KeyConditionExpression: 'userId = :userId',
            ExpressionAttributeValues: (0, util_dynamodb_1.marshall)({
                ':userId': userId,
            }),
        };
        const result = await dynamodb.send(new client_dynamodb_1.QueryCommand(queryParams));
        console.log('GSI Query result:', JSON.stringify(result, null, 2));
        const connections = result.Items?.map((item) => (0, util_dynamodb_1.unmarshall)(item)) || [];
        console.log(`Found ${connections.length} connections via GSI for userId: ${userId}`);
        console.log(`Broadcasting video progress to ${connections.length} connections for userId: ${userId}`, message);
        // Send message to each connection for the userId
        const promises = connections.map(async (connection) => {
            try {
                await apiGateway.send(new client_apigatewaymanagementapi_1.PostToConnectionCommand({
                    ConnectionId: connection.connectionId,
                    Data: JSON.stringify(message),
                }));
            }
            catch (error) {
                console.error(`Error sending to connection ${connection.connectionId}:`, error);
                // Remove stale connection
                await dynamodb.send(new client_dynamodb_1.DeleteItemCommand({
                    TableName: connectionsTableName,
                    Key: (0, util_dynamodb_1.marshall)({ connectionId: connection.connectionId }),
                }));
            }
        });
        await Promise.all(promises);
    }
    catch (error) {
        console.error('Error broadcasting video progress message:', error);
        throw error;
    }
}
async function broadcastMessage(message, domainName, stage, userId) {
    const endpoint = `https://${domainName}/${stage}`;
    const apiGateway = new client_apigatewaymanagementapi_1.ApiGatewayManagementApiClient({ endpoint });
    try {
        // Use GSI UserIdIndex to query by userId
        console.log(`Querying GSI for userId: ${userId}`);
        const queryParams = {
            TableName: connectionsTableName,
            IndexName: 'UserIdIndex',
            KeyConditionExpression: 'userId = :userId',
            ExpressionAttributeValues: (0, util_dynamodb_1.marshall)({
                ':userId': userId,
            }),
        };
        const result = await dynamodb.send(new client_dynamodb_1.QueryCommand(queryParams));
        console.log('GSI Query result:', JSON.stringify(result, null, 2));
        const connections = result.Items?.map((item) => (0, util_dynamodb_1.unmarshall)(item)) || [];
        console.log(`Found ${connections.length} connections via GSI for userId: ${userId}`);
        console.log(`Broadcasting to ${connections.length} connections for userId: ${userId}`);
        // Send message to each connection for the userId
        const promises = connections.map(async (connection) => {
            try {
                await apiGateway.send(new client_apigatewaymanagementapi_1.PostToConnectionCommand({
                    ConnectionId: connection.connectionId,
                    Data: JSON.stringify(message),
                }));
            }
            catch (error) {
                console.error(`Error sending to connection ${connection.connectionId}:`, error);
                // Remove stale connection
                await dynamodb.send(new client_dynamodb_1.DeleteItemCommand({
                    TableName: connectionsTableName,
                    Key: (0, util_dynamodb_1.marshall)({ connectionId: connection.connectionId }),
                }));
            }
        });
        await Promise.all(promises);
    }
    catch (error) {
        console.error('Error broadcasting message:', error);
        throw error;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFxTlMsNENBQWdCO0FBQUUsc0VBQTZCO0FBcE54RCw4REFJa0M7QUFDbEMsMERBQThEO0FBQzlELDRGQUdpRDtBQTRCakQsTUFBTSxRQUFRLEdBQUcsSUFBSSxnQ0FBYyxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQztBQUN4RSxNQUFNLG9CQUFvQixHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsZ0NBQWlDLENBQUM7QUFFcEUsTUFBTSxPQUFPLEdBQUcsS0FBSyxFQUMxQixLQUEyQixFQUNLLEVBQUU7SUFDbEMsT0FBTyxDQUFDLEdBQUcsQ0FBQyw0QkFBNEIsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUUxRSxJQUFJLENBQUM7UUFDSCxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLENBQUM7UUFDNUMsTUFBTSxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxHQUFHLElBQUksQ0FBQztRQUVwRCxJQUFJLENBQUMsT0FBTyxJQUFJLENBQUMsTUFBTSxJQUFJLENBQUMsVUFBVSxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDakQsT0FBTztnQkFDTCxVQUFVLEVBQUUsR0FBRztnQkFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQztvQkFDbkIsS0FBSyxFQUNILGlFQUFpRTtpQkFDcEUsQ0FBQzthQUNILENBQUM7UUFDSixDQUFDO1FBRUQseUVBQXlFO1FBQ3pFLElBQUksT0FBTyxDQUFDLE1BQU0sSUFBSSxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDbkMsTUFBTSw2QkFB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TyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUM5QixDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsNkJBQTZCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDcEQsTUFBTSxLQUFLLENBQUM7SUFDZCxDQUFDO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEFQSUdhdGV3YXlQcm94eUV2ZW50LCBBUElHYXRld2F5UHJveHlSZXN1bHQgfSBmcm9tICdhd3MtbGFtYmRhJztcbmltcG9ydCB7XG4gIER5bmFtb0RCQ2xpZW50LFxuICBRdWVyeUNvbW1hbmQsXG4gIERlbGV0ZUl0ZW1Db21tYW5kLFxufSBmcm9tICdAYXdzLXNkay9jbGllbnQtZHluYW1vZGInO1xuaW1wb3J0IHsgbWFyc2hhbGwsIHVubWFyc2hhbGwgfSBmcm9tICdAYXdzLXNkay91dGlsLWR5bmFtb2RiJztcbmltcG9ydCB7XG4gIEFwaUdhdGV3YXlNYW5hZ2VtZW50QXBpQ2xpZW50LFxuICBQb3N0VG9Db25uZWN0aW9uQ29tbWFuZCxcbn0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LWFwaWdhdGV3YXltYW5hZ2VtZW50YXBpJztcblxuLy8gVHlwZXMgZm9yIHZpZGVvIGdlbmVyYXRpb24gcHJvZ3Jlc3MgbWVzc2FnZXNcbmludGVyZmFjZSBWaWRlb1Byb2dyZXNzTWVzc2FnZSB7XG4gIGFjdGlvbjpcbiAgICB8ICdzY3JpcHRfY3JlYXRlZCdcbiAgICB8ICdpbWFnZV9jcmVhdGVkJ1xuICAgIHwgJ2F1ZGlvX3N1YnRpdGxlX2NyZWF0ZWQnXG4gICAgfCAndmlkZW9fc2NlbmVfY3JlYXRlZCdcbiAgICB8ICd2aWRlb19jb21wbGV0ZWQnO1xuICBkYXRhOiB7XG4gICAgdXNlcklkOiBzdHJpbmc7XG4gICAgdGltZXN0YW1wOiBzdHJpbmc7XG4gICAgbWVzc2FnZT86IHN0cmluZztcbiAgICBzY2VuZXM/OiBhbnlbXTtcbiAgICBpbWFnZVVybHM/OiBhbnlbXTtcbiAgICBzdWJ0aXRsZVVybHM/OiBhbnlbXTtcbiAgICBuYXJyYXRpb25VcmxzPzogYW55W107XG4gICAgdmlkZW9FZmZlY3RzVXJscz86IGFueVtdO1xuICAgIHZpZGVvS2V5Pzogc3RyaW5nO1xuICAgIFtrZXk6IHN0cmluZ106IGFueTtcbiAgfTtcbn1cblxuaW50ZXJmYWNlIEdlbmVyaWNNZXNzYWdlIHtcbiAgW2tleTogc3RyaW5nXTogYW55O1xufVxuXG5jb25zdCBkeW5hbW9kYiA9IG5ldyBEeW5hbW9EQkNsaWVudCh7IHJlZ2lvbjogcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB9KTtcbmNvbnN0IGNvbm5lY3Rpb25zVGFibGVOYW1lID0gcHJvY2Vzcy5lbnYuV0VCU09DS0VUX0NPTk5FQ1RJT05TX1RBQkxFX05BTUUhO1xuXG5leHBvcnQgY29uc3QgaGFuZGxlciA9IGFzeW5jIChcbiAgZXZlbnQ6IEFQSUdhdGV3YXlQcm94eUV2ZW50LFxuKTogUHJvbWlzZTxBUElHYXRld2F5UHJveHlSZXN1bHQ+ID0+IHtcbiAgY29uc29sZS5sb2coJ1dlYlNvY2tldCBicm9hZGNhc3QgZXZlbnQ6JywgSlNPTi5zdHJpbmdpZnkoZXZlbnQsIG51bGwsIDIpKTtcblxuICB0cnkge1xuICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKGV2ZW50LmJvZHkgfHwgJ3t9Jyk7XG4gICAgY29uc3QgeyBtZXNzYWdlLCB1c2VySWQsIGRvbWFpbk5hbWUsIHN0YWdlIH0gPSBib2R5O1xuXG4gICAgaWYgKCFtZXNzYWdlIHx8ICF1c2VySWQgfHwgIWRvbWFpbk5hbWUgfHwgIXN0YWdlKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBlcnJvcjpcbiAgICAgICAgICAgICdNaXNzaW5nIHJlcXVpcmVkIHBhcmFtZXRlcnM6IG1lc3NhZ2UsIHVzZXJJZCwgZG9tYWluTmFtZSwgc3RhZ2UnLFxuICAgICAgICB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gSGFuZGxlIHZpZGVvIGdlbmVyYXRpb24gcHJvZ3Jlc3MgbWVzc2FnZXMgd2l0aCBzcGVjaWZpYyBhY3Rpb24gbWFwcGluZ1xuICAgIGlmIChtZXNzYWdlLmFjdGlvbiAmJiBtZXNzYWdlLmRhdGEpIHtcbiAgICAgIGF3YWl0IGJyb2FkY2FzdFZpZGVvUHJvZ3Jlc3NNZXNzYWdlKG1lc3NhZ2UsIGRvbWFpbk5hbWUsIHN0YWdlLCB1c2VySWQpO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBIYW5kbGUgZ2VuZXJpYyBtZXNzYWdlc1xuICAgICAgYXdhaXQgYnJvYWRjYXN0TWVzc2FnZShtZXNzYWdlLCBkb21haW5OYW1lLCBzdGFnZSwgdXNlcklkKTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBtZXNzYWdlOiAnQnJvYWRjYXN0IGNvbXBsZXRlZCBzdWNjZXNzZnVsbHknIH0pLFxuICAgIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgaW4gYnJvYWRjYXN0IGhhbmRsZXI6JywgZXJyb3IpO1xuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXNDb2RlOiA1MDAsXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnSW50ZXJuYWwgc2VydmVyIGVycm9yJyB9KSxcbiAgICB9O1xuICB9XG59O1xuXG5hc3luYyBmdW5jdGlvbiBicm9hZGNhc3RWaWRlb1Byb2dyZXNzTWVzc2FnZShcbiAgbWVzc2FnZTogVmlkZW9Qcm9ncmVzc01lc3NhZ2UsXG4gIGRvbWFpbk5hbWU6IHN0cmluZyxcbiAgc3RhZ2U6IHN0cmluZyxcbiAgdXNlcklkOiBzdHJpbmcsXG4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgY29uc3QgZW5kcG9pbnQgPSBgaHR0cHM6Ly8ke2RvbWFpbk5hbWV9LyR7c3RhZ2V9YDtcbiAgY29uc3QgYXBpR2F0ZXdheSA9IG5ldyBBcGlHYXRld2F5TWFuYWdlbWVudEFwaUNsaWVudCh7IGVuZHBvaW50IH0pO1xuXG4gIHRyeSB7XG4gICAgLy8gVXNlIEdTSSBVc2VySWRJbmRleCB0byBxdWVyeSBieSB1c2VySWRcbiAgICBjb25zb2xlLmxvZyhgUXVlcnlpbmcgR1NJIGZvciB1c2VySWQ6ICR7dXNlcklkfWApO1xuICAgIGNvbnN0IHF1ZXJ5UGFyYW1zID0ge1xuICAgICAgVGFibGVOYW1lOiBjb25uZWN0aW9uc1RhYmxlTmFtZSxcbiAgICAgIEluZGV4TmFtZTogJ1VzZXJJZEluZGV4JyxcbiAgICAgIEtleUNvbmRpdGlvbkV4cHJlc3Npb246ICd1c2VySWQgPSA6dXNlcklkJyxcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IG1hcnNoYWxsKHtcbiAgICAgICAgJzp1c2VySWQnOiB1c2VySWQsXG4gICAgICB9KSxcbiAgICB9O1xuXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZHluYW1vZGIuc2VuZChuZXcgUXVlcnlDb21tYW5kKHF1ZXJ5UGFyYW1zKSk7XG4gICAgY29uc29sZS5sb2coJ0dTSSBRdWVyeSByZXN1bHQ6JywgSlNPTi5zdHJpbmdpZnkocmVzdWx0LCBudWxsLCAyKSk7XG5cbiAgICBjb25zdCBjb25uZWN0aW9ucyA9XG4gICAgICByZXN1bHQuSXRlbXM/Lm1hcCgoaXRlbTogYW55KSA9PiB1bm1hcnNoYWxsKGl0ZW0pKSB8fCBbXTtcbiAgICBjb25zb2xlLmxvZyhcbiAgICAgIGBGb3VuZCAke2Nvbm5lY3Rpb25zLmxlbmd0aH0gY29ubmVjdGlvbnMgdmlhIEdTSSBmb3IgdXNlcklkOiAke3VzZXJJZH1gLFxuICAgICk7XG5cbiAgICBjb25zb2xlLmxvZyhcbiAgICAgIGBCcm9hZGNhc3RpbmcgdmlkZW8gcHJvZ3Jlc3MgdG8gJHtjb25uZWN0aW9ucy5sZW5ndGh9IGNvbm5lY3Rpb25zIGZvciB1c2VySWQ6ICR7dXNlcklkfWAsXG4gICAgICBtZXNzYWdlLFxuICAgICk7XG5cbiAgICAvLyBTZW5kIG1lc3NhZ2UgdG8gZWFjaCBjb25uZWN0aW9uIGZvciB0aGUgdXNlcklkXG4gICAgY29uc3QgcHJvbWlzZXMgPSBjb25uZWN0aW9ucy5tYXAoYXN5bmMgKGNvbm5lY3Rpb24pID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IGFwaUdhdGV3YXkuc2VuZChcbiAgICAgICAgICBuZXcgUG9zdFRvQ29ubmVjdGlvbkNvbW1hbmQoe1xuICAgICAgICAgICAgQ29ubmVjdGlvbklkOiBjb25uZWN0aW9uLmNvbm5lY3Rpb25JZCxcbiAgICAgICAgICAgIERhdGE6IEpTT04uc3RyaW5naWZ5KG1lc3NhZ2UpLFxuICAgICAgICAgIH0pLFxuICAgICAgICApO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcbiAgICAgICAgICBgRXJyb3Igc2VuZGluZyB0byBjb25uZWN0aW9uICR7Y29ubmVjdGlvbi5jb25uZWN0aW9uSWR9OmAsXG4gICAgICAgICAgZXJyb3IsXG4gICAgICAgICk7XG4gICAgICAgIC8vIFJlbW92ZSBzdGFsZSBjb25uZWN0aW9uXG4gICAgICAgIGF3YWl0IGR5bmFtb2RiLnNlbmQoXG4gICAgICAgICAgbmV3IERlbGV0ZUl0ZW1Db21tYW5kKHtcbiAgICAgICAgICAgIFRhYmxlTmFtZTogY29ubmVjdGlvbnNUYWJsZU5hbWUsXG4gICAgICAgICAgICBLZXk6IG1hcnNoYWxsKHsgY29ubmVjdGlvbklkOiBjb25uZWN0aW9uLmNvbm5lY3Rpb25JZCB9KSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBicm9hZGNhc3RpbmcgdmlkZW8gcHJvZ3Jlc3MgbWVzc2FnZTonLCBlcnJvcik7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gYnJvYWRjYXN0TWVzc2FnZShcbiAgbWVzc2FnZTogR2VuZXJpY01lc3NhZ2UsXG4gIGRvbWFpbk5hbWU6IHN0cmluZyxcbiAgc3RhZ2U6IHN0cmluZyxcbiAgdXNlcklkOiBzdHJpbmcsXG4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgY29uc3QgZW5kcG9pbnQgPSBgaHR0cHM6Ly8ke2RvbWFpbk5hbWV9LyR7c3RhZ2V9YDtcbiAgY29uc3QgYXBpR2F0ZXdheSA9IG5ldyBBcGlHYXRld2F5TWFuYWdlbWVudEFwaUNsaWVudCh7IGVuZHBvaW50IH0pO1xuXG4gIHRyeSB7XG4gICAgLy8gVXNlIEdTSSBVc2VySWRJbmRleCB0byBxdWVyeSBieSB1c2VySWRcbiAgICBjb25zb2xlLmxvZyhgUXVlcnlpbmcgR1NJIGZvciB1c2VySWQ6ICR7dXNlcklkfWApO1xuICAgIGNvbnN0IHF1ZXJ5UGFyYW1zID0ge1xuICAgICAgVGFibGVOYW1lOiBjb25uZWN0aW9uc1RhYmxlTmFtZSxcbiAgICAgIEluZGV4TmFtZTogJ1VzZXJJZEluZGV4JyxcbiAgICAgIEtleUNvbmRpdGlvbkV4cHJlc3Npb246ICd1c2VySWQgPSA6dXNlcklkJyxcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IG1hcnNoYWxsKHtcbiAgICAgICAgJzp1c2VySWQnOiB1c2VySWQsXG4gICAgICB9KSxcbiAgICB9O1xuXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZHluYW1vZGIuc2VuZChuZXcgUXVlcnlDb21tYW5kKHF1ZXJ5UGFyYW1zKSk7XG4gICAgY29uc29sZS5sb2coJ0dTSSBRdWVyeSByZXN1bHQ6JywgSlNPTi5zdHJpbmdpZnkocmVzdWx0LCBudWxsLCAyKSk7XG5cbiAgICBjb25zdCBjb25uZWN0aW9ucyA9XG4gICAgICByZXN1bHQuSXRlbXM/Lm1hcCgoaXRlbTogYW55KSA9PiB1bm1hcnNoYWxsKGl0ZW0pKSB8fCBbXTtcbiAgICBjb25zb2xlLmxvZyhcbiAgICAgIGBGb3VuZCAke2Nvbm5lY3Rpb25zLmxlbmd0aH0gY29ubmVjdGlvbnMgdmlhIEdTSSBmb3IgdXNlcklkOiAke3VzZXJJZH1gLFxuICAgICk7XG5cbiAgICBjb25zb2xlLmxvZyhcbiAgICAgIGBCcm9hZGNhc3RpbmcgdG8gJHtjb25uZWN0aW9ucy5sZW5ndGh9IGNvbm5lY3Rpb25zIGZvciB1c2VySWQ6ICR7dXNlcklkfWAsXG4gICAgKTtcblxuICAgIC8vIFNlbmQgbWVzc2FnZSB0byBlYWNoIGNvbm5lY3Rpb24gZm9yIHRoZSB1c2VySWRcbiAgICBjb25zdCBwcm9taXNlcyA9IGNvbm5lY3Rpb25zLm1hcChhc3luYyAoY29ubmVjdGlvbikgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgYXBpR2F0ZXdheS5zZW5kKFxuICAgICAgICAgIG5ldyBQb3N0VG9Db25uZWN0aW9uQ29tbWFuZCh7XG4gICAgICAgICAgICBDb25uZWN0aW9uSWQ6IGNvbm5lY3Rpb24uY29ubmVjdGlvbklkLFxuICAgICAgICAgICAgRGF0YTogSlNPTi5zdHJpbmdpZnkobWVzc2FnZSksXG4gICAgICAgICAgfSksXG4gICAgICAgICk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKFxuICAgICAgICAgIGBFcnJvciBzZW5kaW5nIHRvIGNvbm5lY3Rpb24gJHtjb25uZWN0aW9uLmNvbm5lY3Rpb25JZH06YCxcbiAgICAgICAgICBlcnJvcixcbiAgICAgICAgKTtcbiAgICAgICAgLy8gUmVtb3ZlIHN0YWxlIGNvbm5lY3Rpb25cbiAgICAgICAgYXdhaXQgZHluYW1vZGIuc2VuZChcbiAgICAgICAgICBuZXcgRGVsZXRlSXRlbUNvbW1hbmQoe1xuICAgICAgICAgICAgVGFibGVOYW1lOiBjb25uZWN0aW9uc1RhYmxlTmFtZSxcbiAgICAgICAgICAgIEtleTogbWFyc2hhbGwoeyBjb25uZWN0aW9uSWQ6IGNvbm5lY3Rpb24uY29ubmVjdGlvbklkIH0pLFxuICAgICAgICAgIH0pLFxuICAgICAgICApO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgYXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGJyb2FkY2FzdGluZyBtZXNzYWdlOicsIGVycm9yKTtcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufVxuXG4vLyBFeHBvcnQgZm9yIHVzZSBieSBvdGhlciBMYW1iZGEgZnVuY3Rpb25zXG5leHBvcnQgeyBicm9hZGNhc3RNZXNzYWdlLCBicm9hZGNhc3RWaWRlb1Byb2dyZXNzTWVzc2FnZSB9O1xuIl19