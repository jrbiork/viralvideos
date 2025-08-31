"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasSufficientCredits = hasSufficientCredits;
exports.hasSufficientCreditsByUserId = hasSufficientCreditsByUserId;
exports.updateCreditBalance = updateCreditBalance;
exports.updateCreditBalanceByUserId = updateCreditBalanceByUserId;
exports.getCreditBalance = getCreditBalance;
exports.getCreditBalanceByUserId = getCreditBalanceByUserId;
exports.addCredits = addCredits;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client = new client_dynamodb_1.DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1',
});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(client);
const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME || 'viral-videos-users';
/**
 * Check if user has sufficient credit balance
 * @param userId - The user ID (partition key)
 * @param username - The username (sort key)
 * @param costToPay - The costToPay to check against
 * @returns Promise<boolean> - True if user has sufficient credits, false otherwise
 */
async function hasSufficientCredits(userId, username, costToPay) {
    try {
        console.log(`Checking credit balance for userId: ${userId}, username: ${username}, costToPay: ${costToPay}`);
        const getCommand = new lib_dynamodb_1.GetCommand({
            TableName: USERS_TABLE_NAME,
            Key: {
                userId: userId,
                username: username,
            },
        });
        const result = await docClient.send(getCommand);
        if (!result.Item) {
            console.log(`User not found for userId: ${userId}, username: ${username}`);
            return false;
        }
        const user = result.Item;
        const currentCredits = user.creditsAvailable || 0;
        console.log(`User ${userId} (${username}) has ${currentCredits} credits, required: ${costToPay}`);
        return currentCredits >= costToPay;
    }
    catch (error) {
        console.error('Error checking credit balance:', error);
        return false;
    }
}
/**
 * Check if user has sufficient credit balance using only userId
 * @param userId - The user ID (partition key)
 * @param costToPay - The costToPay to check against
 * @returns Promise<boolean> - True if user has sufficient credits, false otherwise
 */
async function hasSufficientCreditsByUserId(userId, costToPay) {
    try {
        console.log(`Checking credit balance for userId: ${userId}, costToPay: ${costToPay}`);
        const currentCredits = await getCreditBalanceByUserId(userId);
        console.log(`User ${userId} has ${currentCredits} credits, required: ${costToPay}`);
        return currentCredits >= costToPay;
    }
    catch (error) {
        console.error('Error checking credit balance:', error);
        return false;
    }
}
/**
 * Update user's credit balance by deducting the costToPay
 * @param userId - The user ID (partition key)
 * @param username - The username (sort key)
 * @param costToPay - The costToPay to deduct
 * @returns Promise<number> - The updated credit balance
 */
async function updateCreditBalance(userId, username, costToPay) {
    try {
        console.log(`Updating credit balance for userId: ${userId}, username: ${username}, deducting: ${costToPay}`);
        // First check if user has sufficient credits
        const hasCredits = await hasSufficientCredits(userId, username, costToPay);
        if (!hasCredits) {
            throw new Error(`Insufficient credits for user ${userId} (${username})`);
        }
        // Update the credit balance
        const updateCommand = new lib_dynamodb_1.UpdateCommand({
            TableName: USERS_TABLE_NAME,
            Key: {
                userId: userId,
                username: username,
            },
            UpdateExpression: 'SET creditsAvailable = creditsAvailable - :costToPay',
            ExpressionAttributeValues: {
                ':costToPay': costToPay,
            },
            ReturnValues: 'ALL_NEW',
        });
        const result = await docClient.send(updateCommand);
        if (!result.Attributes) {
            throw new Error('Failed to update credit balance');
        }
        const updatedCredits = result.Attributes.creditsAvailable;
        console.log(`Credit balance updated for user ${userId} (${username}). New balance: ${updatedCredits}`);
        return updatedCredits;
    }
    catch (error) {
        console.error('Error updating credit balance:', error);
        throw error;
    }
}
/**
 * Update user's credit balance by deducting the costToPay using only userId
 * @param userId - The user ID (partition key)
 * @param costToPay - The costToPay to deduct
 * @returns Promise<number> - The updated credit balance
 */
async function updateCreditBalanceByUserId(userId, costToPay) {
    try {
        console.log(`Updating credit balance for userId: ${userId}, deducting: ${costToPay}`);
        // First check if user has sufficient credits
        const currentCredits = await getCreditBalanceByUserId(userId);
        if (currentCredits < costToPay) {
            throw new Error(`Insufficient credits for user ${userId}. Current: ${currentCredits}, Required: ${costToPay}`);
        }
        // Get the user's username first
        const queryCommand = new lib_dynamodb_1.QueryCommand({
            TableName: USERS_TABLE_NAME,
            KeyConditionExpression: 'userId = :userId',
            ExpressionAttributeValues: {
                ':userId': userId,
            },
            Limit: 1,
        });
        const queryResult = await docClient.send(queryCommand);
        if (!queryResult.Items || queryResult.Items.length === 0) {
            throw new Error(`User not found for userId: ${userId}`);
        }
        const user = queryResult.Items[0];
        const username = user.username;
        // Update the credit balance
        const updateCommand = new lib_dynamodb_1.UpdateCommand({
            TableName: USERS_TABLE_NAME,
            Key: {
                userId: userId,
                username: username,
            },
            UpdateExpression: 'SET creditsAvailable = creditsAvailable - :costToPay',
            ExpressionAttributeValues: {
                ':costToPay': costToPay,
            },
            ReturnValues: 'ALL_NEW',
        });
        const result = await docClient.send(updateCommand);
        if (!result.Attributes) {
            throw new Error('Failed to update credit balance');
        }
        const updatedCredits = result.Attributes.creditsAvailable;
        console.log(`Credit balance updated for user ${userId}. New balance: ${updatedCredits}`);
        return updatedCredits;
    }
    catch (error) {
        console.error('Error updating credit balance:', error);
        throw error;
    }
}
/**
 * Get user's current credit balance
 * @param userId - The user ID (partition key)
 * @param username - The username (sort key)
 * @returns Promise<number> - The current credit balance
 */
async function getCreditBalance(userId, username) {
    try {
        console.log(`Getting credit balance for userId: ${userId}, username: ${username}`);
        const getCommand = new lib_dynamodb_1.GetCommand({
            TableName: USERS_TABLE_NAME,
            Key: {
                userId: userId,
                username: username,
            },
        });
        const result = await docClient.send(getCommand);
        if (!result.Item) {
            console.log(`User not found for userId: ${userId}, username: ${username}`);
            return 0;
        }
        const user = result.Item;
        const currentCredits = user.creditsAvailable || 0;
        console.log(`User ${userId} (${username}) has ${currentCredits} credits`);
        return currentCredits;
    }
    catch (error) {
        console.error('Error getting credit balance:', error);
        return 0;
    }
}
/**
 * Get user's current credit balance using only userId
 * @param userId - The user ID (partition key)
 * @returns Promise<number> - The current credit balance
 */
async function getCreditBalanceByUserId(userId) {
    try {
        console.log(`Getting credit balance for userId: ${userId}`);
        const queryCommand = new lib_dynamodb_1.QueryCommand({
            TableName: USERS_TABLE_NAME,
            KeyConditionExpression: 'userId = :userId',
            ExpressionAttributeValues: {
                ':userId': userId,
            },
            Limit: 1,
        });
        const result = await docClient.send(queryCommand);
        if (!result.Items || result.Items.length === 0) {
            console.log(`User not found for userId: ${userId}`);
            return 0;
        }
        const user = result.Items[0];
        const currentCredits = user.creditsAvailable || 0;
        console.log(`User ${userId} has ${currentCredits} credits`);
        return currentCredits;
    }
    catch (error) {
        console.error('Error getting credit balance:', error);
        return 0;
    }
}
/**
 * Add credits to user's balance
 * @param userId - The user ID (partition key)
 * @param username - The username (sort key)
 * @param credits - The credits to add
 * @returns Promise<number> - The updated credit balance
 */
async function addCredits(userId, username, credits) {
    try {
        console.log(`Adding ${credits} credits for userId: ${userId}, username: ${username}`);
        const updateCommand = new lib_dynamodb_1.UpdateCommand({
            TableName: USERS_TABLE_NAME,
            Key: {
                userId: userId,
                username: username,
            },
            UpdateExpression: 'SET creditsAvailable = if_not_exists(creditsAvailable, :zero) + :credits',
            ExpressionAttributeValues: {
                ':credits': credits,
                ':zero': 0,
            },
            ReturnValues: 'ALL_NEW',
        });
        const result = await docClient.send(updateCommand);
        if (!result.Attributes) {
            throw new Error('Failed to add credits');
        }
        const updatedCredits = result.Attributes.creditsAvailable;
        console.log(`Credits added for user ${userId} (${username}). New balance: ${updatedCredits}`);
        return updatedCredits;
    }
    catch (error) {
        console.error('Error adding credits:', error);
        throw error;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3JlZGl0cy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImNyZWRpdHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUE4QkEsb0RBdUNDO0FBUUQsb0VBb0JDO0FBU0Qsa0RBZ0RDO0FBUUQsa0VBb0VDO0FBUUQsNENBb0NDO0FBT0QsNERBZ0NDO0FBU0QsZ0NBMENDO0FBNVdELDhEQUEwRDtBQUMxRCx3REFLK0I7QUFFL0IsTUFBTSxNQUFNLEdBQUcsSUFBSSxnQ0FBYyxDQUFDO0lBQ2hDLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsSUFBSSxXQUFXO0NBQzlDLENBQUMsQ0FBQztBQUVILE1BQU0sU0FBUyxHQUFHLHFDQUFzQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUV0RCxNQUFNLGdCQUFnQixHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLElBQUksb0JBQW9CLENBQUM7QUFTOUU7Ozs7OztHQU1HO0FBQ0ksS0FBSyxVQUFVLG9CQUFvQixDQUN4QyxNQUFjLEVBQ2QsUUFBZ0IsRUFDaEIsU0FBaUI7SUFFakIsSUFBSSxDQUFDO1FBQ0gsT0FBTyxDQUFDLEdBQUcsQ0FDVCx1Q0FBdUMsTUFBTSxlQUFlLFFBQVEsZ0JBQWdCLFNBQVMsRUFBRSxDQUNoRyxDQUFDO1FBRUYsTUFBTSxVQUFVLEdBQUcsSUFBSSx5QkFBVSxDQUFDO1lBQ2hDLFNBQVMsRUFBRSxnQkFBZ0I7WUFDM0IsR0FBRyxFQUFFO2dCQUNILE1BQU0sRUFBRSxNQUFNO2dCQUNkLFFBQVEsRUFBRSxRQUFRO2FBQ25CO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsTUFBTSxNQUFNLEdBQUcsTUFBTSxTQUFTLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBRWhELElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDakIsT0FBTyxDQUFDLEdBQUcsQ0FDVCw4QkFBOEIsTUFBTSxlQUFlLFFBQVEsRUFBRSxDQUM5RCxD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QztZQUN2QixNQUFNLElBQUksS0FBSyxDQUFDLHVCQUF1QixDQUFDLENBQUM7UUFDM0MsQ0FBQztRQUVELE1BQU0sY0FBYyxHQUFHLE1BQU0sQ0FBQyxVQUFVLENBQUMsZ0JBQTBCLENBQUM7UUFFcEUsT0FBTyxDQUFDLEdBQUcsQ0FDVCwwQkFBMEIsTUFBTSxLQUFLLFFBQVEsbUJBQW1CLGNBQWMsRUFBRSxDQUNqRixDQUFDO1FBRUYsT0FBTyxjQUFjLENBQUM7SUFDeEIsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLHVCQUF1QixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzlDLE1BQU0sS0FBSyxDQUFDO0lBQ2QsQ0FBQztBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBEeW5hbW9EQkNsaWVudCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1keW5hbW9kYic7XG5pbXBvcnQge1xuICBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LFxuICBHZXRDb21tYW5kLFxuICBVcGRhdGVDb21tYW5kLFxuICBRdWVyeUNvbW1hbmQsXG59IGZyb20gJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYic7XG5cbmNvbnN0IGNsaWVudCA9IG5ldyBEeW5hbW9EQkNsaWVudCh7XG4gIHJlZ2lvbjogcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB8fCAndXMtZWFzdC0xJyxcbn0pO1xuXG5jb25zdCBkb2NDbGllbnQgPSBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LmZyb20oY2xpZW50KTtcblxuY29uc3QgVVNFUlNfVEFCTEVfTkFNRSA9IHByb2Nlc3MuZW52LlVTRVJTX1RBQkxFX05BTUUgfHwgJ3ZpcmFsLXZpZGVvcy11c2Vycyc7XG5cbmludGVyZmFjZSBVc2VyIHtcbiAgdXNlcklkOiBzdHJpbmc7XG4gIHVzZXJuYW1lOiBzdHJpbmc7XG4gIGNyZWRpdHNBdmFpbGFibGU6IG51bWJlcjtcbiAgW2tleTogc3RyaW5nXTogYW55O1xufVxuXG4vKipcbiAqIENoZWNrIGlmIHVzZXIgaGFzIHN1ZmZpY2llbnQgY3JlZGl0IGJhbGFuY2VcbiAqIEBwYXJhbSB1c2VySWQgLSBUaGUgdXNlciBJRCAocGFydGl0aW9uIGtleSlcbiAqIEBwYXJhbSB1c2VybmFtZSAtIFRoZSB1c2VybmFtZSAoc29ydCBrZXkpXG4gKiBAcGFyYW0gY29zdFRvUGF5IC0gVGhlIGNvc3RUb1BheSB0byBjaGVjayBhZ2FpbnN0XG4gKiBAcmV0dXJucyBQcm9taXNlPGJvb2xlYW4+IC0gVHJ1ZSBpZiB1c2VyIGhhcyBzdWZmaWNpZW50IGNyZWRpdHMsIGZhbHNlIG90aGVyd2lzZVxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gaGFzU3VmZmljaWVudENyZWRpdHMoXG4gIHVzZXJJZDogc3RyaW5nLFxuICB1c2VybmFtZTogc3RyaW5nLFxuICBjb3N0VG9QYXk6IG51bWJlcixcbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuICB0cnkge1xuICAgIGNvbnNvbGUubG9nKFxuICAgICAgYENoZWNraW5nIGNyZWRpdCBiYWxhbmNlIGZvciB1c2VySWQ6ICR7dXNlcklkfSwgdXNlcm5hbWU6ICR7dXNlcm5hbWV9LCBjb3N0VG9QYXk6ICR7Y29zdFRvUGF5fWAsXG4gICAgKTtcblxuICAgIGNvbnN0IGdldENvbW1hbmQgPSBuZXcgR2V0Q29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IFVTRVJTX1RBQkxFX05BTUUsXG4gICAgICBLZXk6IHtcbiAgICAgICAgdXNlcklkOiB1c2VySWQsXG4gICAgICAgIHVzZXJuYW1lOiB1c2VybmFtZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBkb2NDbGllbnQuc2VuZChnZXRDb21tYW5kKTtcblxuICAgIGlmICghcmVzdWx0Lkl0ZW0pIHtcbiAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICBgVXNlciBub3QgZm91bmQgZm9yIHVzZXJJZDogJHt1c2VySWR9LCB1c2VybmFtZTogJHt1c2VybmFtZX1gLFxuICAgICAgKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBjb25zdCB1c2VyID0gcmVzdWx0Lkl0ZW0gYXMgVXNlcjtcbiAgICBjb25zdCBjdXJyZW50Q3JlZGl0cyA9IHVzZXIuY3JlZGl0c0F2YWlsYWJsZSB8fCAwO1xuXG4gICAgY29uc29sZS5sb2coXG4gICAgICBgVXNlciAke3VzZXJJZH0gKCR7dXNlcm5hbWV9KSBoYXMgJHtjdXJyZW50Q3JlZGl0c30gY3JlZGl0cywgcmVxdWlyZWQ6ICR7Y29zdFRvUGF5fWAsXG4gICAgKTtcblxuICAgIHJldHVybiBjdXJyZW50Q3JlZGl0cyA+PSBjb3N0VG9QYXk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgY2hlY2tpbmcgY3JlZGl0IGJhbGFuY2U6JywgZXJyb3IpO1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxufVxuXG4vKipcbiAqIENoZWNrIGlmIHVzZXIgaGFzIHN1ZmZpY2llbnQgY3JlZGl0IGJhbGFuY2UgdXNpbmcgb25seSB1c2VySWRcbiAqIEBwYXJhbSB1c2VySWQgLSBUaGUgdXNlciBJRCAocGFydGl0aW9uIGtleSlcbiAqIEBwYXJhbSBjb3N0VG9QYXkgLSBUaGUgY29zdFRvUGF5IHRvIGNoZWNrIGFnYWluc3RcbiAqIEByZXR1cm5zIFByb21pc2U8Ym9vbGVhbj4gLSBUcnVlIGlmIHVzZXIgaGFzIHN1ZmZpY2llbnQgY3JlZGl0cywgZmFsc2Ugb3RoZXJ3aXNlXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBoYXNTdWZmaWNpZW50Q3JlZGl0c0J5VXNlcklkKFxuICB1c2VySWQ6IHN0cmluZyxcbiAgY29zdFRvUGF5OiBudW1iZXIsXG4pOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgdHJ5IHtcbiAgICBjb25zb2xlLmxvZyhcbiAgICAgIGBDaGVja2luZyBjcmVkaXQgYmFsYW5jZSBmb3IgdXNlcklkOiAke3VzZXJJZH0sIGNvc3RUb1BheTogJHtjb3N0VG9QYXl9YCxcbiAgICApO1xuXG4gICAgY29uc3QgY3VycmVudENyZWRpdHMgPSBhd2FpdCBnZXRDcmVkaXRCYWxhbmNlQnlVc2VySWQodXNlcklkKTtcblxuICAgIGNvbnNvbGUubG9nKFxuICAgICAgYFVzZXIgJHt1c2VySWR9IGhhcyAke2N1cnJlbnRDcmVkaXRzfSBjcmVkaXRzLCByZXF1aXJlZDogJHtjb3N0VG9QYXl9YCxcbiAgICApO1xuXG4gICAgcmV0dXJuIGN1cnJlbnRDcmVkaXRzID49IGNvc3RUb1BheTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBjaGVja2luZyBjcmVkaXQgYmFsYW5jZTonLCBlcnJvcik7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG59XG5cbi8qKlxuICogVXBkYXRlIHVzZXIncyBjcmVkaXQgYmFsYW5jZSBieSBkZWR1Y3RpbmcgdGhlIGNvc3RUb1BheVxuICogQHBhcmFtIHVzZXJJZCAtIFRoZSB1c2VyIElEIChwYXJ0aXRpb24ga2V5KVxuICogQHBhcmFtIHVzZXJuYW1lIC0gVGhlIHVzZXJuYW1lIChzb3J0IGtleSlcbiAqIEBwYXJhbSBjb3N0VG9QYXkgLSBUaGUgY29zdFRvUGF5IHRvIGRlZHVjdFxuICogQHJldHVybnMgUHJvbWlzZTxudW1iZXI+IC0gVGhlIHVwZGF0ZWQgY3JlZGl0IGJhbGFuY2VcbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHVwZGF0ZUNyZWRpdEJhbGFuY2UoXG4gIHVzZXJJZDogc3RyaW5nLFxuICB1c2VybmFtZTogc3RyaW5nLFxuICBjb3N0VG9QYXk6IG51bWJlcixcbik6IFByb21pc2U8bnVtYmVyPiB7XG4gIHRyeSB7XG4gICAgY29uc29sZS5sb2coXG4gICAgICBgVXBkYXRpbmcgY3JlZGl0IGJhbGFuY2UgZm9yIHVzZXJJZDogJHt1c2VySWR9LCB1c2VybmFtZTogJHt1c2VybmFtZX0sIGRlZHVjdGluZzogJHtjb3N0VG9QYXl9YCxcbiAgICApO1xuXG4gICAgLy8gRmlyc3QgY2hlY2sgaWYgdXNlciBoYXMgc3VmZmljaWVudCBjcmVkaXRzXG4gICAgY29uc3QgaGFzQ3JlZGl0cyA9IGF3YWl0IGhhc1N1ZmZpY2llbnRDcmVkaXRzKHVzZXJJZCwgdXNlcm5hbWUsIGNvc3RUb1BheSk7XG5cbiAgICBpZiAoIWhhc0NyZWRpdHMpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgSW5zdWZmaWNpZW50IGNyZWRpdHMgZm9yIHVzZXIgJHt1c2VySWR9ICgke3VzZXJuYW1lfSlgKTtcbiAgICB9XG5cbiAgICAvLyBVcGRhdGUgdGhlIGNyZWRpdCBiYWxhbmNlXG4gICAgY29uc3QgdXBkYXRlQ29tbWFuZCA9IG5ldyBVcGRhdGVDb21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogVVNFUlNfVEFCTEVfTkFNRSxcbiAgICAgIEtleToge1xuICAgICAgICB1c2VySWQ6IHVzZXJJZCxcbiAgICAgICAgdXNlcm5hbWU6IHVzZXJuYW1lLFxuICAgICAgfSxcbiAgICAgIFVwZGF0ZUV4cHJlc3Npb246ICdTRVQgY3JlZGl0c0F2YWlsYWJsZSA9IGNyZWRpdHNBdmFpbGFibGUgLSA6Y29zdFRvUGF5JyxcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcbiAgICAgICAgJzpjb3N0VG9QYXknOiBjb3N0VG9QYXksXG4gICAgICB9LFxuICAgICAgUmV0dXJuVmFsdWVzOiAnQUxMX05FVycsXG4gICAgfSk7XG5cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBkb2NDbGllbnQuc2VuZCh1cGRhdGVDb21tYW5kKTtcblxuICAgIGlmICghcmVzdWx0LkF0dHJpYnV0ZXMpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignRmFpbGVkIHRvIHVwZGF0ZSBjcmVkaXQgYmFsYW5jZScpO1xuICAgIH1cblxuICAgIGNvbnN0IHVwZGF0ZWRDcmVkaXRzID0gcmVzdWx0LkF0dHJpYnV0ZXMuY3JlZGl0c0F2YWlsYWJsZSBhcyBudW1iZXI7XG5cbiAgICBjb25zb2xlLmxvZyhcbiAgICAgIGBDcmVkaXQgYmFsYW5jZSB1cGRhdGVkIGZvciB1c2VyICR7dXNlcklkfSAoJHt1c2VybmFtZX0pLiBOZXcgYmFsYW5jZTogJHt1cGRhdGVkQ3JlZGl0c31gLFxuICAgICk7XG5cbiAgICByZXR1cm4gdXBkYXRlZENyZWRpdHM7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgdXBkYXRpbmcgY3JlZGl0IGJhbGFuY2U6JywgZXJyb3IpO1xuICAgIHRocm93IGVycm9yO1xuICB9XG59XG5cbi8qKlxuICogVXBkYXRlIHVzZXIncyBjcmVkaXQgYmFsYW5jZSBieSBkZWR1Y3RpbmcgdGhlIGNvc3RUb1BheSB1c2luZyBvbmx5IHVzZXJJZFxuICogQHBhcmFtIHVzZXJJZCAtIFRoZSB1c2VyIElEIChwYXJ0aXRpb24ga2V5KVxuICogQHBhcmFtIGNvc3RUb1BheSAtIFRoZSBjb3N0VG9QYXkgdG8gZGVkdWN0XG4gKiBAcmV0dXJucyBQcm9taXNlPG51bWJlcj4gLSBUaGUgdXBkYXRlZCBjcmVkaXQgYmFsYW5jZVxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gdXBkYXRlQ3JlZGl0QmFsYW5jZUJ5VXNlcklkKFxuICB1c2VySWQ6IHN0cmluZyxcbiAgY29zdFRvUGF5OiBudW1iZXIsXG4pOiBQcm9taXNlPG51bWJlcj4ge1xuICB0cnkge1xuICAgIGNvbnNvbGUubG9nKFxuICAgICAgYFVwZGF0aW5nIGNyZWRpdCBiYWxhbmNlIGZvciB1c2VySWQ6ICR7dXNlcklkfSwgZGVkdWN0aW5nOiAke2Nvc3RUb1BheX1gLFxuICAgICk7XG5cbiAgICAvLyBGaXJzdCBjaGVjayBpZiB1c2VyIGhhcyBzdWZmaWNpZW50IGNyZWRpdHNcbiAgICBjb25zdCBjdXJyZW50Q3JlZGl0cyA9IGF3YWl0IGdldENyZWRpdEJhbGFuY2VCeVVzZXJJZCh1c2VySWQpO1xuXG4gICAgaWYgKGN1cnJlbnRDcmVkaXRzIDwgY29zdFRvUGF5KSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgIGBJbnN1ZmZpY2llbnQgY3JlZGl0cyBmb3IgdXNlciAke3VzZXJJZH0uIEN1cnJlbnQ6ICR7Y3VycmVudENyZWRpdHN9LCBSZXF1aXJlZDogJHtjb3N0VG9QYXl9YCxcbiAgICAgICk7XG4gICAgfVxuXG4gICAgLy8gR2V0IHRoZSB1c2VyJ3MgdXNlcm5hbWUgZmlyc3RcbiAgICBjb25zdCBxdWVyeUNvbW1hbmQgPSBuZXcgUXVlcnlDb21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogVVNFUlNfVEFCTEVfTkFNRSxcbiAgICAgIEtleUNvbmRpdGlvbkV4cHJlc3Npb246ICd1c2VySWQgPSA6dXNlcklkJyxcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcbiAgICAgICAgJzp1c2VySWQnOiB1c2VySWQsXG4gICAgICB9LFxuICAgICAgTGltaXQ6IDEsXG4gICAgfSk7XG5cbiAgICBjb25zdCBxdWVyeVJlc3VsdCA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKHF1ZXJ5Q29tbWFuZCk7XG5cbiAgICBpZiAoIXF1ZXJ5UmVzdWx0Lkl0ZW1zIHx8IHF1ZXJ5UmVzdWx0Lkl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBVc2VyIG5vdCBmb3VuZCBmb3IgdXNlcklkOiAke3VzZXJJZH1gKTtcbiAgICB9XG5cbiAgICBjb25zdCB1c2VyID0gcXVlcnlSZXN1bHQuSXRlbXNbMF0gYXMgVXNlcjtcbiAgICBjb25zdCB1c2VybmFtZSA9IHVzZXIudXNlcm5hbWU7XG5cbiAgICAvLyBVcGRhdGUgdGhlIGNyZWRpdCBiYWxhbmNlXG4gICAgY29uc3QgdXBkYXRlQ29tbWFuZCA9IG5ldyBVcGRhdGVDb21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogVVNFUlNfVEFCTEVfTkFNRSxcbiAgICAgIEtleToge1xuICAgICAgICB1c2VySWQ6IHVzZXJJZCxcbiAgICAgICAgdXNlcm5hbWU6IHVzZXJuYW1lLFxuICAgICAgfSxcbiAgICAgIFVwZGF0ZUV4cHJlc3Npb246ICdTRVQgY3JlZGl0c0F2YWlsYWJsZSA9IGNyZWRpdHNBdmFpbGFibGUgLSA6Y29zdFRvUGF5JyxcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcbiAgICAgICAgJzpjb3N0VG9QYXknOiBjb3N0VG9QYXksXG4gICAgICB9LFxuICAgICAgUmV0dXJuVmFsdWVzOiAnQUxMX05FVycsXG4gICAgfSk7XG5cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBkb2NDbGllbnQuc2VuZCh1cGRhdGVDb21tYW5kKTtcblxuICAgIGlmICghcmVzdWx0LkF0dHJpYnV0ZXMpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignRmFpbGVkIHRvIHVwZGF0ZSBjcmVkaXQgYmFsYW5jZScpO1xuICAgIH1cblxuICAgIGNvbnN0IHVwZGF0ZWRDcmVkaXRzID0gcmVzdWx0LkF0dHJpYnV0ZXMuY3JlZGl0c0F2YWlsYWJsZSBhcyBudW1iZXI7XG5cbiAgICBjb25zb2xlLmxvZyhcbiAgICAgIGBDcmVkaXQgYmFsYW5jZSB1cGRhdGVkIGZvciB1c2VyICR7dXNlcklkfS4gTmV3IGJhbGFuY2U6ICR7dXBkYXRlZENyZWRpdHN9YCxcbiAgICApO1xuXG4gICAgcmV0dXJuIHVwZGF0ZWRDcmVkaXRzO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHVwZGF0aW5nIGNyZWRpdCBiYWxhbmNlOicsIGVycm9yKTtcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufVxuXG4vKipcbiAqIEdldCB1c2VyJ3MgY3VycmVudCBjcmVkaXQgYmFsYW5jZVxuICogQHBhcmFtIHVzZXJJZCAtIFRoZSB1c2VyIElEIChwYXJ0aXRpb24ga2V5KVxuICogQHBhcmFtIHVzZXJuYW1lIC0gVGhlIHVzZXJuYW1lIChzb3J0IGtleSlcbiAqIEByZXR1cm5zIFByb21pc2U8bnVtYmVyPiAtIFRoZSBjdXJyZW50IGNyZWRpdCBiYWxhbmNlXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRDcmVkaXRCYWxhbmNlKFxuICB1c2VySWQ6IHN0cmluZyxcbiAgdXNlcm5hbWU6IHN0cmluZyxcbik6IFByb21pc2U8bnVtYmVyPiB7XG4gIHRyeSB7XG4gICAgY29uc29sZS5sb2coXG4gICAgICBgR2V0dGluZyBjcmVkaXQgYmFsYW5jZSBmb3IgdXNlcklkOiAke3VzZXJJZH0sIHVzZXJuYW1lOiAke3VzZXJuYW1lfWAsXG4gICAgKTtcblxuICAgIGNvbnN0IGdldENvbW1hbmQgPSBuZXcgR2V0Q29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IFVTRVJTX1RBQkxFX05BTUUsXG4gICAgICBLZXk6IHtcbiAgICAgICAgdXNlcklkOiB1c2VySWQsXG4gICAgICAgIHVzZXJuYW1lOiB1c2VybmFtZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBkb2NDbGllbnQuc2VuZChnZXRDb21tYW5kKTtcblxuICAgIGlmICghcmVzdWx0Lkl0ZW0pIHtcbiAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICBgVXNlciBub3QgZm91bmQgZm9yIHVzZXJJZDogJHt1c2VySWR9LCB1c2VybmFtZTogJHt1c2VybmFtZX1gLFxuICAgICAgKTtcbiAgICAgIHJldHVybiAwO1xuICAgIH1cblxuICAgIGNvbnN0IHVzZXIgPSByZXN1bHQuSXRlbSBhcyBVc2VyO1xuICAgIGNvbnN0IGN1cnJlbnRDcmVkaXRzID0gdXNlci5jcmVkaXRzQXZhaWxhYmxlIHx8IDA7XG5cbiAgICBjb25zb2xlLmxvZyhgVXNlciAke3VzZXJJZH0gKCR7dXNlcm5hbWV9KSBoYXMgJHtjdXJyZW50Q3JlZGl0c30gY3JlZGl0c2ApO1xuXG4gICAgcmV0dXJuIGN1cnJlbnRDcmVkaXRzO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGdldHRpbmcgY3JlZGl0IGJhbGFuY2U6JywgZXJyb3IpO1xuICAgIHJldHVybiAwO1xuICB9XG59XG5cbi8qKlxuICogR2V0IHVzZXIncyBjdXJyZW50IGNyZWRpdCBiYWxhbmNlIHVzaW5nIG9ubHkgdXNlcklkXG4gKiBAcGFyYW0gdXNlcklkIC0gVGhlIHVzZXIgSUQgKHBhcnRpdGlvbiBrZXkpXG4gKiBAcmV0dXJucyBQcm9taXNlPG51bWJlcj4gLSBUaGUgY3VycmVudCBjcmVkaXQgYmFsYW5jZVxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0Q3JlZGl0QmFsYW5jZUJ5VXNlcklkKFxuICB1c2VySWQ6IHN0cmluZyxcbik6IFByb21pc2U8bnVtYmVyPiB7XG4gIHRyeSB7XG4gICAgY29uc29sZS5sb2coYEdldHRpbmcgY3JlZGl0IGJhbGFuY2UgZm9yIHVzZXJJZDogJHt1c2VySWR9YCk7XG5cbiAgICBjb25zdCBxdWVyeUNvbW1hbmQgPSBuZXcgUXVlcnlDb21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogVVNFUlNfVEFCTEVfTkFNRSxcbiAgICAgIEtleUNvbmRpdGlvbkV4cHJlc3Npb246ICd1c2VySWQgPSA6dXNlcklkJyxcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcbiAgICAgICAgJzp1c2VySWQnOiB1c2VySWQsXG4gICAgICB9LFxuICAgICAgTGltaXQ6IDEsXG4gICAgfSk7XG5cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBkb2NDbGllbnQuc2VuZChxdWVyeUNvbW1hbmQpO1xuXG4gICAgaWYgKCFyZXN1bHQuSXRlbXMgfHwgcmVzdWx0Lkl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuICAgICAgY29uc29sZS5sb2coYFVzZXIgbm90IGZvdW5kIGZvciB1c2VySWQ6ICR7dXNlcklkfWApO1xuICAgICAgcmV0dXJuIDA7XG4gICAgfVxuXG4gICAgY29uc3QgdXNlciA9IHJlc3VsdC5JdGVtc1swXSBhcyBVc2VyO1xuICAgIGNvbnN0IGN1cnJlbnRDcmVkaXRzID0gdXNlci5jcmVkaXRzQXZhaWxhYmxlIHx8IDA7XG5cbiAgICBjb25zb2xlLmxvZyhgVXNlciAke3VzZXJJZH0gaGFzICR7Y3VycmVudENyZWRpdHN9IGNyZWRpdHNgKTtcblxuICAgIHJldHVybiBjdXJyZW50Q3JlZGl0cztcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBnZXR0aW5nIGNyZWRpdCBiYWxhbmNlOicsIGVycm9yKTtcbiAgICByZXR1cm4gMDtcbiAgfVxufVxuXG4vKipcbiAqIEFkZCBjcmVkaXRzIHRvIHVzZXIncyBiYWxhbmNlXG4gKiBAcGFyYW0gdXNlcklkIC0gVGhlIHVzZXIgSUQgKHBhcnRpdGlvbiBrZXkpXG4gKiBAcGFyYW0gdXNlcm5hbWUgLSBUaGUgdXNlcm5hbWUgKHNvcnQga2V5KVxuICogQHBhcmFtIGNyZWRpdHMgLSBUaGUgY3JlZGl0cyB0byBhZGRcbiAqIEByZXR1cm5zIFByb21pc2U8bnVtYmVyPiAtIFRoZSB1cGRhdGVkIGNyZWRpdCBiYWxhbmNlXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBhZGRDcmVkaXRzKFxuICB1c2VySWQ6IHN0cmluZyxcbiAgdXNlcm5hbWU6IHN0cmluZyxcbiAgY3JlZGl0czogbnVtYmVyLFxuKTogUHJvbWlzZTxudW1iZXI+IHtcbiAgdHJ5IHtcbiAgICBjb25zb2xlLmxvZyhcbiAgICAgIGBBZGRpbmcgJHtjcmVkaXRzfSBjcmVkaXRzIGZvciB1c2VySWQ6ICR7dXNlcklkfSwgdXNlcm5hbWU6ICR7dXNlcm5hbWV9YCxcbiAgICApO1xuXG4gICAgY29uc3QgdXBkYXRlQ29tbWFuZCA9IG5ldyBVcGRhdGVDb21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogVVNFUlNfVEFCTEVfTkFNRSxcbiAgICAgIEtleToge1xuICAgICAgICB1c2VySWQ6IHVzZXJJZCxcbiAgICAgICAgdXNlcm5hbWU6IHVzZXJuYW1lLFxuICAgICAgfSxcbiAgICAgIFVwZGF0ZUV4cHJlc3Npb246XG4gICAgICAgICdTRVQgY3JlZGl0c0F2YWlsYWJsZSA9IGlmX25vdF9leGlzdHMoY3JlZGl0c0F2YWlsYWJsZSwgOnplcm8pICsgOmNyZWRpdHMnLFxuICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xuICAgICAgICAnOmNyZWRpdHMnOiBjcmVkaXRzLFxuICAgICAgICAnOnplcm8nOiAwLFxuICAgICAgfSxcbiAgICAgIFJldHVyblZhbHVlczogJ0FMTF9ORVcnLFxuICAgIH0pO1xuXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQodXBkYXRlQ29tbWFuZCk7XG5cbiAgICBpZiAoIXJlc3VsdC5BdHRyaWJ1dGVzKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byBhZGQgY3JlZGl0cycpO1xuICAgIH1cblxuICAgIGNvbnN0IHVwZGF0ZWRDcmVkaXRzID0gcmVzdWx0LkF0dHJpYnV0ZXMuY3JlZGl0c0F2YWlsYWJsZSBhcyBudW1iZXI7XG5cbiAgICBjb25zb2xlLmxvZyhcbiAgICAgIGBDcmVkaXRzIGFkZGVkIGZvciB1c2VyICR7dXNlcklkfSAoJHt1c2VybmFtZX0pLiBOZXcgYmFsYW5jZTogJHt1cGRhdGVkQ3JlZGl0c31gLFxuICAgICk7XG5cbiAgICByZXR1cm4gdXBkYXRlZENyZWRpdHM7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgYWRkaW5nIGNyZWRpdHM6JywgZXJyb3IpO1xuICAgIHRocm93IGVycm9yO1xuICB9XG59XG4iXX0=