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
    console.log('Get user API received:', event);
    try {
        // Extract user info from query parameters
        let userId;
        let username;
        if (!event.queryStringParameters) {
            console.error('No query parameters found');
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ error: 'Query parameters are required' }),
            };
        }
        userId = event.queryStringParameters.userId || '';
        username = event.queryStringParameters.username || '';
        if (!userId) {
            console.error('Missing required userId in query parameters:', event.queryStringParameters);
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    error: 'userId is required in query parameters',
                }),
            };
        }
        console.log('Received query parameters:', {
            userId,
            username,
        });
        // Handle GET requests only
        if (event.httpMethod !== 'GET') {
            return {
                statusCode: 405,
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ error: 'Method not allowed' }),
            };
        }
        return await handleGetUser(userId, username);
    }
    catch (error) {
        console.error('Get user error:', error);
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
async function handleGetUser(userId, username) {
    const getCommand = new lib_dynamodb_1.GetCommand({
        TableName: USERS_TABLE_NAME,
        Key: {
            userId: userId,
            username: username,
        },
    });
    const result = await docClient.send(getCommand);
    // No additional validation needed since we're using the composite key (userId + username)
    // If the item exists, it means both userId and username match
    if (!result.Item) {
        return {
            statusCode: 404,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ error: 'User not found' }),
        };
    }
    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            success: true,
            user: result.Item,
        }),
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSw4REFBMEQ7QUFDMUQsd0RBQTJFO0FBRTNFLE1BQU0sTUFBTSxHQUFHLElBQUksZ0NBQWMsQ0FBQztJQUNoQyxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLElBQUksV0FBVztDQUM5QyxDQUFDLENBQUM7QUFFSCxNQUFNLFNBQVMsR0FBRyxxQ0FBc0IsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7QUFFdEQsTUFBTSxnQkFBZ0IsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGdCQUFnQixJQUFJLG9CQUFvQixDQUFDO0FBRXZFLE1BQU0sT0FBTyxHQUFHLEtBQUssRUFDMUIsS0FBMkIsRUFDSyxFQUFFO0lBQ2xDLE9BQU8sQ0FBQyxHQUFHLENBQUMsd0JBQXdCLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFFN0MsSUFBSSxDQUFDO1FBQ0gsMENBQTBDO1FBQzFDLElBQUksTUFBYyxDQUFDO1FBQ25CLElBQUksUUFBZ0IsQ0FBQztRQUVyQixJQUFJLENBQUMsS0FBSyxDQUFDLHFCQUFxQixFQUFFLENBQUM7WUFDakMsT0FBTyxDQUFDLEtBQUssQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO1lBQzNDLE9BQU87Z0JBQ0wsVUFBVSxFQUFFLEdBQUc7Z0JBQ2YsT0FBTyxFQUFFO29CQUNQLGNBQWMsRUFBRSxrQkFBa0I7aUJBQ25DO2dCQUNELElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsS0FBSyxFQUFFLCtCQUErQixFQUFFLENBQUM7YUFDakUsQ0FBQztRQUNKLENBQUM7UUFFRCxNQUFNLEdBQUcsS0FBSyxDQUFDLHFCQUFxQixDQUFDLE1BQU0sSUFBSSxFQUFFLENBQUM7UUFDbEQsUUFBUSxHQUFHLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxRQUFRLElBQUksRUFBRSxDQUFDO1FBRXRELElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNaLE9BQU8sQ0FBQyxLQUFLLENBQ1gsOENBQThDLEVBQzlDLEtBQUssQ0FBQyxxQkFBcUIsQ0FDNUIsQ0FBQztZQUNGLE9BQU87Z0JBQ0wsVUFBVSxFQUFFLEdBQUc7Z0JBQ2YsT0FBTyxFQUFFO29CQUNQLGNBQWMsRUFBRSxrQkFBa0I7aUJBQ25DO2dCQUNELElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDO29CQUNuQixLQUFLLEVBQUUsd0NBQXdDO2lCQUNoRCxDQUFDO2FBQ0gsQ0FBQztRQUNKLENBQUM7UUFFRCxPQUFPLENBQUMsR0FBRyxDQUFDLDRCQUE0QixFQUFFO1lBQ3hDLE1BQU07WUFDTixRQUFRO1NBQ1QsQ0FBQyxDQUFDO1FBRUgsMkJBQTJCO1FBQzNCLElBQUksS0FBSyxDQUFDLFVBQVUsS0FBSyxLQUFLLEVBQUUsQ0FBQztZQUMvQixPQUFPO2dCQUNMLFVBQVUsRUFBRSxHQUFHO2dCQUNmLE9BQU8sRUFBRTtvQkFDUCxjQUFjLEVBQUUsa0JBQWtCO2lCQUNuQztnQkFDRCxJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssRUFBRSxvQkFBb0IsRUFBRSxDQUFDO2FBQ3RELENBQUM7UUFDSixDQUFDO1FBRUQsT0FBTyxNQUFNLGFBQWEsQ0FBQyxNQUFNLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDL0MsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLGlCQUFpQixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3hDLE9BQU87WUFDTCxVQUFVLEVBQUUsR0FBRztZQUNmLE9BQU8sRUFBRTtnQkFDUCxjQUFjLEVBQUUsa0JBQWtCO2FBQ25DO1lBQ0QsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxLQUFLLEVBQUUsdUJBQXVCLEVBQUUsQ0FBQztTQUN6RCxDQUFDO0lBQ0osQ0FBQztBQUNILENBQUMsQ0FBQztBQW5FVyxRQUFBLE9BQU8sV0FtRWxCO0FBRUYsS0FBSyxVQUFVLGFBQWEsQ0FDMUIsTUFBYyxFQUNkLFFBQWdCO0lBRWhCLE1BQU0sVUFBVSxHQUFHLElBQUkseUJBQVUsQ0FBQztRQUNoQyxTQUFTLEVBQUUsZ0JBQWdCO1FBQzNCLEdBQUcsRUFBRTtZQUNILE1BQU0sRUFBRSxNQUFNO1lBQ2QsUUFBUSxFQUFFLFFBQVE7U0FDbkI7S0FDRixDQUFDLENBQUM7SUFFSCxNQUFNLE1BQU0sR0FBRyxNQUFNLFNBQVMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7SUFFaEQsMEZBQTBGO0lBQzFGLDhEQUE4RDtJQUU5RCxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ2pCLE9BQU87WUFDTCxVQUFVLEVBQUUsR0FBRztZQUNmLE9BQU8sRUFBRTtnQkFDUCxjQUFjLEVBQUUsa0JBQWtCO2FBQ25DO1lBQ0QsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxLQUFLLEVBQUUsZ0JBQWdCLEVBQUUsQ0FBQztTQUNsRCxDQUFDO0lBQ0osQ0FBQztJQUVELE9BQU87UUFDTCxVQUFVLEVBQUUsR0FBRztRQUNmLE9BQU8sRUFBRTtZQUNQLGNBQWMsRUFBRSxrQkFBa0I7U0FDbkM7UUFDRCxJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQztZQUNuQixPQUFPLEVBQUUsSUFBSTtZQUNiLElBQUksRUFBRSxNQUFNLENBQUMsSUFBSTtTQUNsQixDQUFDO0tBQ0gsQ0FBQztBQUNKLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBUElHYXRld2F5UHJveHlFdmVudCwgQVBJR2F0ZXdheVByb3h5UmVzdWx0IH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5pbXBvcnQgeyBEeW5hbW9EQkNsaWVudCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1keW5hbW9kYic7XG5pbXBvcnQgeyBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LCBHZXRDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvbGliLWR5bmFtb2RiJztcblxuY29uc3QgY2xpZW50ID0gbmV3IER5bmFtb0RCQ2xpZW50KHtcbiAgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIHx8ICd1cy1lYXN0LTEnLFxufSk7XG5cbmNvbnN0IGRvY0NsaWVudCA9IER5bmFtb0RCRG9jdW1lbnRDbGllbnQuZnJvbShjbGllbnQpO1xuXG5jb25zdCBVU0VSU19UQUJMRV9OQU1FID0gcHJvY2Vzcy5lbnYuVVNFUlNfVEFCTEVfTkFNRSB8fCAndmlyYWwtdmlkZW9zLXVzZXJzJztcblxuZXhwb3J0IGNvbnN0IGhhbmRsZXIgPSBhc3luYyAoXG4gIGV2ZW50OiBBUElHYXRld2F5UHJveHlFdmVudCxcbik6IFByb21pc2U8QVBJR2F0ZXdheVByb3h5UmVzdWx0PiA9PiB7XG4gIGNvbnNvbGUubG9nKCdHZXQgdXNlciBBUEkgcmVjZWl2ZWQ6JywgZXZlbnQpO1xuXG4gIHRyeSB7XG4gICAgLy8gRXh0cmFjdCB1c2VyIGluZm8gZnJvbSBxdWVyeSBwYXJhbWV0ZXJzXG4gICAgbGV0IHVzZXJJZDogc3RyaW5nO1xuICAgIGxldCB1c2VybmFtZTogc3RyaW5nO1xuXG4gICAgaWYgKCFldmVudC5xdWVyeVN0cmluZ1BhcmFtZXRlcnMpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ05vIHF1ZXJ5IHBhcmFtZXRlcnMgZm91bmQnKTtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgIH0sXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdRdWVyeSBwYXJhbWV0ZXJzIGFyZSByZXF1aXJlZCcgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIHVzZXJJZCA9IGV2ZW50LnF1ZXJ5U3RyaW5nUGFyYW1ldGVycy51c2VySWQgfHwgJyc7XG4gICAgdXNlcm5hbWUgPSBldmVudC5xdWVyeVN0cmluZ1BhcmFtZXRlcnMudXNlcm5hbWUgfHwgJyc7XG5cbiAgICBpZiAoIXVzZXJJZCkge1xuICAgICAgY29uc29sZS5lcnJvcihcbiAgICAgICAgJ01pc3NpbmcgcmVxdWlyZWQgdXNlcklkIGluIHF1ZXJ5IHBhcmFtZXRlcnM6JyxcbiAgICAgICAgZXZlbnQucXVlcnlTdHJpbmdQYXJhbWV0ZXJzLFxuICAgICAgKTtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgIH0sXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBlcnJvcjogJ3VzZXJJZCBpcyByZXF1aXJlZCBpbiBxdWVyeSBwYXJhbWV0ZXJzJyxcbiAgICAgICAgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIGNvbnNvbGUubG9nKCdSZWNlaXZlZCBxdWVyeSBwYXJhbWV0ZXJzOicsIHtcbiAgICAgIHVzZXJJZCxcbiAgICAgIHVzZXJuYW1lLFxuICAgIH0pO1xuXG4gICAgLy8gSGFuZGxlIEdFVCByZXF1ZXN0cyBvbmx5XG4gICAgaWYgKGV2ZW50Lmh0dHBNZXRob2QgIT09ICdHRVQnKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDUsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICB9LFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnTWV0aG9kIG5vdCBhbGxvd2VkJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgcmV0dXJuIGF3YWl0IGhhbmRsZUdldFVzZXIodXNlcklkLCB1c2VybmFtZSk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignR2V0IHVzZXIgZXJyb3I6JywgZXJyb3IpO1xuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXNDb2RlOiA1MDAsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICB9LFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ0ludGVybmFsIHNlcnZlciBlcnJvcicgfSksXG4gICAgfTtcbiAgfVxufTtcblxuYXN5bmMgZnVuY3Rpb24gaGFuZGxlR2V0VXNlcihcbiAgdXNlcklkOiBzdHJpbmcsXG4gIHVzZXJuYW1lOiBzdHJpbmcsXG4pOiBQcm9taXNlPEFQSUdhdGV3YXlQcm94eVJlc3VsdD4ge1xuICBjb25zdCBnZXRDb21tYW5kID0gbmV3IEdldENvbW1hbmQoe1xuICAgIFRhYmxlTmFtZTogVVNFUlNfVEFCTEVfTkFNRSxcbiAgICBLZXk6IHtcbiAgICAgIHVzZXJJZDogdXNlcklkLFxuICAgICAgdXNlcm5hbWU6IHVzZXJuYW1lLFxuICAgIH0sXG4gIH0pO1xuXG4gIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKGdldENvbW1hbmQpO1xuXG4gIC8vIE5vIGFkZGl0aW9uYWwgdmFsaWRhdGlvbiBuZWVkZWQgc2luY2Ugd2UncmUgdXNpbmcgdGhlIGNvbXBvc2l0ZSBrZXkgKHVzZXJJZCArIHVzZXJuYW1lKVxuICAvLyBJZiB0aGUgaXRlbSBleGlzdHMsIGl0IG1lYW5zIGJvdGggdXNlcklkIGFuZCB1c2VybmFtZSBtYXRjaFxuXG4gIGlmICghcmVzdWx0Lkl0ZW0pIHtcbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogNDA0LFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgfSxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdVc2VyIG5vdCBmb3VuZCcgfSksXG4gICAgfTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgc3RhdHVzQ29kZTogMjAwLFxuICAgIGhlYWRlcnM6IHtcbiAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgfSxcbiAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgdXNlcjogcmVzdWx0Lkl0ZW0sXG4gICAgfSksXG4gIH07XG59XG4iXX0=