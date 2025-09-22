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
        return await handleCreateOrUpdateUser(userId, username, email, name, now);
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
async function handleCreateOrUpdateUser(userId, username, email, name, now) {
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
        // User exists, update lastLoginAt and name if provided
        let updateExpression = 'SET lastLoginAt = :lastLoginAt';
        const expressionAttributeValues = {
            ':lastLoginAt': now,
        };
        if (name) {
            updateExpression += ', #name = :name';
            expressionAttributeValues[':name'] = name;
        }
        const updateCommand = new lib_dynamodb_1.UpdateCommand({
            TableName: USERS_TABLE_NAME,
            Key: {
                userId: userId,
                username: username,
            },
            UpdateExpression: updateExpression,
            ExpressionAttributeValues: expressionAttributeValues,
            ExpressionAttributeNames: name ? { '#name': 'name' } : undefined,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSw4REFBMEQ7QUFDMUQsd0RBSytCO0FBRS9CLE1BQU0sTUFBTSxHQUFHLElBQUksZ0NBQWMsQ0FBQztJQUNoQyxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLElBQUksV0FBVztDQUM5QyxDQUFDLENBQUM7QUFFSCxNQUFNLFNBQVMsR0FBRyxxQ0FBc0IsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7QUFFdEQsTUFBTSxnQkFBZ0IsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGdCQUFnQixJQUFJLG9CQUFvQixDQUFDO0FBU3ZFLE1BQU0sT0FBTyxHQUFHLEtBQUssRUFDMUIsS0FBMkIsRUFDSyxFQUFFO0lBQ2xDLE9BQU8sQ0FBQyxHQUFHLENBQUMsMkJBQTJCLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFFaEQsSUFBSSxDQUFDO1FBQ0gsMENBQTBDO1FBQzFDLElBQUksTUFBYyxDQUFDO1FBQ25CLElBQUksUUFBZ0IsQ0FBQztRQUNyQixJQUFJLEtBQWEsQ0FBQztRQUNsQixJQUFJLElBQXdCLENBQUM7UUFFN0IsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNoQixPQUFPLENBQUMsS0FBSyxDQUFDLHVCQUF1QixDQUFDLENBQUM7WUFDdkMsT0FBTztnQkFDTCxVQUFVLEVBQUUsR0FBRztnQkFDZixPQUFPLEVBQUU7b0JBQ1AsY0FBYyxFQUFFLGtCQUFrQjtpQkFDbkM7Z0JBQ0QsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxLQUFLLEVBQUUsMEJBQTBCLEVBQUUsQ0FBQzthQUM1RCxDQUFDO1FBQ0osQ0FBQztRQUVELE1BQU0sV0FBVyxHQUFnQixJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN4RCxNQUFNLEdBQUcsV0FB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U0FBUyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUVqQyxPQUFPLENBQUMsR0FBRyxDQUFDLCtCQUErQixFQUFFO1lBQzNDLE1BQU07WUFDTixRQUFRO1lBQ1IsS0FBSztZQUNMLElBQUk7WUFDSixTQUFTLEVBQUUsR0FBRztZQUNkLFdBQVcsRUFBRSxHQUFHO1lBQ2hCLGdCQUFnQixFQUFFLEVBQUU7U0FDckIsQ0FBQyxDQUFDO1FBRUgsT0FBTztZQUNMLFVBQVUsRUFBRSxHQUFHO1lBQ2YsT0FBTyxFQUFFO2dCQUNQLGNBQWMsRUFBRSxrQkFBa0I7YUFDbkM7WUFDRCxJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQztnQkFDbkIsT0FBTyxFQUFFLElBQUk7Z0JBQ2IsSUFBSSxFQUFFO29CQUNKLE1BQU0sRUFBRSxNQUFNO29CQUNkLFFBQVEsRUFBRSxRQUFRO29CQUNsQixLQUFLLEVBQUUsS0FBSztvQkFDWixJQUFJLEVBQUUsSUFBSTtvQkFDVixTQUFTLEVBQUUsR0FBRztvQkFDZCxXQUFXLEVBQUUsR0FBRztvQkFDaEIsZ0JBQWdCLEVBQUUsRUFBRTtvQkFDcEIsWUFBWSxFQUFFO3dCQUNaLElBQUksRUFBRSxNQUFNO3dCQUNaLFdBQVcsRUFBRSxJQUFJO3dCQUNqQixNQUFNLEVBQUUsUUFBUTtxQkFDakI7aUJBQ0Y7Z0JBQ0QsTUFBTSxFQUFFLFNBQVM7YUFDbEIsQ0FBQztTQUNILENBQUM7SUFDSixDQUFDO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEFQSUdhdGV3YXlQcm94eUV2ZW50LCBBUElHYXRld2F5UHJveHlSZXN1bHQgfSBmcm9tICdhd3MtbGFtYmRhJztcbmltcG9ydCB7IER5bmFtb0RCQ2xpZW50IH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LWR5bmFtb2RiJztcbmltcG9ydCB7XG4gIER5bmFtb0RCRG9jdW1lbnRDbGllbnQsXG4gIFB1dENvbW1hbmQsXG4gIEdldENvbW1hbmQsXG4gIFVwZGF0ZUNvbW1hbmQsXG59IGZyb20gJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYic7XG5cbmNvbnN0IGNsaWVudCA9IG5ldyBEeW5hbW9EQkNsaWVudCh7XG4gIHJlZ2lvbjogcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB8fCAndXMtZWFzdC0xJyxcbn0pO1xuXG5jb25zdCBkb2NDbGllbnQgPSBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LmZyb20oY2xpZW50KTtcblxuY29uc3QgVVNFUlNfVEFCTEVfTkFNRSA9IHByb2Nlc3MuZW52LlVTRVJTX1RBQkxFX05BTUUgfHwgJ3ZpcmFsLXZpZGVvcy11c2Vycyc7XG5cbmludGVyZmFjZSBSZXF1ZXN0Qm9keSB7XG4gIHVzZXJJZDogc3RyaW5nO1xuICB1c2VybmFtZTogc3RyaW5nO1xuICBlbWFpbDogc3RyaW5nO1xuICBuYW1lPzogc3RyaW5nO1xufVxuXG5leHBvcnQgY29uc3QgaGFuZGxlciA9IGFzeW5jIChcbiAgZXZlbnQ6IEFQSUdhdGV3YXlQcm94eUV2ZW50LFxuKTogUHJvbWlzZTxBUElHYXRld2F5UHJveHlSZXN1bHQ+ID0+IHtcbiAgY29uc29sZS5sb2coJ1Vwc2VydCB1c2VyIEFQSSByZWNlaXZlZDonLCBldmVudCk7XG5cbiAgdHJ5IHtcbiAgICAvLyBFeHRyYWN0IHVzZXIgaW5mbyBmcm9tIHRoZSByZXF1ZXN0IGJvZHlcbiAgICBsZXQgdXNlcklkOiBzdHJpbmc7XG4gICAgbGV0IHVzZXJuYW1lOiBzdHJpbmc7XG4gICAgbGV0IGVtYWlsOiBzdHJpbmc7XG4gICAgbGV0IG5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuICAgIGlmICghZXZlbnQuYm9keSkge1xuICAgICAgY29uc29sZS5lcnJvcignTm8gcmVxdWVzdCBib2R5IGZvdW5kJyk7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICB9LFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnUmVxdWVzdCBib2R5IGlzIHJlcXVpcmVkJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3QgcmVxdWVzdEJvZHk6IFJlcXVlc3RCb2R5ID0gSlNPTi5wYXJzZShldmVudC5ib2R5KTtcbiAgICB1c2VySWQgPSByZXF1ZXN0Qm9keS51c2VySWQ7XG4gICAgdXNlcm5hbWUgPSByZXF1ZXN0Qm9keS51c2VybmFtZTtcbiAgICBlbWFpbCA9IHJlcXVlc3RCb2R5LmVtYWlsO1xuICAgIG5hbWUgPSByZXF1ZXN0Qm9keS5uYW1lO1xuXG4gICAgaWYgKCF1c2VySWQgfHwgIXVzZXJuYW1lIHx8ICFlbWFpbCkge1xuICAgICAgY29uc29sZS5lcnJvcignTWlzc2luZyByZXF1aXJlZCB1c2VyIGluZm8gaW4gcmVxdWVzdCBib2R5OicsIHJlcXVlc3RCb2R5KTtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgIH0sXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBlcnJvcjogJ3VzZXJJZCwgdXNlcm5hbWUsIGFuZCBlbWFpbCBhcmUgcmVxdWlyZWQgaW4gcmVxdWVzdCBib2R5JyxcbiAgICAgICAgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIEhhbmRsZSBQT1NUIHJlcXVlc3RzIG9ubHlcbiAgICBpZiAoZXZlbnQuaHR0cE1ldGhvZCAhPT0gJ1BPU1QnKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDUsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICB9LFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnTWV0aG9kIG5vdCBhbGxvd2VkJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xuICAgIHJldHVybiBhd2FpdCBoYW5kbGVDcmVhdGVPclVwZGF0ZVVzZXIodXNlcklkLCB1c2VybmFtZSwgZW1haWwsIG5hbWUsIG5vdyk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignVXBzZXJ0IHVzZXIgZXJyb3I6JywgZXJyb3IpO1xuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXNDb2RlOiA1MDAsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICB9LFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ0ludGVybmFsIHNlcnZlciBlcnJvcicgfSksXG4gICAgfTtcbiAgfVxufTtcblxuYXN5bmMgZnVuY3Rpb24gaGFuZGxlQ3JlYXRlT3JVcGRhdGVVc2VyKFxuICB1c2VySWQ6IHN0cmluZyxcbiAgdXNlcm5hbWU6IHN0cmluZyxcbiAgZW1haWw6IHN0cmluZyxcbiAgbmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkLFxuICBub3c6IHN0cmluZyxcbik6IFByb21pc2U8QVBJR2F0ZXdheVByb3h5UmVzdWx0PiB7XG4gIC8vIENoZWNrIGlmIHVzZXIgYWxyZWFkeSBleGlzdHNcbiAgY29uc3QgZ2V0Q29tbWFuZCA9IG5ldyBHZXRDb21tYW5kKHtcbiAgICBUYWJsZU5hbWU6IFVTRVJTX1RBQkxFX05BTUUsXG4gICAgS2V5OiB7XG4gICAgICB1c2VySWQ6IHVzZXJJZCxcbiAgICAgIHVzZXJuYW1lOiB1c2VybmFtZSxcbiAgICB9LFxuICB9KTtcblxuICBjb25zdCBleGlzdGluZ1VzZXIgPSBhd2FpdCBkb2NDbGllbnQuc2VuZChnZXRDb21tYW5kKTtcblxuICBpZiAoZXhpc3RpbmdVc2VyLkl0ZW0pIHtcbiAgICAvLyBVc2VyIGV4aXN0cywgdXBkYXRlIGxhc3RMb2dpbkF0IGFuZCBuYW1lIGlmIHByb3ZpZGVkXG4gICAgbGV0IHVwZGF0ZUV4cHJlc3Npb24gPSAnU0VUIGxhc3RMb2dpbkF0ID0gOmxhc3RMb2dpbkF0JztcbiAgICBjb25zdCBleHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiBhbnkgPSB7XG4gICAgICAnOmxhc3RMb2dpbkF0Jzogbm93LFxuICAgIH07XG5cbiAgICBpZiAobmFtZSkge1xuICAgICAgdXBkYXRlRXhwcmVzc2lvbiArPSAnLCAjbmFtZSA9IDpuYW1lJztcbiAgICAgIGV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXNbJzpuYW1lJ10gPSBuYW1lO1xuICAgIH1cblxuICAgIGNvbnN0IHVwZGF0ZUNvbW1hbmQgPSBuZXcgVXBkYXRlQ29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IFVTRVJTX1RBQkxFX05BTUUsXG4gICAgICBLZXk6IHtcbiAgICAgICAgdXNlcklkOiB1c2VySWQsXG4gICAgICAgIHVzZXJuYW1lOiB1c2VybmFtZSxcbiAgICAgIH0sXG4gICAgICBVcGRhdGVFeHByZXNzaW9uOiB1cGRhdGVFeHByZXNzaW9uLFxuICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczogZXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlcyxcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lczogbmFtZSA/IHsgJyNuYW1lJzogJ25hbWUnIH0gOiB1bmRlZmluZWQsXG4gICAgICBSZXR1cm5WYWx1ZXM6ICdBTExfTkVXJyxcbiAgICB9KTtcblxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKHVwZGF0ZUNvbW1hbmQpO1xuXG4gICAgY29uc29sZS5sb2coJ1VzZXIgdXBkYXRlZCBpbiBEeW5hbW9EQjonLCB7XG4gICAgICB1c2VySWQsXG4gICAgICB1c2VybmFtZSxcbiAgICAgIGVtYWlsLFxuICAgICAgbGFzdExvZ2luQXQ6IG5vdyxcbiAgICAgIGNyZWRpdHNBdmFpbGFibGU6IHJlc3VsdC5BdHRyaWJ1dGVzPy5jcmVkaXRzQXZhaWxhYmxlLFxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgIH0sXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIHVzZXI6IHJlc3VsdC5BdHRyaWJ1dGVzLFxuICAgICAgICBhY3Rpb246ICd1cGRhdGVkJyxcbiAgICAgIH0pLFxuICAgIH07XG4gIH0gZWxzZSB7XG4gICAgLy8gVXNlciBkb2Vzbid0IGV4aXN0LCBjcmVhdGUgbmV3IHVzZXJcbiAgICBjb25zdCBwdXRDb21tYW5kID0gbmV3IFB1dENvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiBVU0VSU19UQUJMRV9OQU1FLFxuICAgICAgSXRlbToge1xuICAgICAgICB1c2VySWQ6IHVzZXJJZCxcbiAgICAgICAgdXNlcm5hbWU6IHVzZXJuYW1lLFxuICAgICAgICBlbWFpbDogZW1haWwsXG4gICAgICAgIG5hbWU6IG5hbWUsXG4gICAgICAgIGNyZWF0ZWRBdDogbm93LFxuICAgICAgICBsYXN0TG9naW5BdDogbm93LFxuICAgICAgICBjcmVkaXRzQXZhaWxhYmxlOiAxMCxcbiAgICAgICAgbGFzdFBheW1lbnRBdDogbnVsbCxcbiAgICAgICAgc3Vic2NyaXB0aW9uOiB7XG4gICAgICAgICAgbW9kZTogJ2ZyZWUnLFxuICAgICAgICAgIHJlbmV3YWxEYXRlOiBudWxsLFxuICAgICAgICAgIHN0YXR1czogJ2FjdGl2ZScsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgYXdhaXQgZG9jQ2xpZW50LnNlbmQocHV0Q29tbWFuZCk7XG5cbiAgICBjb25zb2xlLmxvZygnTmV3IHVzZXIgY3JlYXRlZCBpbiBEeW5hbW9EQjonLCB7XG4gICAgICB1c2VySWQsXG4gICAgICB1c2VybmFtZSxcbiAgICAgIGVtYWlsLFxuICAgICAgbmFtZSxcbiAgICAgIGNyZWF0ZWRBdDogbm93LFxuICAgICAgbGFzdExvZ2luQXQ6IG5vdyxcbiAgICAgIGNyZWRpdHNBdmFpbGFibGU6IDEwLFxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDIwMSxcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgIH0sXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIHVzZXI6IHtcbiAgICAgICAgICB1c2VySWQ6IHVzZXJJZCxcbiAgICAgICAgICB1c2VybmFtZTogdXNlcm5hbWUsXG4gICAgICAgICAgZW1haWw6IGVtYWlsLFxuICAgICAgICAgIG5hbWU6IG5hbWUsXG4gICAgICAgICAgY3JlYXRlZEF0OiBub3csXG4gICAgICAgICAgbGFzdExvZ2luQXQ6IG5vdyxcbiAgICAgICAgICBjcmVkaXRzQXZhaWxhYmxlOiAxMCxcbiAgICAgICAgICBzdWJzY3JpcHRpb246IHtcbiAgICAgICAgICAgIG1vZGU6ICdmcmVlJyxcbiAgICAgICAgICAgIHJlbmV3YWxEYXRlOiBudWxsLFxuICAgICAgICAgICAgc3RhdHVzOiAnYWN0aXZlJyxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICBhY3Rpb246ICdjcmVhdGVkJyxcbiAgICAgIH0pLFxuICAgIH07XG4gIH1cbn1cbiJdfQ==