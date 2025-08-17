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
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
                    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
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
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
                    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
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
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
                    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
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
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization',
                'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
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
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization',
                'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
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
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization',
                'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
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
                },
                action: 'created',
            }),
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSw4REFBMEQ7QUFDMUQsd0RBSytCO0FBRS9CLE1BQU0sTUFBTSxHQUFHLElBQUksZ0NBQWMsQ0FBQztJQUNoQyxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLElBQUksV0FBVztDQUM5QyxDQUFDLENBQUM7QUFFSCxNQUFNLFNBQVMsR0FBRyxxQ0FBc0IsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7QUFFdEQsTUFBTSxnQkFBZ0IsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGdCQUFnQixJQUFJLG9CQUFvQixDQUFDO0FBU3ZFLE1BQU0sT0FBTyxHQUFHLEtBQUssRUFDMUIsS0FBMkIsRUFDSyxFQUFFO0lBQ2xDLE9BQU8sQ0FBQyxHQUFHLENBQUMsMkJBQTJCLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFFaEQsSUFBSSxDQUFDO1FBQ0gsMENBQTBDO1FBQzFDLElBQUksTUFBYyxDQUFDO1FBQ25CLElBQUksUUFBZ0IsQ0FBQztRQUNyQixJQUFJLEtBQWEsQ0FBQztRQUNsQixJQUFJLElBQXdCLENBQUM7UUFFN0IsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNoQixPQUFPLENBQUMsS0FBSyxDQUFDLHVCQUF1QixDQUFDLENBQUM7WUFDdkMsT0FBTztnQkFDTCxVQUFVLEVBQUUsR0FBRztnQkFDZixPQUFPLEVBQUU7b0JBQ1AsY0FBYyxFQUFFLGtCQUFrQjtvQkFDbEMsNkJBQTZCLEVBQUUsR0FBRztvQkFDbEMsOEJBQThCLEVBQUUsNEJBQTRCO29CQUM1RCw4QkFBOEIsRUFBRSw2QkFBNkI7aUJBQzlEO2dCQUNELElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsS0FBSyxFQUFFLDBCQUEwQixFQUFFLENBQUM7YUFDNUQsQ0FBQztRQUNKLENBQUM7UUFFRCxNQUFNLFdBQVcsR0FBZ0IsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDeEQsTUFBTSxHQUFHLFdBQVcsQ0FBQyxNQUFNLENBQUM7UUFDNUIsUUFBUSxHQUFHLFdBQVcsQ0FBQyxRQUFRLENBQUM7UUFDaEMsS0FBSyxHQUFHLFdBQVcsQ0FBQyxLQUFLLENBQUM7UUFDMUIsSUFBSSxHQUFHLFdBQVcsQ0FBQyxJQUFJLENBQUM7UUFFeEIsSUFBSSxDQUFDLE1BQU0sSUFBSSxDQUFDLFFBQVEsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ25DLE9BQU8sQ0FBQyxLQUFLLENBQUMsNkNBQTZDLEVBQUUsV0FBVyxDQUFDLENBQUM7WUFDMUUsT0FBTztnQkFDTCxVQUFVLEVBQUUsR0FBRztnQkFDZixPQUFPLEVBQUU7b0JBQ1AsY0FBYyxFQUFFLGtCQUFrQjtvQkFDbEMsNkJBQTZCLEVBQUUsR0FBRztvQkFDbEMsOEJBQThCLEVBQUUsNEJBQTRCO29CQUM1RCw4QkFBOEIsRUFBRSw2QkFBNkI7aUJBQzlEO2dCQUNELElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDO29CQUNuQixLQUFLLEVBQUUsMERBQTBEO2lCQUNsRSxDQUFDO2FBQ0gsQ0FBQztRQUNKLENBQUM7UUFFRCw0QkFBNEI7UUFDNUIsSUFBSSxLQUFLLENBQUMsVUFBVSxLQUFLLE1BQU0sRUFBRSxDQUFDO1lBQ2hDLE9BQU87Z0JBQ0wsVUFBVSxFQUFFLEdBQUc7Z0JBQ2YsT0FBTyxFQUFFO29CQUNQLGNBQWMsRUFBRSxrQkFBa0I7b0JBQ2xDLDZCQUE2QixFQUFFLEdBQUc7b0JBQ2xDLDhCQUE4QixFQUFFLDRCQUE0QjtvQkFDNUQsOEJBQThCLEVBQUUsNkJBQTZCO2lCQUM5RDtnQkFDRCxJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssRUFBRSxvQkFBb0IsRUFBRSxDQUFDO2FBQ3RELENBQUM7UUFDSixDQUFDO1FBRUQsTUFBTSxHQUFHLEdBQUcsSUFBSSxJQUFJLEVBQUUsQ0FBQyxXQUFXLEVBQUUsQ0FBQztRQUNyQyxPQUFPLE1BQU0sd0JBQXdCLENBQUMsTUFBTSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBQzVFLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyxvQkFBb0IsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUMzQyxPQUFPO1lBQ0wsVUFBVSxFQUFFLEdBQUc7WUFDZixPQUFPLEVBQUU7Z0JBQ1AsY0FBYyxFQUFFLGtCQUFrQjtnQkFDbEMsNkJBQTZCLEVBQUUsR0FBRztnQkFDbEMsOEJBQThCLEVBQUUsNEJBQTRCO2dCQUM1RCw4QkFBOEIsRUFBRSw2QkFBNkI7YUFDOUQ7WUFDRCxJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssRUFBRSx1QkFBdUIsRUFBRSxDQUFDO1NBQ3pELENBQUM7SUFDSixDQUFDO0FBQ0gsQ0FBQyxDQUFDO0FBN0VXLFFBQUEsT0FBTyxXQTZFbEI7QUFFRixLQUFLLFVBQVUsd0JBQXdCLENBQ3JDLE1BQWMsRUFDZCxRQUFnQixFQUNoQixLQUFhLEVBQ2IsSUFBd0IsRUFDeEIsR0FBVztJQUVYLCtCQUErQjtJQUMvQixNQUFNLFVBQVUsR0FBRyxJQUFJLHlCQUFVLENBQUM7UUFDaEMsU0FBUyxFQUFFLGdCQUFnQjtRQUMzQixHQUFHLEVBQUU7WUFDSCxNQUFNLEVBQUUsTUFBTTtZQUNkLFFBQVEsRUFBRSxRQUFRO1NBQ25CO0tBQ0YsQ0FBQyxDQUFDO0lBRUgsTUFBTSxZQUFZLEdBQUcsTUFBTSxTQUFTLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBRXRELElBQUksWUFBWSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ3RCLHVEQUF1RDtRQUN2RCxJQUFJLGdCQUFnQixHQUFHLGdDQUFnQyxDQUFDO1FBQ3hELE1BQU0seUJBQXlCLEdBQVE7WUFDckMsY0FBYyxFQUFFLEdBQUc7U0FDcEIsQ0FBQztRQUVGLElBQUksSUFBSSxFQUFFLENBQUM7WUFDVCxnQkFBZ0IsSUFBSSxpQkFBaUIsQ0FBQztZQUN0Qyx5QkFBeUIsQ0FBQyxPQUFPLENBQUMsR0FBRyxJQUFJLENBQUM7UUFDNUMsQ0FBQztRQUVELE1BQU0sYUFBYSxHQUFHLElBQUksNEJBQWEsQ0FBQztZQUN0QyxTQUFTLEVBQUUsZ0JBQWdCO1lBQzNCLEdBQUcsRUFBRTtnQkFDSCxNQUFNLEVBQUUsTUFBTTtnQkFDZCxRQUFRLEVBQUUsUUFBUTthQUNuQjtZQUNELGdCQUFnQixFQUFFLGdCQUFnQjtZQUNsQyx5QkFBeUIsRUFBRSx5QkFBeUI7WUFDcEQsd0JBQXdCLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUMsU0FBUztZQUNoRSxZQUFZLEVBQUUsU0FBUztTQUN4QixDQUFDLENBQUM7UUFFSCxNQUFNLE1BQU0sR0FBRyxNQUFNLFNBQVMsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUM7UUFFbkQsT0FBTyxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsRUFBRTtZQUN2QyxNQUFNO1lBQ04sUUFBUTtZQUNSLEtBQUs7WUFDTCxXQUFXLEVBQUUsR0FBRztZQUNoQixnQkFBZ0IsRUFBRSxNQUFNLENBQUMsVUFBVSxFQUFFLGdCQUFnQjtTQUN0RCxDQUFDLENBQUM7UUFFSCxPQUFPO1lBQ0wsVUFBVSxFQUFFLEdBQUc7WUFDZixPQUFPLEVBQUU7Z0JBQ1AsY0FBYyxFQUFFLGtCQUFrQjtnQkFDbEMsNkJBQTZCLEVBQUUsR0FBRztnQkFDbEMsOEJBQThCLEVBQUUsNEJBQTRCO2dCQUM1RCw4QkFBOEIsRUFBRSw2QkFBNkI7YUFDOUQ7WUFDRCxJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQztnQkFDbkIsT0FBTyxFQUFFLElBQUk7Z0JBQ2IsSUFBSSxFQUFFLE1BQU0sQ0FBQyxVQUFVO2dCQUN2QixNQUFNLEVBQUUsU0FBUzthQUNsQixDQUFDO1NBQ0gsQ0FBQztJQUNKLENBQUM7U0FBTSxDQUFDO1FBQ04sc0NBQXNDO1FBQ3RDLE1BQU0sVUFBVSxHQUFHLElBQUkseUJBQVUsQ0FBQztZQUNoQyxTQUFTLEVBQUUsZ0JBQWdCO1lBQzNCLElBQUksRUFBRTtnQkFDSixNQUFNLEVBQUUsTUFBTTtnQkFDZCxRQUFRLEVBQUUsUUFBUTtnQkFDbEIsS0FBSyxFQUFFLEtBQUs7Z0JBQ1osSUFBSSxFQUFFLElBQUk7Z0JBQ1YsU0FBUyxFQUFFLEdBQUc7Z0JBQ2QsV0FBVyxFQUFFLEdBQUc7Z0JBQ2hCLGdCQUFnQixFQUFFLEVBQUU7YUFDckI7U0FDRixDQUFDLENBQUM7UUFFSCxNQUFNLFNBQVMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7UUFFakMsT0FBTyxDQUFDLEdBQUcsQ0FBQywrQkFBK0IsRUFBRTtZQUMzQyxNQUFNO1lBQ04sUUFBUTtZQUNSLEtBQUs7WUFDTCxJQUFJO1lBQ0osU0FBUyxFQUFFLEdBQUc7WUFDZCxXQUFXLEVBQUUsR0FBRztZQUNoQixnQkFBZ0IsRUFBRSxFQUFFO1NBQ3JCLENBQUMsQ0FBQztRQUVILE9BQU87WUFDTCxVQUFVLEVBQUUsR0FBRztZQUNmLE9BQU8sRUFBRTtnQkFDUCxjQUFjLEVBQUUsa0JBQWtCO2dCQUNsQyw2QkFBNkIsRUFBRSxHQUFHO2dCQUNsQyw4QkFBOEIsRUFBRSw0QkFBNEI7Z0JBQzVELDhCQUE4QixFQUFFLDZCQUE2QjthQUM5RDtZQUNELElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDO2dCQUNuQixPQUFPLEVBQUUsSUFBSTtnQkFDYixJQUFJLEVBQUU7b0JBQ0osTUFBTSxFQUFFLE1BQU07b0JBQ2QsUUFBUSxFQUFFLFFBQVE7b0JBQ2xCLEtBQUssRUFBRSxLQUFLO29CQUNaLElBQUksRUFBRSxJQUFJO29CQUNWLFNBQVMsRUFBRSxHQUFHO29CQUNkLFdBQVcsRUFBRSxHQUFHO29CQUNoQixnQkFBZ0IsRUFBRSxFQUFFO2lCQUNyQjtnQkFDRCxNQUFNLEVBQUUsU0FBUzthQUNsQixDQUFDO1NBQ0gsQ0FBQztJQUNKLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQVBJR2F0ZXdheVByb3h5RXZlbnQsIEFQSUdhdGV3YXlQcm94eVJlc3VsdCB9IGZyb20gJ2F3cy1sYW1iZGEnO1xuaW1wb3J0IHsgRHluYW1vREJDbGllbnQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtZHluYW1vZGInO1xuaW1wb3J0IHtcbiAgRHluYW1vREJEb2N1bWVudENsaWVudCxcbiAgUHV0Q29tbWFuZCxcbiAgR2V0Q29tbWFuZCxcbiAgVXBkYXRlQ29tbWFuZCxcbn0gZnJvbSAnQGF3cy1zZGsvbGliLWR5bmFtb2RiJztcblxuY29uc3QgY2xpZW50ID0gbmV3IER5bmFtb0RCQ2xpZW50KHtcbiAgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIHx8ICd1cy1lYXN0LTEnLFxufSk7XG5cbmNvbnN0IGRvY0NsaWVudCA9IER5bmFtb0RCRG9jdW1lbnRDbGllbnQuZnJvbShjbGllbnQpO1xuXG5jb25zdCBVU0VSU19UQUJMRV9OQU1FID0gcHJvY2Vzcy5lbnYuVVNFUlNfVEFCTEVfTkFNRSB8fCAndmlyYWwtdmlkZW9zLXVzZXJzJztcblxuaW50ZXJmYWNlIFJlcXVlc3RCb2R5IHtcbiAgdXNlcklkOiBzdHJpbmc7XG4gIHVzZXJuYW1lOiBzdHJpbmc7XG4gIGVtYWlsOiBzdHJpbmc7XG4gIG5hbWU/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjb25zdCBoYW5kbGVyID0gYXN5bmMgKFxuICBldmVudDogQVBJR2F0ZXdheVByb3h5RXZlbnQsXG4pOiBQcm9taXNlPEFQSUdhdGV3YXlQcm94eVJlc3VsdD4gPT4ge1xuICBjb25zb2xlLmxvZygnVXBzZXJ0IHVzZXIgQVBJIHJlY2VpdmVkOicsIGV2ZW50KTtcblxuICB0cnkge1xuICAgIC8vIEV4dHJhY3QgdXNlciBpbmZvIGZyb20gdGhlIHJlcXVlc3QgYm9keVxuICAgIGxldCB1c2VySWQ6IHN0cmluZztcbiAgICBsZXQgdXNlcm5hbWU6IHN0cmluZztcbiAgICBsZXQgZW1haWw6IHN0cmluZztcbiAgICBsZXQgbmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG4gICAgaWYgKCFldmVudC5ib2R5KSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdObyByZXF1ZXN0IGJvZHkgZm91bmQnKTtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctSGVhZGVycyc6ICdDb250ZW50LVR5cGUsQXV0aG9yaXphdGlvbicsXG4gICAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU1ldGhvZHMnOiAnR0VULFBPU1QsUFVULERFTEVURSxPUFRJT05TJyxcbiAgICAgICAgfSxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ1JlcXVlc3QgYm9keSBpcyByZXF1aXJlZCcgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIGNvbnN0IHJlcXVlc3RCb2R5OiBSZXF1ZXN0Qm9keSA9IEpTT04ucGFyc2UoZXZlbnQuYm9keSk7XG4gICAgdXNlcklkID0gcmVxdWVzdEJvZHkudXNlcklkO1xuICAgIHVzZXJuYW1lID0gcmVxdWVzdEJvZHkudXNlcm5hbWU7XG4gICAgZW1haWwgPSByZXF1ZXN0Qm9keS5lbWFpbDtcbiAgICBuYW1lID0gcmVxdWVzdEJvZHkubmFtZTtcblxuICAgIGlmICghdXNlcklkIHx8ICF1c2VybmFtZSB8fCAhZW1haWwpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ01pc3NpbmcgcmVxdWlyZWQgdXNlciBpbmZvIGluIHJlcXVlc3QgYm9keTonLCByZXF1ZXN0Qm9keSk7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnMnOiAnQ29udGVudC1UeXBlLEF1dGhvcml6YXRpb24nLFxuICAgICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1NZXRob2RzJzogJ0dFVCxQT1NULFBVVCxERUxFVEUsT1BUSU9OUycsXG4gICAgICAgIH0sXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBlcnJvcjogJ3VzZXJJZCwgdXNlcm5hbWUsIGFuZCBlbWFpbCBhcmUgcmVxdWlyZWQgaW4gcmVxdWVzdCBib2R5JyxcbiAgICAgICAgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIEhhbmRsZSBQT1NUIHJlcXVlc3RzIG9ubHlcbiAgICBpZiAoZXZlbnQuaHR0cE1ldGhvZCAhPT0gJ1BPU1QnKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDUsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnMnOiAnQ29udGVudC1UeXBlLEF1dGhvcml6YXRpb24nLFxuICAgICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1NZXRob2RzJzogJ0dFVCxQT1NULFBVVCxERUxFVEUsT1BUSU9OUycsXG4gICAgICAgIH0sXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdNZXRob2Qgbm90IGFsbG93ZWQnIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XG4gICAgcmV0dXJuIGF3YWl0IGhhbmRsZUNyZWF0ZU9yVXBkYXRlVXNlcih1c2VySWQsIHVzZXJuYW1lLCBlbWFpbCwgbmFtZSwgbm93KTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdVcHNlcnQgdXNlciBlcnJvcjonLCBlcnJvcik7XG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDUwMCxcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnMnOiAnQ29udGVudC1UeXBlLEF1dGhvcml6YXRpb24nLFxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctTWV0aG9kcyc6ICdHRVQsUE9TVCxQVVQsREVMRVRFLE9QVElPTlMnLFxuICAgICAgfSxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdJbnRlcm5hbCBzZXJ2ZXIgZXJyb3InIH0pLFxuICAgIH07XG4gIH1cbn07XG5cbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZUNyZWF0ZU9yVXBkYXRlVXNlcihcbiAgdXNlcklkOiBzdHJpbmcsXG4gIHVzZXJuYW1lOiBzdHJpbmcsXG4gIGVtYWlsOiBzdHJpbmcsXG4gIG5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCxcbiAgbm93OiBzdHJpbmcsXG4pOiBQcm9taXNlPEFQSUdhdGV3YXlQcm94eVJlc3VsdD4ge1xuICAvLyBDaGVjayBpZiB1c2VyIGFscmVhZHkgZXhpc3RzXG4gIGNvbnN0IGdldENvbW1hbmQgPSBuZXcgR2V0Q29tbWFuZCh7XG4gICAgVGFibGVOYW1lOiBVU0VSU19UQUJMRV9OQU1FLFxuICAgIEtleToge1xuICAgICAgdXNlcklkOiB1c2VySWQsXG4gICAgICB1c2VybmFtZTogdXNlcm5hbWUsXG4gICAgfSxcbiAgfSk7XG5cbiAgY29uc3QgZXhpc3RpbmdVc2VyID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQoZ2V0Q29tbWFuZCk7XG5cbiAgaWYgKGV4aXN0aW5nVXNlci5JdGVtKSB7XG4gICAgLy8gVXNlciBleGlzdHMsIHVwZGF0ZSBsYXN0TG9naW5BdCBhbmQgbmFtZSBpZiBwcm92aWRlZFxuICAgIGxldCB1cGRhdGVFeHByZXNzaW9uID0gJ1NFVCBsYXN0TG9naW5BdCA9IDpsYXN0TG9naW5BdCc7XG4gICAgY29uc3QgZXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczogYW55ID0ge1xuICAgICAgJzpsYXN0TG9naW5BdCc6IG5vdyxcbiAgICB9O1xuXG4gICAgaWYgKG5hbWUpIHtcbiAgICAgIHVwZGF0ZUV4cHJlc3Npb24gKz0gJywgI25hbWUgPSA6bmFtZSc7XG4gICAgICBleHByZXNzaW9uQXR0cmlidXRlVmFsdWVzWyc6bmFtZSddID0gbmFtZTtcbiAgICB9XG5cbiAgICBjb25zdCB1cGRhdGVDb21tYW5kID0gbmV3IFVwZGF0ZUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiBVU0VSU19UQUJMRV9OQU1FLFxuICAgICAgS2V5OiB7XG4gICAgICAgIHVzZXJJZDogdXNlcklkLFxuICAgICAgICB1c2VybmFtZTogdXNlcm5hbWUsXG4gICAgICB9LFxuICAgICAgVXBkYXRlRXhwcmVzc2lvbjogdXBkYXRlRXhwcmVzc2lvbixcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IGV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXMsXG4gICAgICBFeHByZXNzaW9uQXR0cmlidXRlTmFtZXM6IG5hbWUgPyB7ICcjbmFtZSc6ICduYW1lJyB9IDogdW5kZWZpbmVkLFxuICAgICAgUmV0dXJuVmFsdWVzOiAnQUxMX05FVycsXG4gICAgfSk7XG5cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBkb2NDbGllbnQuc2VuZCh1cGRhdGVDb21tYW5kKTtcblxuICAgIGNvbnNvbGUubG9nKCdVc2VyIHVwZGF0ZWQgaW4gRHluYW1vREI6Jywge1xuICAgICAgdXNlcklkLFxuICAgICAgdXNlcm5hbWUsXG4gICAgICBlbWFpbCxcbiAgICAgIGxhc3RMb2dpbkF0OiBub3csXG4gICAgICBjcmVkaXRzQXZhaWxhYmxlOiByZXN1bHQuQXR0cmlidXRlcz8uY3JlZGl0c0F2YWlsYWJsZSxcbiAgICB9KTtcblxuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXNDb2RlOiAyMDAsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1IZWFkZXJzJzogJ0NvbnRlbnQtVHlwZSxBdXRob3JpemF0aW9uJyxcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU1ldGhvZHMnOiAnR0VULFBPU1QsUFVULERFTEVURSxPUFRJT05TJyxcbiAgICAgIH0sXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIHVzZXI6IHJlc3VsdC5BdHRyaWJ1dGVzLFxuICAgICAgICBhY3Rpb246ICd1cGRhdGVkJyxcbiAgICAgIH0pLFxuICAgIH07XG4gIH0gZWxzZSB7XG4gICAgLy8gVXNlciBkb2Vzbid0IGV4aXN0LCBjcmVhdGUgbmV3IHVzZXJcbiAgICBjb25zdCBwdXRDb21tYW5kID0gbmV3IFB1dENvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiBVU0VSU19UQUJMRV9OQU1FLFxuICAgICAgSXRlbToge1xuICAgICAgICB1c2VySWQ6IHVzZXJJZCxcbiAgICAgICAgdXNlcm5hbWU6IHVzZXJuYW1lLFxuICAgICAgICBlbWFpbDogZW1haWwsXG4gICAgICAgIG5hbWU6IG5hbWUsXG4gICAgICAgIGNyZWF0ZWRBdDogbm93LFxuICAgICAgICBsYXN0TG9naW5BdDogbm93LFxuICAgICAgICBjcmVkaXRzQXZhaWxhYmxlOiAxMCxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBhd2FpdCBkb2NDbGllbnQuc2VuZChwdXRDb21tYW5kKTtcblxuICAgIGNvbnNvbGUubG9nKCdOZXcgdXNlciBjcmVhdGVkIGluIER5bmFtb0RCOicsIHtcbiAgICAgIHVzZXJJZCxcbiAgICAgIHVzZXJuYW1lLFxuICAgICAgZW1haWwsXG4gICAgICBuYW1lLFxuICAgICAgY3JlYXRlZEF0OiBub3csXG4gICAgICBsYXN0TG9naW5BdDogbm93LFxuICAgICAgY3JlZGl0c0F2YWlsYWJsZTogMTAsXG4gICAgfSk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogMjAxLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctSGVhZGVycyc6ICdDb250ZW50LVR5cGUsQXV0aG9yaXphdGlvbicsXG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1NZXRob2RzJzogJ0dFVCxQT1NULFBVVCxERUxFVEUsT1BUSU9OUycsXG4gICAgICB9LFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICB1c2VyOiB7XG4gICAgICAgICAgdXNlcklkOiB1c2VySWQsXG4gICAgICAgICAgdXNlcm5hbWU6IHVzZXJuYW1lLFxuICAgICAgICAgIGVtYWlsOiBlbWFpbCxcbiAgICAgICAgICBuYW1lOiBuYW1lLFxuICAgICAgICAgIGNyZWF0ZWRBdDogbm93LFxuICAgICAgICAgIGxhc3RMb2dpbkF0OiBub3csXG4gICAgICAgICAgY3JlZGl0c0F2YWlsYWJsZTogMTAsXG4gICAgICAgIH0sXG4gICAgICAgIGFjdGlvbjogJ2NyZWF0ZWQnLFxuICAgICAgfSksXG4gICAgfTtcbiAgfVxufVxuIl19