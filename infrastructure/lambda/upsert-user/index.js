"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client = new client_dynamodb_1.DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1',
});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(client);
const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME || 'viral-videos-users';
const handler = async (event) => {
    console.log('Upsert user API received:', event);
    try {
        // Extract user info from the request body
        let userId;
        let username;
        let email;
        let name;
        let picture;
        if (!event.body) {
            console.error('No request body found');
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ error: 'Request body is required' }),
            };
        }
        const requestBody = JSON.parse(event.body);
        userId = requestBody.userId;
        username = requestBody.username;
        email = requestBody.email;
        name = requestBody.name;
        picture = requestBody.picture;
        if (!userId || !username || !email) {
            console.error('Missing required user info in request body:', requestBody);
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    error: 'userId, username, and email are required in request body',
                }),
            };
        }
        // Handle POST requests only
        if (event.httpMethod !== 'POST') {
            return {
                statusCode: 405,
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ error: 'Method not allowed' }),
            };
        }
        const now = new Date().toISOString();
        return await handleCreateOrUpdateUser(userId, username, email, name, picture, now);
    }
    catch (error) {
        console.error('Upsert user error:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ error: 'Internal server error' }),
        };
    }
};
exports.handler = handler;
async function handleCreateOrUpdateUser(userId, username, email, name, picture, now) {
    // Check if user already exists
    const getCommand = new lib_dynamodb_1.GetCommand({
        TableName: USERS_TABLE_NAME,
        Key: {
            userId: userId,
            username: username,
        },
    });
    const existingUser = await docClient.send(getCommand);
    if (existingUser.Item) {
        // User exists, update lastLoginAt and name/picture if provided
        let updateExpression = 'SET lastLoginAt = :lastLoginAt';
        const expressionAttributeValues = {
            ':lastLoginAt': now,
        };
        const expressionAttributeNames = {};
        if (name) {
            updateExpression += ', #name = :name';
            expressionAttributeValues[':name'] = name;
            expressionAttributeNames['#name'] = 'name';
        }
        if (picture) {
            updateExpression += ', #picture = :picture';
            expressionAttributeValues[':picture'] = picture;
            expressionAttributeNames['#picture'] = 'picture';
        }
        const updateCommand = new lib_dynamodb_1.UpdateCommand({
            TableName: USERS_TABLE_NAME,
            Key: {
                userId: userId,
                username: username,
            },
            UpdateExpression: updateExpression,
            ExpressionAttributeValues: expressionAttributeValues,
            ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
            ReturnValues: 'ALL_NEW',
        });
        const result = await docClient.send(updateCommand);
        console.log('User updated in DynamoDB:', {
            userId,
            username,
            email,
            lastLoginAt: now,
            creditsAvailable: result.Attributes?.creditsAvailable,
        });
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                success: true,
                user: result.Attributes,
                action: 'updated',
            }),
        };
    }
    else {
        // User doesn't exist, create new user
        const putCommand = new lib_dynamodb_1.PutCommand({
            TableName: USERS_TABLE_NAME,
            Item: {
                userId: userId,
                username: username,
                email: email,
                name: name,
                picture: picture,
                createdAt: now,
                lastLoginAt: now,
                creditsAvailable: 10,
                lastPaymentAt: null,
                subscription: {
                    mode: 'free',
                    renewalDate: null,
                    status: 'active',
                },
            },
        });
        await docClient.send(putCommand);
        console.log('New user created in DynamoDB:', {
            userId,
            username,
            email,
            name,
            picture,
            createdAt: now,
            lastLoginAt: now,
            creditsAvailable: 10,
        });
        return {
            statusCode: 201,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                success: true,
                user: {
                    userId: userId,
                    username: username,
                    email: email,
                    name: name,
                    picture: picture,
                    createdAt: now,
                    lastLoginAt: now,
                    creditsAvailable: 10,
                    subscription: {
                        mode: 'free',
                        renewalDate: null,
                        status: 'active',
                    },
                },
                action: 'created',
            }),
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSw4REFBMEQ7QUFDMUQsd0RBSytCO0FBRS9CLE1BQU0sTUFBTSxHQUFHLElBQUksZ0NBQWMsQ0FBQztJQUNoQyxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLElBQUksV0FBVztDQUM5QyxDQUFDLENBQUM7QUFFSCxNQUFNLFNBQVMsR0FBRyxxQ0FBc0IsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7QUFFdEQsTUFBTSxnQkFBZ0IsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGdCQUFnQixJQUFJLG9CQUFvQixDQUFDO0FBVXZFLE1BQU0sT0FBTyxHQUFHLEtBQUssRUFDMUIsS0FBMkIsRUFDSyxFQUFFO0lBQ2xDLE9BQU8sQ0FBQyxHQUFHLENBQUMsMkJBQTJCLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFFaEQsSUFBSSxDQUFDO1FBQ0gsMENBQTBDO1FBQzFDLElBQUksTUFBYyxDQUFDO1FBQ25CLElBQUksUUFBZ0IsQ0FBQztRQUNyQixJQUFJLEtBQWEsQ0FBQztRQUNsQixJQUFJLElBQXdCLENBQUM7UUFDN0IsSUFBSSxPQUEyQixDQUFDO1FBRWhDLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDaEIsT0FBTyxDQUFDLEtBQUssQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1lBQ3ZDLE9BQU87Z0JBQ0wsVUFBVSxFQUFFLEdBQUc7Z0JBQ2YsT0FBTyxFQUFFO29CQUNQLGNBQWMsRUFBRSxrQkFBa0I7aUJBQ25DO2dCQUNELElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsS0FBSyxFQUFFLDBCQUEwQixFQUFFLENBQUM7YUFDNUQsQ0FBQztRQUNKLENBQUM7UUFFRCxNQUFNLFdBQVcsR0FBZ0IsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENB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QUNaLElBQUksRUFBRSxNQUFNO3dCQUNaLFdBQVcsRUFBRSxJQUFJO3dCQUNqQixNQUFNLEVBQUUsUUFBUTtxQkFDakI7aUJBQ0Y7Z0JBQ0QsTUFBTSxFQUFFLFNBQVM7YUFDbEIsQ0FBQztTQUNILENBQUM7SUFDSixDQUFDO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEFQSUdhdGV3YXlQcm94eUV2ZW50LCBBUElHYXRld2F5UHJveHlSZXN1bHQgfSBmcm9tICdhd3MtbGFtYmRhJztcbmltcG9ydCB7IER5bmFtb0RCQ2xpZW50IH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LWR5bmFtb2RiJztcbmltcG9ydCB7XG4gIER5bmFtb0RCRG9jdW1lbnRDbGllbnQsXG4gIFB1dENvbW1hbmQsXG4gIEdldENvbW1hbmQsXG4gIFVwZGF0ZUNvbW1hbmQsXG59IGZyb20gJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYic7XG5cbmNvbnN0IGNsaWVudCA9IG5ldyBEeW5hbW9EQkNsaWVudCh7XG4gIHJlZ2lvbjogcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB8fCAndXMtZWFzdC0xJyxcbn0pO1xuXG5jb25zdCBkb2NDbGllbnQgPSBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LmZyb20oY2xpZW50KTtcblxuY29uc3QgVVNFUlNfVEFCTEVfTkFNRSA9IHByb2Nlc3MuZW52LlVTRVJTX1RBQkxFX05BTUUgfHwgJ3ZpcmFsLXZpZGVvcy11c2Vycyc7XG5cbmludGVyZmFjZSBSZXF1ZXN0Qm9keSB7XG4gIHVzZXJJZDogc3RyaW5nO1xuICB1c2VybmFtZTogc3RyaW5nO1xuICBlbWFpbDogc3RyaW5nO1xuICBuYW1lPzogc3RyaW5nO1xuICBwaWN0dXJlPzogc3RyaW5nO1xufVxuXG5leHBvcnQgY29uc3QgaGFuZGxlciA9IGFzeW5jIChcbiAgZXZlbnQ6IEFQSUdhdGV3YXlQcm94eUV2ZW50LFxuKTogUHJvbWlzZTxBUElHYXRld2F5UHJveHlSZXN1bHQ+ID0+IHtcbiAgY29uc29sZS5sb2coJ1Vwc2VydCB1c2VyIEFQSSByZWNlaXZlZDonLCBldmVudCk7XG5cbiAgdHJ5IHtcbiAgICAvLyBFeHRyYWN0IHVzZXIgaW5mbyBmcm9tIHRoZSByZXF1ZXN0IGJvZHlcbiAgICBsZXQgdXNlcklkOiBzdHJpbmc7XG4gICAgbGV0IHVzZXJuYW1lOiBzdHJpbmc7XG4gICAgbGV0IGVtYWlsOiBzdHJpbmc7XG4gICAgbGV0IG5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICBsZXQgcGljdHVyZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG4gICAgaWYgKCFldmVudC5ib2R5KSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdObyByZXF1ZXN0IGJvZHkgZm91bmQnKTtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgIH0sXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdSZXF1ZXN0IGJvZHkgaXMgcmVxdWlyZWQnIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBjb25zdCByZXF1ZXN0Qm9keTogUmVxdWVzdEJvZHkgPSBKU09OLnBhcnNlKGV2ZW50LmJvZHkpO1xuICAgIHVzZXJJZCA9IHJlcXVlc3RCb2R5LnVzZXJJZDtcbiAgICB1c2VybmFtZSA9IHJlcXVlc3RCb2R5LnVzZXJuYW1lO1xuICAgIGVtYWlsID0gcmVxdWVzdEJvZHkuZW1haWw7XG4gICAgbmFtZSA9IHJlcXVlc3RCb2R5Lm5hbWU7XG4gICAgcGljdHVyZSA9IHJlcXVlc3RCb2R5LnBpY3R1cmU7XG5cbiAgICBpZiAoIXVzZXJJZCB8fCAhdXNlcm5hbWUgfHwgIWVtYWlsKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdNaXNzaW5nIHJlcXVpcmVkIHVzZXIgaW5mbyBpbiByZXF1ZXN0IGJvZHk6JywgcmVxdWVzdEJvZHkpO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgfSxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIGVycm9yOiAndXNlcklkLCB1c2VybmFtZSwgYW5kIGVtYWlsIGFyZSByZXF1aXJlZCBpbiByZXF1ZXN0IGJvZHknLFxuICAgICAgICB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gSGFuZGxlIFBPU1QgcmVxdWVzdHMgb25seVxuICAgIGlmIChldmVudC5odHRwTWV0aG9kICE9PSAnUE9TVCcpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwNSxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgIH0sXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdNZXRob2Qgbm90IGFsbG93ZWQnIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XG4gICAgcmV0dXJuIGF3YWl0IGhhbmRsZUNyZWF0ZU9yVXBkYXRlVXNlcih1c2VySWQsIHVzZXJuYW1lLCBlbWFpbCwgbmFtZSwgcGljdHVyZSwgbm93KTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdVcHNlcnQgdXNlciBlcnJvcjonLCBlcnJvcik7XG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDUwMCxcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgIH0sXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnSW50ZXJuYWwgc2VydmVyIGVycm9yJyB9KSxcbiAgICB9O1xuICB9XG59O1xuXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVDcmVhdGVPclVwZGF0ZVVzZXIoXG4gIHVzZXJJZDogc3RyaW5nLFxuICB1c2VybmFtZTogc3RyaW5nLFxuICBlbWFpbDogc3RyaW5nLFxuICBuYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQsXG4gIHBpY3R1cmU6IHN0cmluZyB8IHVuZGVmaW5lZCxcbiAgbm93OiBzdHJpbmcsXG4pOiBQcm9taXNlPEFQSUdhdGV3YXlQcm94eVJlc3VsdD4ge1xuICAvLyBDaGVjayBpZiB1c2VyIGFscmVhZHkgZXhpc3RzXG4gIGNvbnN0IGdldENvbW1hbmQgPSBuZXcgR2V0Q29tbWFuZCh7XG4gICAgVGFibGVOYW1lOiBVU0VSU19UQUJMRV9OQU1FLFxuICAgIEtleToge1xuICAgICAgdXNlcklkOiB1c2VySWQsXG4gICAgICB1c2VybmFtZTogdXNlcm5hbWUsXG4gICAgfSxcbiAgfSk7XG5cbiAgY29uc3QgZXhpc3RpbmdVc2VyID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQoZ2V0Q29tbWFuZCk7XG5cbiAgaWYgKGV4aXN0aW5nVXNlci5JdGVtKSB7XG4gICAgLy8gVXNlciBleGlzdHMsIHVwZGF0ZSBsYXN0TG9naW5BdCBhbmQgbmFtZS9waWN0dXJlIGlmIHByb3ZpZGVkXG4gICAgbGV0IHVwZGF0ZUV4cHJlc3Npb24gPSAnU0VUIGxhc3RMb2dpbkF0ID0gOmxhc3RMb2dpbkF0JztcbiAgICBjb25zdCBleHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiBhbnkgPSB7XG4gICAgICAnOmxhc3RMb2dpbkF0Jzogbm93LFxuICAgIH07XG4gICAgY29uc3QgZXhwcmVzc2lvbkF0dHJpYnV0ZU5hbWVzOiBhbnkgPSB7fTtcblxuICAgIGlmIChuYW1lKSB7XG4gICAgICB1cGRhdGVFeHByZXNzaW9uICs9ICcsICNuYW1lID0gOm5hbWUnO1xuICAgICAgZXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlc1snOm5hbWUnXSA9IG5hbWU7XG4gICAgICBleHByZXNzaW9uQXR0cmlidXRlTmFtZXNbJyNuYW1lJ10gPSAnbmFtZSc7XG4gICAgfVxuXG4gICAgaWYgKHBpY3R1cmUpIHtcbiAgICAgIHVwZGF0ZUV4cHJlc3Npb24gKz0gJywgI3BpY3R1cmUgPSA6cGljdHVyZSc7XG4gICAgICBleHByZXNzaW9uQXR0cmlidXRlVmFsdWVzWyc6cGljdHVyZSddID0gcGljdHVyZTtcbiAgICAgIGV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lc1snI3BpY3R1cmUnXSA9ICdwaWN0dXJlJztcbiAgICB9XG5cbiAgICBjb25zdCB1cGRhdGVDb21tYW5kID0gbmV3IFVwZGF0ZUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiBVU0VSU19UQUJMRV9OQU1FLFxuICAgICAgS2V5OiB7XG4gICAgICAgIHVzZXJJZDogdXNlcklkLFxuICAgICAgICB1c2VybmFtZTogdXNlcm5hbWUsXG4gICAgICB9LFxuICAgICAgVXBkYXRlRXhwcmVzc2lvbjogdXBkYXRlRXhwcmVzc2lvbixcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IGV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXMsXG4gICAgICBFeHByZXNzaW9uQXR0cmlidXRlTmFtZXM6IE9iamVjdC5rZXlzKGV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lcykubGVuZ3RoID4gMCA/IGV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lcyA6IHVuZGVmaW5lZCxcbiAgICAgIFJldHVyblZhbHVlczogJ0FMTF9ORVcnLFxuICAgIH0pO1xuXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQodXBkYXRlQ29tbWFuZCk7XG5cbiAgICBjb25zb2xlLmxvZygnVXNlciB1cGRhdGVkIGluIER5bmFtb0RCOicsIHtcbiAgICAgIHVzZXJJZCxcbiAgICAgIHVzZXJuYW1lLFxuICAgICAgZW1haWwsXG4gICAgICBsYXN0TG9naW5BdDogbm93LFxuICAgICAgY3JlZGl0c0F2YWlsYWJsZTogcmVzdWx0LkF0dHJpYnV0ZXM/LmNyZWRpdHNBdmFpbGFibGUsXG4gICAgfSk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgfSxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgdXNlcjogcmVzdWx0LkF0dHJpYnV0ZXMsXG4gICAgICAgIGFjdGlvbjogJ3VwZGF0ZWQnLFxuICAgICAgfSksXG4gICAgfTtcbiAgfSBlbHNlIHtcbiAgICAvLyBVc2VyIGRvZXNuJ3QgZXhpc3QsIGNyZWF0ZSBuZXcgdXNlclxuICAgIGNvbnN0IHB1dENvbW1hbmQgPSBuZXcgUHV0Q29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IFVTRVJTX1RBQkxFX05BTUUsXG4gICAgICBJdGVtOiB7XG4gICAgICAgIHVzZXJJZDogdXNlcklkLFxuICAgICAgICB1c2VybmFtZTogdXNlcm5hbWUsXG4gICAgICAgIGVtYWlsOiBlbWFpbCxcbiAgICAgICAgbmFtZTogbmFtZSxcbiAgICAgICAgcGljdHVyZTogcGljdHVyZSxcbiAgICAgICAgY3JlYXRlZEF0OiBub3csXG4gICAgICAgIGxhc3RMb2dpbkF0OiBub3csXG4gICAgICAgIGNyZWRpdHNBdmFpbGFibGU6IDEwLFxuICAgICAgICBsYXN0UGF5bWVudEF0OiBudWxsLFxuICAgICAgICBzdWJzY3JpcHRpb246IHtcbiAgICAgICAgICBtb2RlOiAnZnJlZScsXG4gICAgICAgICAgcmVuZXdhbERhdGU6IG51bGwsXG4gICAgICAgICAgc3RhdHVzOiAnYWN0aXZlJyxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBhd2FpdCBkb2NDbGllbnQuc2VuZChwdXRDb21tYW5kKTtcblxuICAgIGNvbnNvbGUubG9nKCdOZXcgdXNlciBjcmVhdGVkIGluIER5bmFtb0RCOicsIHtcbiAgICAgIHVzZXJJZCxcbiAgICAgIHVzZXJuYW1lLFxuICAgICAgZW1haWwsXG4gICAgICBuYW1lLFxuICAgICAgcGljdHVyZSxcbiAgICAgIGNyZWF0ZWRBdDogbm93LFxuICAgICAgbGFzdExvZ2luQXQ6IG5vdyxcbiAgICAgIGNyZWRpdHNBdmFpbGFibGU6IDEwLFxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDIwMSxcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgIH0sXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIHVzZXI6IHtcbiAgICAgICAgICB1c2VySWQ6IHVzZXJJZCxcbiAgICAgICAgICB1c2VybmFtZTogdXNlcm5hbWUsXG4gICAgICAgICAgZW1haWw6IGVtYWlsLFxuICAgICAgICAgIG5hbWU6IG5hbWUsXG4gICAgICAgICAgcGljdHVyZTogcGljdHVyZSxcbiAgICAgICAgICBjcmVhdGVkQXQ6IG5vdyxcbiAgICAgICAgICBsYXN0TG9naW5BdDogbm93LFxuICAgICAgICAgIGNyZWRpdHNBdmFpbGFibGU6IDEwLFxuICAgICAgICAgIHN1YnNjcmlwdGlvbjoge1xuICAgICAgICAgICAgbW9kZTogJ2ZyZWUnLFxuICAgICAgICAgICAgcmVuZXdhbERhdGU6IG51bGwsXG4gICAgICAgICAgICBzdGF0dXM6ICdhY3RpdmUnLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIGFjdGlvbjogJ2NyZWF0ZWQnLFxuICAgICAgfSksXG4gICAgfTtcbiAgfVxufVxuIl19