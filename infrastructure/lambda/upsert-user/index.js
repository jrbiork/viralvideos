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
            ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0
                ? expressionAttributeNames
                : undefined,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSw4REFBMEQ7QUFDMUQsd0RBSytCO0FBRS9CLE1BQU0sTUFBTSxHQUFHLElBQUksZ0NBQWMsQ0FBQztJQUNoQyxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLElBQUksV0FBVztDQUM5QyxDQUFDLENBQUM7QUFFSCxNQUFNLFNBQVMsR0FBRyxxQ0FBc0IsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7QUFFdEQsTUFBTSxnQkFBZ0IsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGdCQUFnQixJQUFJLG9CQUFvQixDQUFDO0FBVXZFLE1BQU0sT0FBTyxHQUFHLEtBQUssRUFDMUIsS0FBMkIsRUFDSyxFQUFFO0lBQ2xDLE9BQU8sQ0FBQyxHQUFHLENBQUMsMkJBQTJCLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFFaEQsSUFBSSxDQUFDO1FBQ0gsMENBQTBDO1FBQzFDLElBQUksTUFBYyxDQUFDO1FBQ25CLElBQUksUUFBZ0IsQ0FBQztRQUNyQixJQUFJLEtBQWEsQ0FBQztRQUNsQixJQUFJLElBQXdCLENBQUM7UUFDN0IsSUFBSSxPQUEyQixDQUFDO1FBRWhDLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDaEIsT0FBTyxDQUFDLEtBQUssQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1lBQ3ZDLE9BQU87Z0JBQ0wsVUFBVSxFQUFFLEdBQUc7Z0JBQ2YsT0FBTyxFQUFFO29CQUNQLGNBQWMsRUFBRSxrQkFBa0I7aUJBQ25DO2dCQUNELElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsS0FBSyxFQUFFLDBCQUEwQixFQUFFLENBQUM7YUFDNUQsQ0FBQztRQUNKLENBQUM7UUFFRCxNQUFNLFdBQVcsR0FBZ0IsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENB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RTt3QkFDWixJQUFJLEVBQUUsTUFBTTt3QkFDWixXQUFXLEVBQUUsSUFBSTt3QkFDakIsTUFBTSxFQUFFLFFBQVE7cUJBQ2pCO2lCQUNGO2dCQUNELE1BQU0sRUFBRSxTQUFTO2FBQ2xCLENBQUM7U0FDSCxDQUFDO0lBQ0osQ0FBQztBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBUElHYXRld2F5UHJveHlFdmVudCwgQVBJR2F0ZXdheVByb3h5UmVzdWx0IH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5pbXBvcnQgeyBEeW5hbW9EQkNsaWVudCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1keW5hbW9kYic7XG5pbXBvcnQge1xuICBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LFxuICBQdXRDb21tYW5kLFxuICBHZXRDb21tYW5kLFxuICBVcGRhdGVDb21tYW5kLFxufSBmcm9tICdAYXdzLXNkay9saWItZHluYW1vZGInO1xuXG5jb25zdCBjbGllbnQgPSBuZXcgRHluYW1vREJDbGllbnQoe1xuICByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfHwgJ3VzLWVhc3QtMScsXG59KTtcblxuY29uc3QgZG9jQ2xpZW50ID0gRHluYW1vREJEb2N1bWVudENsaWVudC5mcm9tKGNsaWVudCk7XG5cbmNvbnN0IFVTRVJTX1RBQkxFX05BTUUgPSBwcm9jZXNzLmVudi5VU0VSU19UQUJMRV9OQU1FIHx8ICd2aXJhbC12aWRlb3MtdXNlcnMnO1xuXG5pbnRlcmZhY2UgUmVxdWVzdEJvZHkge1xuICB1c2VySWQ6IHN0cmluZztcbiAgdXNlcm5hbWU6IHN0cmluZztcbiAgZW1haWw6IHN0cmluZztcbiAgbmFtZT86IHN0cmluZztcbiAgcGljdHVyZT86IHN0cmluZztcbn1cblxuZXhwb3J0IGNvbnN0IGhhbmRsZXIgPSBhc3luYyAoXG4gIGV2ZW50OiBBUElHYXRld2F5UHJveHlFdmVudCxcbik6IFByb21pc2U8QVBJR2F0ZXdheVByb3h5UmVzdWx0PiA9PiB7XG4gIGNvbnNvbGUubG9nKCdVcHNlcnQgdXNlciBBUEkgcmVjZWl2ZWQ6JywgZXZlbnQpO1xuXG4gIHRyeSB7XG4gICAgLy8gRXh0cmFjdCB1c2VyIGluZm8gZnJvbSB0aGUgcmVxdWVzdCBib2R5XG4gICAgbGV0IHVzZXJJZDogc3RyaW5nO1xuICAgIGxldCB1c2VybmFtZTogc3RyaW5nO1xuICAgIGxldCBlbWFpbDogc3RyaW5nO1xuICAgIGxldCBuYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgbGV0IHBpY3R1cmU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuICAgIGlmICghZXZlbnQuYm9keSkge1xuICAgICAgY29uc29sZS5lcnJvcignTm8gcmVxdWVzdCBib2R5IGZvdW5kJyk7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICB9LFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnUmVxdWVzdCBib2R5IGlzIHJlcXVpcmVkJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3QgcmVxdWVzdEJvZHk6IFJlcXVlc3RCb2R5ID0gSlNPTi5wYXJzZShldmVudC5ib2R5KTtcbiAgICB1c2VySWQgPSByZXF1ZXN0Qm9keS51c2VySWQ7XG4gICAgdXNlcm5hbWUgPSByZXF1ZXN0Qm9keS51c2VybmFtZTtcbiAgICBlbWFpbCA9IHJlcXVlc3RCb2R5LmVtYWlsO1xuICAgIG5hbWUgPSByZXF1ZXN0Qm9keS5uYW1lO1xuICAgIHBpY3R1cmUgPSByZXF1ZXN0Qm9keS5waWN0dXJlO1xuXG4gICAgaWYgKCF1c2VySWQgfHwgIXVzZXJuYW1lIHx8ICFlbWFpbCkge1xuICAgICAgY29uc29sZS5lcnJvcignTWlzc2luZyByZXF1aXJlZCB1c2VyIGluZm8gaW4gcmVxdWVzdCBib2R5OicsIHJlcXVlc3RCb2R5KTtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgIH0sXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBlcnJvcjogJ3VzZXJJZCwgdXNlcm5hbWUsIGFuZCBlbWFpbCBhcmUgcmVxdWlyZWQgaW4gcmVxdWVzdCBib2R5JyxcbiAgICAgICAgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIEhhbmRsZSBQT1NUIHJlcXVlc3RzIG9ubHlcbiAgICBpZiAoZXZlbnQuaHR0cE1ldGhvZCAhPT0gJ1BPU1QnKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDUsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICB9LFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnTWV0aG9kIG5vdCBhbGxvd2VkJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xuICAgIHJldHVybiBhd2FpdCBoYW5kbGVDcmVhdGVPclVwZGF0ZVVzZXIoXG4gICAgICB1c2VySWQsXG4gICAgICB1c2VybmFtZSxcbiAgICAgIGVtYWlsLFxuICAgICAgbmFtZSxcbiAgICAgIHBpY3R1cmUsXG4gICAgICBub3csXG4gICAgKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdVcHNlcnQgdXNlciBlcnJvcjonLCBlcnJvcik7XG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDUwMCxcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgIH0sXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnSW50ZXJuYWwgc2VydmVyIGVycm9yJyB9KSxcbiAgICB9O1xuICB9XG59O1xuXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVDcmVhdGVPclVwZGF0ZVVzZXIoXG4gIHVzZXJJZDogc3RyaW5nLFxuICB1c2VybmFtZTogc3RyaW5nLFxuICBlbWFpbDogc3RyaW5nLFxuICBuYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQsXG4gIHBpY3R1cmU6IHN0cmluZyB8IHVuZGVmaW5lZCxcbiAgbm93OiBzdHJpbmcsXG4pOiBQcm9taXNlPEFQSUdhdGV3YXlQcm94eVJlc3VsdD4ge1xuICAvLyBDaGVjayBpZiB1c2VyIGFscmVhZHkgZXhpc3RzXG4gIGNvbnN0IGdldENvbW1hbmQgPSBuZXcgR2V0Q29tbWFuZCh7XG4gICAgVGFibGVOYW1lOiBVU0VSU19UQUJMRV9OQU1FLFxuICAgIEtleToge1xuICAgICAgdXNlcklkOiB1c2VySWQsXG4gICAgICB1c2VybmFtZTogdXNlcm5hbWUsXG4gICAgfSxcbiAgfSk7XG5cbiAgY29uc3QgZXhpc3RpbmdVc2VyID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQoZ2V0Q29tbWFuZCk7XG5cbiAgaWYgKGV4aXN0aW5nVXNlci5JdGVtKSB7XG4gICAgLy8gVXNlciBleGlzdHMsIHVwZGF0ZSBsYXN0TG9naW5BdCBhbmQgbmFtZS9waWN0dXJlIGlmIHByb3ZpZGVkXG4gICAgbGV0IHVwZGF0ZUV4cHJlc3Npb24gPSAnU0VUIGxhc3RMb2dpbkF0ID0gOmxhc3RMb2dpbkF0JztcbiAgICBjb25zdCBleHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiBhbnkgPSB7XG4gICAgICAnOmxhc3RMb2dpbkF0Jzogbm93LFxuICAgIH07XG4gICAgY29uc3QgZXhwcmVzc2lvbkF0dHJpYnV0ZU5hbWVzOiBhbnkgPSB7fTtcblxuICAgIGlmIChuYW1lKSB7XG4gICAgICB1cGRhdGVFeHByZXNzaW9uICs9ICcsICNuYW1lID0gOm5hbWUnO1xuICAgICAgZXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlc1snOm5hbWUnXSA9IG5hbWU7XG4gICAgICBleHByZXNzaW9uQXR0cmlidXRlTmFtZXNbJyNuYW1lJ10gPSAnbmFtZSc7XG4gICAgfVxuXG4gICAgaWYgKHBpY3R1cmUpIHtcbiAgICAgIHVwZGF0ZUV4cHJlc3Npb24gKz0gJywgI3BpY3R1cmUgPSA6cGljdHVyZSc7XG4gICAgICBleHByZXNzaW9uQXR0cmlidXRlVmFsdWVzWyc6cGljdHVyZSddID0gcGljdHVyZTtcbiAgICAgIGV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lc1snI3BpY3R1cmUnXSA9ICdwaWN0dXJlJztcbiAgICB9XG5cbiAgICBjb25zdCB1cGRhdGVDb21tYW5kID0gbmV3IFVwZGF0ZUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiBVU0VSU19UQUJMRV9OQU1FLFxuICAgICAgS2V5OiB7XG4gICAgICAgIHVzZXJJZDogdXNlcklkLFxuICAgICAgICB1c2VybmFtZTogdXNlcm5hbWUsXG4gICAgICB9LFxuICAgICAgVXBkYXRlRXhwcmVzc2lvbjogdXBkYXRlRXhwcmVzc2lvbixcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IGV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXMsXG4gICAgICBFeHByZXNzaW9uQXR0cmlidXRlTmFtZXM6XG4gICAgICAgIE9iamVjdC5rZXlzKGV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lcykubGVuZ3RoID4gMFxuICAgICAgICAgID8gZXhwcmVzc2lvbkF0dHJpYnV0ZU5hbWVzXG4gICAgICAgICAgOiB1bmRlZmluZWQsXG4gICAgICBSZXR1cm5WYWx1ZXM6ICdBTExfTkVXJyxcbiAgICB9KTtcblxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKHVwZGF0ZUNvbW1hbmQpO1xuXG4gICAgY29uc29sZS5sb2coJ1VzZXIgdXBkYXRlZCBpbiBEeW5hbW9EQjonLCB7XG4gICAgICB1c2VySWQsXG4gICAgICB1c2VybmFtZSxcbiAgICAgIGVtYWlsLFxuICAgICAgbGFzdExvZ2luQXQ6IG5vdyxcbiAgICAgIGNyZWRpdHNBdmFpbGFibGU6IHJlc3VsdC5BdHRyaWJ1dGVzPy5jcmVkaXRzQXZhaWxhYmxlLFxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgIH0sXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIHVzZXI6IHJlc3VsdC5BdHRyaWJ1dGVzLFxuICAgICAgICBhY3Rpb246ICd1cGRhdGVkJyxcbiAgICAgIH0pLFxuICAgIH07XG4gIH0gZWxzZSB7XG4gICAgLy8gVXNlciBkb2Vzbid0IGV4aXN0LCBjcmVhdGUgbmV3IHVzZXJcbiAgICBjb25zdCBwdXRDb21tYW5kID0gbmV3IFB1dENvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiBVU0VSU19UQUJMRV9OQU1FLFxuICAgICAgSXRlbToge1xuICAgICAgICB1c2VySWQ6IHVzZXJJZCxcbiAgICAgICAgdXNlcm5hbWU6IHVzZXJuYW1lLFxuICAgICAgICBlbWFpbDogZW1haWwsXG4gICAgICAgIG5hbWU6IG5hbWUsXG4gICAgICAgIHBpY3R1cmU6IHBpY3R1cmUsXG4gICAgICAgIGNyZWF0ZWRBdDogbm93LFxuICAgICAgICBsYXN0TG9naW5BdDogbm93LFxuICAgICAgICBjcmVkaXRzQXZhaWxhYmxlOiAxMCxcbiAgICAgICAgbGFzdFBheW1lbnRBdDogbnVsbCxcbiAgICAgICAgc3Vic2NyaXB0aW9uOiB7XG4gICAgICAgICAgbW9kZTogJ2ZyZWUnLFxuICAgICAgICAgIHJlbmV3YWxEYXRlOiBudWxsLFxuICAgICAgICAgIHN0YXR1czogJ2FjdGl2ZScsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgYXdhaXQgZG9jQ2xpZW50LnNlbmQocHV0Q29tbWFuZCk7XG5cbiAgICBjb25zb2xlLmxvZygnTmV3IHVzZXIgY3JlYXRlZCBpbiBEeW5hbW9EQjonLCB7XG4gICAgICB1c2VySWQsXG4gICAgICB1c2VybmFtZSxcbiAgICAgIGVtYWlsLFxuICAgICAgbmFtZSxcbiAgICAgIHBpY3R1cmUsXG4gICAgICBjcmVhdGVkQXQ6IG5vdyxcbiAgICAgIGxhc3RMb2dpbkF0OiBub3csXG4gICAgICBjcmVkaXRzQXZhaWxhYmxlOiAxMCxcbiAgICB9KTtcblxuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXNDb2RlOiAyMDEsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICB9LFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICB1c2VyOiB7XG4gICAgICAgICAgdXNlcklkOiB1c2VySWQsXG4gICAgICAgICAgdXNlcm5hbWU6IHVzZXJuYW1lLFxuICAgICAgICAgIGVtYWlsOiBlbWFpbCxcbiAgICAgICAgICBuYW1lOiBuYW1lLFxuICAgICAgICAgIHBpY3R1cmU6IHBpY3R1cmUsXG4gICAgICAgICAgY3JlYXRlZEF0OiBub3csXG4gICAgICAgICAgbGFzdExvZ2luQXQ6IG5vdyxcbiAgICAgICAgICBjcmVkaXRzQXZhaWxhYmxlOiAxMCxcbiAgICAgICAgICBzdWJzY3JpcHRpb246IHtcbiAgICAgICAgICAgIG1vZGU6ICdmcmVlJyxcbiAgICAgICAgICAgIHJlbmV3YWxEYXRlOiBudWxsLFxuICAgICAgICAgICAgc3RhdHVzOiAnYWN0aXZlJyxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICBhY3Rpb246ICdjcmVhdGVkJyxcbiAgICAgIH0pLFxuICAgIH07XG4gIH1cbn1cbiJdfQ==