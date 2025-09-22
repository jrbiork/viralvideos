"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUser = getUser;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client = new client_dynamodb_1.DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1',
});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(client);
const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME || 'viral-videos-users';
/**
 * Fetch the user's subscription info by userId (partition key).
 * Falls back to a free subscription if user not found or subscription missing.
 */
async function getUser(userId) {
    try {
        const queryCommand = new lib_dynamodb_1.QueryCommand({
            TableName: USERS_TABLE_NAME,
            KeyConditionExpression: 'userId = :userId',
            ExpressionAttributeValues: {
                ':userId': userId,
            },
            Limit: 1,
        });
        const result = await docClient.send(queryCommand);
        const user = result.Items?.[0];
        if (!user) {
            return null;
        }
        return user;
    }
    catch (error) {
        console.error('Error fetching user subscription:', error);
        return null;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInVzZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUE0QkEsMEJBMEJDO0FBdERELDhEQUEwRDtBQUMxRCx3REFBNkU7QUFFN0UsTUFBTSxNQUFNLEdBQUcsSUFBSSxnQ0FBYyxDQUFDO0lBQ2hDLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsSUFBSSxXQUFXO0NBQzlDLENBQUMsQ0FBQztBQUVILE1BQU0sU0FBUyxHQUFHLHFDQUFzQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUV0RCxNQUFNLGdCQUFnQixHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLElBQUksb0JBQW9CLENBQUM7QUFlOUU7OztHQUdHO0FBQ0ksS0FBSyxVQUFVLE9BQU8sQ0FBQyxNQUFjO0lBQzFDLElBQUksQ0FBQztRQUNILE1BQU0sWUFBWSxHQUFHLElBQUksMkJBQVksQ0FBQztZQUNwQyxTQUFTLEVBQUUsZ0JBQWdCO1lBQzNCLHNCQUFzQixFQUFFLGtCQUFrQjtZQUMxQyx5QkFBeUIsRUFBRTtnQkFDekIsU0FBUyxFQUFFLE1BQU07YUFDbEI7WUFDRCxLQUFLLEVBQUUsQ0FBQztTQUNULENBQUMsQ0FBQztRQUVILE1BQU0sTUFBTSxHQUFHLE1BQU0sU0FBUyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUVsRCxNQUFNLElBQUksR0FBeUIsTUFBTSxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FFdEMsQ0FBQztRQUVkLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNWLE9BQU8sSUFBSSxDQUFDO1FBQ2QsQ0FBQztRQUVELE9BQU8sSUFBSSxDQUFDO0lBQ2QsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLG1DQUFtQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzFELE9BQU8sSUFBSSxDQUFDO0lBQ2QsQ0FBQztBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBEeW5hbW9EQkNsaWVudCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1keW5hbW9kYic7XG5pbXBvcnQgeyBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LCBRdWVyeUNvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9saWItZHluYW1vZGInO1xuXG5jb25zdCBjbGllbnQgPSBuZXcgRHluYW1vREJDbGllbnQoe1xuICByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfHwgJ3VzLWVhc3QtMScsXG59KTtcblxuY29uc3QgZG9jQ2xpZW50ID0gRHluYW1vREJEb2N1bWVudENsaWVudC5mcm9tKGNsaWVudCk7XG5cbmNvbnN0IFVTRVJTX1RBQkxFX05BTUUgPSBwcm9jZXNzLmVudi5VU0VSU19UQUJMRV9OQU1FIHx8ICd2aXJhbC12aWRlb3MtdXNlcnMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFVzZXJTdWJzY3JpcHRpb24ge1xuICBtb2RlOiAnZnJlZScgfCAnc3RhcnRlcicgfCAnY3JlYXRvcicgfCAnaW5mbHVlbmNlcic7XG4gIHJlbmV3YWxEYXRlOiBzdHJpbmcgfCBudWxsO1xuICBzdGF0dXM6ICdhY3RpdmUnIHwgJ2NhbmNlbGxlZCcgfCAnZXhwaXJlZCc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVXNlckl0ZW0ge1xuICB1c2VySWQ6IHN0cmluZztcbiAgdXNlcm5hbWU6IHN0cmluZztcbiAgc3Vic2NyaXB0aW9uPzogVXNlclN1YnNjcmlwdGlvbjtcbiAgW2tleTogc3RyaW5nXTogYW55O1xufVxuXG4vKipcbiAqIEZldGNoIHRoZSB1c2VyJ3Mgc3Vic2NyaXB0aW9uIGluZm8gYnkgdXNlcklkIChwYXJ0aXRpb24ga2V5KS5cbiAqIEZhbGxzIGJhY2sgdG8gYSBmcmVlIHN1YnNjcmlwdGlvbiBpZiB1c2VyIG5vdCBmb3VuZCBvciBzdWJzY3JpcHRpb24gbWlzc2luZy5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldFVzZXIodXNlcklkOiBzdHJpbmcpOiBQcm9taXNlPFVzZXJJdGVtIHwgbnVsbD4ge1xuICB0cnkge1xuICAgIGNvbnN0IHF1ZXJ5Q29tbWFuZCA9IG5ldyBRdWVyeUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiBVU0VSU19UQUJMRV9OQU1FLFxuICAgICAgS2V5Q29uZGl0aW9uRXhwcmVzc2lvbjogJ3VzZXJJZCA9IDp1c2VySWQnLFxuICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xuICAgICAgICAnOnVzZXJJZCc6IHVzZXJJZCxcbiAgICAgIH0sXG4gICAgICBMaW1pdDogMSxcbiAgICB9KTtcblxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKHF1ZXJ5Q29tbWFuZCk7XG5cbiAgICBjb25zdCB1c2VyOiBVc2VySXRlbSB8IHVuZGVmaW5lZCA9IHJlc3VsdC5JdGVtcz8uWzBdIGFzXG4gICAgICB8IFVzZXJJdGVtXG4gICAgICB8IHVuZGVmaW5lZDtcblxuICAgIGlmICghdXNlcikge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgcmV0dXJuIHVzZXI7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgZmV0Y2hpbmcgdXNlciBzdWJzY3JpcHRpb246JywgZXJyb3IpO1xuICAgIHJldHVybiBudWxsO1xuICB9XG59XG4iXX0=