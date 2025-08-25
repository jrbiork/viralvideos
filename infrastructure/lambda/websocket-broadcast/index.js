"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
exports.broadcastMessage = broadcastMessage;
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
        await broadcastMessage(message, domainName, stage, userId);
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
async function broadcastMessage(message, domainName, stage, userId) {
    const endpoint = `https://${domainName}/${stage}`;
    const apiGateway = new client_apigatewaymanagementapi_1.ApiGatewayManagementApiClient({ endpoint });
    try {
        // First, let's scan the table to see what connections exist for this userId
        console.log(`Scanning table for userId: ${userId}`);
        const scanParams = {
            TableName: connectionsTableName,
            FilterExpression: 'userId = :userId',
            ExpressionAttributeValues: (0, util_dynamodb_1.marshall)({
                ':userId': userId,
            }),
        };
        const scanResult = await dynamodb.send(new client_dynamodb_1.ScanCommand(scanParams));
        console.log('Scan result:', JSON.stringify(scanResult, null, 2));
        let connections = [];
        if (scanResult.Items && scanResult.Items.length > 0) {
            console.log(`Found ${scanResult.Items.length} connections via scan for userId: ${userId}`);
            connections = scanResult.Items.map((item) => (0, util_dynamodb_1.unmarshall)(item));
        }
        else {
            // Try using the GSI as fallback
            console.log('No connections found via scan, trying GSI...');
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
            connections = result.Items?.map((item) => (0, util_dynamodb_1.unmarshall)(item)) || [];
        }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFxSVMsNENBQWdCO0FBcEl6Qiw4REFLa0M7QUFDbEMsMERBQThEO0FBQzlELDRGQUdpRDtBQUVqRCxNQUFNLFFBQVEsR0FBRyxJQUFJLGdDQUFjLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDO0FBQ3hFLE1BQU0sb0JBQW9CLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxnQ0FBaUMsQ0FBQztBQUVwRSxNQUFNLE9BQU8sR0FBRyxLQUFLLEVBQzFCLEtBQTJCLEVBQ0ssRUFBRTtJQUNsQyxPQUFPLENBQUMsR0FBRyxDQUFDLDRCQUE0QixFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRTFFLElBQUksQ0FBQztRQUNILE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLElBQUksSUFBSSxJQUFJLENBQUMsQ0FBQztRQUM1QyxNQUFNLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLEdBQUcsSUFBSSxDQUFDO1FBRXBELElBQUksQ0FBQyxPQUFPLElBQUksQ0FBQyxNQUFNLElBQUksQ0FBQyxVQUFVLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNqRCxPQUFPO2dCQUNMLFVBQVUsRUFBRSxHQUFHO2dCQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDO29CQUNuQixLQUFLLEVBQ0gsaUVBQWlFO2lCQUNwRSxDQUFDO2FBQ0gsQ0FBQztRQUNKLENBQUM7UUFFRCxNQUFNLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBRTNELE9BQU87WUFDTCxVQUFVLEVBQUUsR0FB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TUFBTSw0QkFBNEIsTUFBTSxFQUFFLENBQzFFLENBQUM7UUFFRixpREFBaUQ7UUFDakQsTUFBTSxRQUFRLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUUsVUFBVSxFQUFFLEVBQUU7WUFDcEQsSUFBSSxDQUFDO2dCQUNILE1BQU0sVUFBVSxDQUFDLElBQUksQ0FDbkIsSUFBSSx3REFBdUIsQ0FBQztvQkFDMUIsWUFBWSxFQUFFLFVBQVUsQ0FBQyxZQUFZO29CQUNyQyxJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUM7aUJBQzlCLENBQUMsQ0FDSCxDQUFDO1lBQ0osQ0FBQztZQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7Z0JBQ2YsT0FBTyxDQUFDLEtBQUssQ0FDWCwrQkFBK0IsVUFBVSxDQUFDLFlBQVksR0FBRyxFQUN6RCxLQUFLLENBQ04sQ0FBQztnQkFDRiwwQkFBMEI7Z0JBQzFCLE1BQU0sUUFBUSxDQUFDLElBQUksQ0FDakIsSUFBSSxtQ0FBaUIsQ0FBQztvQkFDcEIsU0FBUyxFQUFFLG9CQUFvQjtvQkFDL0IsR0FBRyxFQUFFLElBQUEsd0JBQVEsRUFBQyxFQUFFLFlBQVksRUFBRSxVQUFVLENBQUMsWUFBWSxFQUFFLENBQUM7aUJBQ3pELENBQUMsQ0FDSCxDQUFDO1lBQ0osQ0FBQztRQUNILENBQUMsQ0FBQyxDQUFDO1FBRUgsTUFBTSxPQUFPLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQzlCLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyw2QkFBNkIsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNwRCxNQUFNLEtBQUssQ0FBQztJQUNkLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQVBJR2F0ZXdheVByb3h5RXZlbnQsIEFQSUdhdGV3YXlQcm94eVJlc3VsdCB9IGZyb20gJ2F3cy1sYW1iZGEnO1xuaW1wb3J0IHtcbiAgRHluYW1vREJDbGllbnQsXG4gIFF1ZXJ5Q29tbWFuZCxcbiAgRGVsZXRlSXRlbUNvbW1hbmQsXG4gIFNjYW5Db21tYW5kLFxufSBmcm9tICdAYXdzLXNkay9jbGllbnQtZHluYW1vZGInO1xuaW1wb3J0IHsgbWFyc2hhbGwsIHVubWFyc2hhbGwgfSBmcm9tICdAYXdzLXNkay91dGlsLWR5bmFtb2RiJztcbmltcG9ydCB7XG4gIEFwaUdhdGV3YXlNYW5hZ2VtZW50QXBpQ2xpZW50LFxuICBQb3N0VG9Db25uZWN0aW9uQ29tbWFuZCxcbn0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LWFwaWdhdGV3YXltYW5hZ2VtZW50YXBpJztcblxuY29uc3QgZHluYW1vZGIgPSBuZXcgRHluYW1vREJDbGllbnQoeyByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfSk7XG5jb25zdCBjb25uZWN0aW9uc1RhYmxlTmFtZSA9IHByb2Nlc3MuZW52LldFQlNPQ0tFVF9DT05ORUNUSU9OU19UQUJMRV9OQU1FITtcblxuZXhwb3J0IGNvbnN0IGhhbmRsZXIgPSBhc3luYyAoXG4gIGV2ZW50OiBBUElHYXRld2F5UHJveHlFdmVudCxcbik6IFByb21pc2U8QVBJR2F0ZXdheVByb3h5UmVzdWx0PiA9PiB7XG4gIGNvbnNvbGUubG9nKCdXZWJTb2NrZXQgYnJvYWRjYXN0IGV2ZW50OicsIEpTT04uc3RyaW5naWZ5KGV2ZW50LCBudWxsLCAyKSk7XG5cbiAgdHJ5IHtcbiAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShldmVudC5ib2R5IHx8ICd7fScpO1xuICAgIGNvbnN0IHsgbWVzc2FnZSwgdXNlcklkLCBkb21haW5OYW1lLCBzdGFnZSB9ID0gYm9keTtcblxuICAgIGlmICghbWVzc2FnZSB8fCAhdXNlcklkIHx8ICFkb21haW5OYW1lIHx8ICFzdGFnZSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgZXJyb3I6XG4gICAgICAgICAgICAnTWlzc2luZyByZXF1aXJlZCBwYXJhbWV0ZXJzOiBtZXNzYWdlLCB1c2VySWQsIGRvbWFpbk5hbWUsIHN0YWdlJyxcbiAgICAgICAgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIGF3YWl0IGJyb2FkY2FzdE1lc3NhZ2UobWVzc2FnZSwgZG9tYWluTmFtZSwgc3RhZ2UsIHVzZXJJZCk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBtZXNzYWdlOiAnQnJvYWRjYXN0IGNvbXBsZXRlZCBzdWNjZXNzZnVsbHknIH0pLFxuICAgIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgaW4gYnJvYWRjYXN0IGhhbmRsZXI6JywgZXJyb3IpO1xuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXNDb2RlOiA1MDAsXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnSW50ZXJuYWwgc2VydmVyIGVycm9yJyB9KSxcbiAgICB9O1xuICB9XG59O1xuXG5hc3luYyBmdW5jdGlvbiBicm9hZGNhc3RNZXNzYWdlKFxuICBtZXNzYWdlOiBhbnksXG4gIGRvbWFpbk5hbWU6IHN0cmluZyxcbiAgc3RhZ2U6IHN0cmluZyxcbiAgdXNlcklkOiBzdHJpbmcsXG4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgY29uc3QgZW5kcG9pbnQgPSBgaHR0cHM6Ly8ke2RvbWFpbk5hbWV9LyR7c3RhZ2V9YDtcbiAgY29uc3QgYXBpR2F0ZXdheSA9IG5ldyBBcGlHYXRld2F5TWFuYWdlbWVudEFwaUNsaWVudCh7IGVuZHBvaW50IH0pO1xuXG4gIHRyeSB7XG4gICAgLy8gRmlyc3QsIGxldCdzIHNjYW4gdGhlIHRhYmxlIHRvIHNlZSB3aGF0IGNvbm5lY3Rpb25zIGV4aXN0IGZvciB0aGlzIHVzZXJJZFxuICAgIGNvbnNvbGUubG9nKGBTY2FubmluZyB0YWJsZSBmb3IgdXNlcklkOiAke3VzZXJJZH1gKTtcbiAgICBjb25zdCBzY2FuUGFyYW1zID0ge1xuICAgICAgVGFibGVOYW1lOiBjb25uZWN0aW9uc1RhYmxlTmFtZSxcbiAgICAgIEZpbHRlckV4cHJlc3Npb246ICd1c2VySWQgPSA6dXNlcklkJyxcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IG1hcnNoYWxsKHtcbiAgICAgICAgJzp1c2VySWQnOiB1c2VySWQsXG4gICAgICB9KSxcbiAgICB9O1xuXG4gICAgY29uc3Qgc2NhblJlc3VsdCA9IGF3YWl0IGR5bmFtb2RiLnNlbmQobmV3IFNjYW5Db21tYW5kKHNjYW5QYXJhbXMpKTtcbiAgICBjb25zb2xlLmxvZygnU2NhbiByZXN1bHQ6JywgSlNPTi5zdHJpbmdpZnkoc2NhblJlc3VsdCwgbnVsbCwgMikpO1xuXG4gICAgbGV0IGNvbm5lY3Rpb25zOiBhbnlbXSA9IFtdO1xuXG4gICAgaWYgKHNjYW5SZXN1bHQuSXRlbXMgJiYgc2NhblJlc3VsdC5JdGVtcy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgYEZvdW5kICR7c2NhblJlc3VsdC5JdGVtcy5sZW5ndGh9IGNvbm5lY3Rpb25zIHZpYSBzY2FuIGZvciB1c2VySWQ6ICR7dXNlcklkfWAsXG4gICAgICApO1xuICAgICAgY29ubmVjdGlvbnMgPSBzY2FuUmVzdWx0Lkl0ZW1zLm1hcCgoaXRlbTogYW55KSA9PiB1bm1hcnNoYWxsKGl0ZW0pKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gVHJ5IHVzaW5nIHRoZSBHU0kgYXMgZmFsbGJhY2tcbiAgICAgIGNvbnNvbGUubG9nKCdObyBjb25uZWN0aW9ucyBmb3VuZCB2aWEgc2NhbiwgdHJ5aW5nIEdTSS4uLicpO1xuICAgICAgY29uc3QgcXVlcnlQYXJhbXMgPSB7XG4gICAgICAgIFRhYmxlTmFtZTogY29ubmVjdGlvbnNUYWJsZU5hbWUsXG4gICAgICAgIEluZGV4TmFtZTogJ1VzZXJJZEluZGV4JyxcbiAgICAgICAgS2V5Q29uZGl0aW9uRXhwcmVzc2lvbjogJ3VzZXJJZCA9IDp1c2VySWQnLFxuICAgICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiBtYXJzaGFsbCh7XG4gICAgICAgICAgJzp1c2VySWQnOiB1c2VySWQsXG4gICAgICAgIH0pLFxuICAgICAgfTtcblxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZHluYW1vZGIuc2VuZChuZXcgUXVlcnlDb21tYW5kKHF1ZXJ5UGFyYW1zKSk7XG4gICAgICBjb25zb2xlLmxvZygnR1NJIFF1ZXJ5IHJlc3VsdDonLCBKU09OLnN0cmluZ2lmeShyZXN1bHQsIG51bGwsIDIpKTtcbiAgICAgIGNvbm5lY3Rpb25zID0gcmVzdWx0Lkl0ZW1zPy5tYXAoKGl0ZW06IGFueSkgPT4gdW5tYXJzaGFsbChpdGVtKSkgfHwgW107XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coXG4gICAgICBgQnJvYWRjYXN0aW5nIHRvICR7Y29ubmVjdGlvbnMubGVuZ3RofSBjb25uZWN0aW9ucyBmb3IgdXNlcklkOiAke3VzZXJJZH1gLFxuICAgICk7XG5cbiAgICAvLyBTZW5kIG1lc3NhZ2UgdG8gZWFjaCBjb25uZWN0aW9uIGZvciB0aGUgdXNlcklkXG4gICAgY29uc3QgcHJvbWlzZXMgPSBjb25uZWN0aW9ucy5tYXAoYXN5bmMgKGNvbm5lY3Rpb24pID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IGFwaUdhdGV3YXkuc2VuZChcbiAgICAgICAgICBuZXcgUG9zdFRvQ29ubmVjdGlvbkNvbW1hbmQoe1xuICAgICAgICAgICAgQ29ubmVjdGlvbklkOiBjb25uZWN0aW9uLmNvbm5lY3Rpb25JZCxcbiAgICAgICAgICAgIERhdGE6IEpTT04uc3RyaW5naWZ5KG1lc3NhZ2UpLFxuICAgICAgICAgIH0pLFxuICAgICAgICApO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcbiAgICAgICAgICBgRXJyb3Igc2VuZGluZyB0byBjb25uZWN0aW9uICR7Y29ubmVjdGlvbi5jb25uZWN0aW9uSWR9OmAsXG4gICAgICAgICAgZXJyb3IsXG4gICAgICAgICk7XG4gICAgICAgIC8vIFJlbW92ZSBzdGFsZSBjb25uZWN0aW9uXG4gICAgICAgIGF3YWl0IGR5bmFtb2RiLnNlbmQoXG4gICAgICAgICAgbmV3IERlbGV0ZUl0ZW1Db21tYW5kKHtcbiAgICAgICAgICAgIFRhYmxlTmFtZTogY29ubmVjdGlvbnNUYWJsZU5hbWUsXG4gICAgICAgICAgICBLZXk6IG1hcnNoYWxsKHsgY29ubmVjdGlvbklkOiBjb25uZWN0aW9uLmNvbm5lY3Rpb25JZCB9KSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBicm9hZGNhc3RpbmcgbWVzc2FnZTonLCBlcnJvcik7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn1cblxuLy8gRXhwb3J0IGZvciB1c2UgYnkgb3RoZXIgTGFtYmRhIGZ1bmN0aW9uc1xuZXhwb3J0IHsgYnJvYWRjYXN0TWVzc2FnZSB9O1xuIl19