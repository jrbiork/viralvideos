"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const util_dynamodb_1 = require("@aws-sdk/util-dynamodb");
const dynamodb = new client_dynamodb_1.DynamoDBClient({ region: process.env.AWS_REGION });
const connectionsTableName = process.env.WEBSOCKET_CONNECTIONS_TABLE_NAME;
const handler = async (event) => {
    console.log('WebSocket disconnect event:', JSON.stringify(event, null, 2));
    const connectionId = event.requestContext.connectionId;
    try {
        // Remove connection from DynamoDB
        await dynamodb.send(new client_dynamodb_1.DeleteItemCommand({
            TableName: connectionsTableName,
            Key: (0, util_dynamodb_1.marshall)({
                connectionId,
            }),
        }));
        console.log(`Connection ${connectionId} removed from database`);
        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Disconnected successfully' }),
        };
    }
    catch (error) {
        console.error('Error during disconnect:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Error during disconnect' }),
        };
    }
};
exports.handler = handler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSw4REFBNkU7QUFDN0UsMERBQWtEO0FBRWxELE1BQU0sUUFBUSxHQUFHLElBQUksZ0NBQWMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUM7QUFDeEUsTUFBTSxvQkFBb0IsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGdDQUFpQyxDQUFDO0FBRXBFLE1BQU0sT0FBTyxHQUFHLEtBQUssRUFDMUIsS0FBMkIsRUFDSyxFQUFFO0lBQ2xDLE9BQU8sQ0FBQyxHQUFHLENBQUMsNkJBQTZCLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFM0UsTUFBTSxZQUFZLEdBQUcsS0FBSyxDQUFDLGNBQWMsQ0FBQyxZQUFhLENBQUM7SUFFeEQsSUFBSSxDQUFDO1FBQ0gsa0NBQWtDO1FBQ2xDLE1BQU0sUUFBUSxDQUFDLElBQUksQ0FDakIsSUFBSSxtQ0FBaUIsQ0FBQztZQUNwQixTQUFTLEVBQUUsb0JBQW9CO1lBQy9CLEdBQUcsRUFBRSxJQUFBLHdCQUFRLEVBQUM7Z0JBQ1osWUFBWTthQUNiLENBQUM7U0FDSCxDQUFDLENBQ0gsQ0FBQztRQUVGLE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBYyxZQUFZLHdCQUF3QixDQUFDLENBQUM7UUFFaEUsT0FBTztZQUNMLFVBQVUsRUFBRSxHQUFHO1lBQ2YsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsQ0FBQztTQUMvRCxDQUFDO0lBQ0osQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLDBCQUEwQixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ2pELE9BQU87WUFDTCxVQUFVLEVBQUUsR0FBRztZQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsT0FBTyxFQUFFLHlCQUF5QixFQUFFLENBQUM7U0FDN0QsQ0FBQztJQUNKLENBQUM7QUFDSCxDQUFDLENBQUM7QUEvQlcsUUFBQSxPQUFPLFdBK0JsQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEFQSUdhdGV3YXlQcm94eUV2ZW50LCBBUElHYXRld2F5UHJveHlSZXN1bHQgfSBmcm9tICdhd3MtbGFtYmRhJztcbmltcG9ydCB7IER5bmFtb0RCQ2xpZW50LCBEZWxldGVJdGVtQ29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1keW5hbW9kYic7XG5pbXBvcnQgeyBtYXJzaGFsbCB9IGZyb20gJ0Bhd3Mtc2RrL3V0aWwtZHluYW1vZGInO1xuXG5jb25zdCBkeW5hbW9kYiA9IG5ldyBEeW5hbW9EQkNsaWVudCh7IHJlZ2lvbjogcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB9KTtcbmNvbnN0IGNvbm5lY3Rpb25zVGFibGVOYW1lID0gcHJvY2Vzcy5lbnYuV0VCU09DS0VUX0NPTk5FQ1RJT05TX1RBQkxFX05BTUUhO1xuXG5leHBvcnQgY29uc3QgaGFuZGxlciA9IGFzeW5jIChcbiAgZXZlbnQ6IEFQSUdhdGV3YXlQcm94eUV2ZW50LFxuKTogUHJvbWlzZTxBUElHYXRld2F5UHJveHlSZXN1bHQ+ID0+IHtcbiAgY29uc29sZS5sb2coJ1dlYlNvY2tldCBkaXNjb25uZWN0IGV2ZW50OicsIEpTT04uc3RyaW5naWZ5KGV2ZW50LCBudWxsLCAyKSk7XG5cbiAgY29uc3QgY29ubmVjdGlvbklkID0gZXZlbnQucmVxdWVzdENvbnRleHQuY29ubmVjdGlvbklkITtcblxuICB0cnkge1xuICAgIC8vIFJlbW92ZSBjb25uZWN0aW9uIGZyb20gRHluYW1vREJcbiAgICBhd2FpdCBkeW5hbW9kYi5zZW5kKFxuICAgICAgbmV3IERlbGV0ZUl0ZW1Db21tYW5kKHtcbiAgICAgICAgVGFibGVOYW1lOiBjb25uZWN0aW9uc1RhYmxlTmFtZSxcbiAgICAgICAgS2V5OiBtYXJzaGFsbCh7XG4gICAgICAgICAgY29ubmVjdGlvbklkLFxuICAgICAgICB9KSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICBjb25zb2xlLmxvZyhgQ29ubmVjdGlvbiAke2Nvbm5lY3Rpb25JZH0gcmVtb3ZlZCBmcm9tIGRhdGFiYXNlYCk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBtZXNzYWdlOiAnRGlzY29ubmVjdGVkIHN1Y2Nlc3NmdWxseScgfSksXG4gICAgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBkdXJpbmcgZGlzY29ubmVjdDonLCBlcnJvcik7XG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDUwMCxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgbWVzc2FnZTogJ0Vycm9yIGR1cmluZyBkaXNjb25uZWN0JyB9KSxcbiAgICB9O1xuICB9XG59O1xuIl19