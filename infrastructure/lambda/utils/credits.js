"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasSufficientCredits = hasSufficientCredits;
exports.updateCreditBalance = updateCreditBalance;
exports.getCreditBalance = getCreditBalance;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3JlZGl0cy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImNyZWRpdHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUE2QkEsb0RBdUNDO0FBU0Qsa0RBZ0RDO0FBUUQsNENBb0NDO0FBU0QsZ0NBMENDO0FBNU5ELDhEQUEwRDtBQUMxRCx3REFJK0I7QUFFL0IsTUFBTSxNQUFNLEdBQUcsSUFBSSxnQ0FBYyxDQUFDO0lBQ2hDLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsSUFBSSxXQUFXO0NBQzlDLENBQUMsQ0FBQztBQUVILE1BQU0sU0FBUyxHQUFHLHFDQUFzQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUV0RCxNQUFNLGdCQUFnQixHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLElBQUksb0JBQW9CLENBQUM7QUFTOUU7Ozs7OztHQU1HO0FBQ0ksS0FBSyxVQUFVLG9CQUFvQixDQUN4QyxNQUFjLEVBQ2QsUUFBZ0IsRUFDaEIsU0FBaUI7SUFFakIsSUFBSSxDQUFDO1FBQ0gsT0FBTyxDQUFDLEdBQUcsQ0FDVCx1Q0FBdUMsTUFBTSxlQUFlLFFBQVEsZ0JBQWdCLFNBQVMsRUFBRSxDQUNoRyxDQUFDO1FBRUYsTUFBTSxVQUFVLEdBQUcsSUFBSSx5QkFBVSxDQUFDO1lBQ2hDLFNBQVMsRUFBRSxnQkFBZ0I7WUFDM0IsR0FBRyxFQUFFO2dCQUNILE1BQU0sRUFBRSxNQUFNO2dCQUNkLFFBQVEsRUFBRSxRQUFRO2FBQ25CO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsTUFBTSxNQUFNLEdBQUcsTUFBTSxTQUFTLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBRWhELElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDakIsT0FBTyxDQUFDLEdBQUcsQ0FDVCw4QkFBOEIsTUFBTSxlQUFlLFFBQVEsRUFBRSxDQUM5RCxDQUFDO1lBQ0YsT0FBTyxLQUFLLENBQUM7UUFDZixDQUFDO1FB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Q0FBQztRQUVELE1BQU0sY0FBYyxHQUFHLE1BQU0sQ0FBQyxVQUFVLENBQUMsZ0JBQTBCLENBQUM7UUFFcEUsT0FBTyxDQUFDLEdBQUcsQ0FDVCwwQkFBMEIsTUFBTSxLQUFLLFFBQVEsbUJBQW1CLGNBQWMsRUFBRSxDQUNqRixDQUFDO1FBRUYsT0FBTyxjQUFjLENBQUM7SUFDeEIsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLHVCQUF1QixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzlDLE1BQU0sS0FBSyxDQUFDO0lBQ2QsQ0FBQztBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBEeW5hbW9EQkNsaWVudCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1keW5hbW9kYic7XG5pbXBvcnQge1xuICBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LFxuICBHZXRDb21tYW5kLFxuICBVcGRhdGVDb21tYW5kLFxufSBmcm9tICdAYXdzLXNkay9saWItZHluYW1vZGInO1xuXG5jb25zdCBjbGllbnQgPSBuZXcgRHluYW1vREJDbGllbnQoe1xuICByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfHwgJ3VzLWVhc3QtMScsXG59KTtcblxuY29uc3QgZG9jQ2xpZW50ID0gRHluYW1vREJEb2N1bWVudENsaWVudC5mcm9tKGNsaWVudCk7XG5cbmNvbnN0IFVTRVJTX1RBQkxFX05BTUUgPSBwcm9jZXNzLmVudi5VU0VSU19UQUJMRV9OQU1FIHx8ICd2aXJhbC12aWRlb3MtdXNlcnMnO1xuXG5pbnRlcmZhY2UgVXNlciB7XG4gIHVzZXJJZDogc3RyaW5nO1xuICB1c2VybmFtZTogc3RyaW5nO1xuICBjcmVkaXRzQXZhaWxhYmxlOiBudW1iZXI7XG4gIFtrZXk6IHN0cmluZ106IGFueTtcbn1cblxuLyoqXG4gKiBDaGVjayBpZiB1c2VyIGhhcyBzdWZmaWNpZW50IGNyZWRpdCBiYWxhbmNlXG4gKiBAcGFyYW0gdXNlcklkIC0gVGhlIHVzZXIgSUQgKHBhcnRpdGlvbiBrZXkpXG4gKiBAcGFyYW0gdXNlcm5hbWUgLSBUaGUgdXNlcm5hbWUgKHNvcnQga2V5KVxuICogQHBhcmFtIGNvc3RUb1BheSAtIFRoZSBjb3N0VG9QYXkgdG8gY2hlY2sgYWdhaW5zdFxuICogQHJldHVybnMgUHJvbWlzZTxib29sZWFuPiAtIFRydWUgaWYgdXNlciBoYXMgc3VmZmljaWVudCBjcmVkaXRzLCBmYWxzZSBvdGhlcndpc2VcbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGhhc1N1ZmZpY2llbnRDcmVkaXRzKFxuICB1c2VySWQ6IHN0cmluZyxcbiAgdXNlcm5hbWU6IHN0cmluZyxcbiAgY29zdFRvUGF5OiBudW1iZXIsXG4pOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgdHJ5IHtcbiAgICBjb25zb2xlLmxvZyhcbiAgICAgIGBDaGVja2luZyBjcmVkaXQgYmFsYW5jZSBmb3IgdXNlcklkOiAke3VzZXJJZH0sIHVzZXJuYW1lOiAke3VzZXJuYW1lfSwgY29zdFRvUGF5OiAke2Nvc3RUb1BheX1gLFxuICAgICk7XG5cbiAgICBjb25zdCBnZXRDb21tYW5kID0gbmV3IEdldENvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiBVU0VSU19UQUJMRV9OQU1FLFxuICAgICAgS2V5OiB7XG4gICAgICAgIHVzZXJJZDogdXNlcklkLFxuICAgICAgICB1c2VybmFtZTogdXNlcm5hbWUsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQoZ2V0Q29tbWFuZCk7XG5cbiAgICBpZiAoIXJlc3VsdC5JdGVtKSB7XG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgYFVzZXIgbm90IGZvdW5kIGZvciB1c2VySWQ6ICR7dXNlcklkfSwgdXNlcm5hbWU6ICR7dXNlcm5hbWV9YCxcbiAgICAgICk7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgY29uc3QgdXNlciA9IHJlc3VsdC5JdGVtIGFzIFVzZXI7XG4gICAgY29uc3QgY3VycmVudENyZWRpdHMgPSB1c2VyLmNyZWRpdHNBdmFpbGFibGUgfHwgMDtcblxuICAgIGNvbnNvbGUubG9nKFxuICAgICAgYFVzZXIgJHt1c2VySWR9ICgke3VzZXJuYW1lfSkgaGFzICR7Y3VycmVudENyZWRpdHN9IGNyZWRpdHMsIHJlcXVpcmVkOiAke2Nvc3RUb1BheX1gLFxuICAgICk7XG5cbiAgICByZXR1cm4gY3VycmVudENyZWRpdHMgPj0gY29zdFRvUGF5O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGNoZWNraW5nIGNyZWRpdCBiYWxhbmNlOicsIGVycm9yKTtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbn1cblxuLyoqXG4gKiBVcGRhdGUgdXNlcidzIGNyZWRpdCBiYWxhbmNlIGJ5IGRlZHVjdGluZyB0aGUgY29zdFRvUGF5XG4gKiBAcGFyYW0gdXNlcklkIC0gVGhlIHVzZXIgSUQgKHBhcnRpdGlvbiBrZXkpXG4gKiBAcGFyYW0gdXNlcm5hbWUgLSBUaGUgdXNlcm5hbWUgKHNvcnQga2V5KVxuICogQHBhcmFtIGNvc3RUb1BheSAtIFRoZSBjb3N0VG9QYXkgdG8gZGVkdWN0XG4gKiBAcmV0dXJucyBQcm9taXNlPG51bWJlcj4gLSBUaGUgdXBkYXRlZCBjcmVkaXQgYmFsYW5jZVxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gdXBkYXRlQ3JlZGl0QmFsYW5jZShcbiAgdXNlcklkOiBzdHJpbmcsXG4gIHVzZXJuYW1lOiBzdHJpbmcsXG4gIGNvc3RUb1BheTogbnVtYmVyLFxuKTogUHJvbWlzZTxudW1iZXI+IHtcbiAgdHJ5IHtcbiAgICBjb25zb2xlLmxvZyhcbiAgICAgIGBVcGRhdGluZyBjcmVkaXQgYmFsYW5jZSBmb3IgdXNlcklkOiAke3VzZXJJZH0sIHVzZXJuYW1lOiAke3VzZXJuYW1lfSwgZGVkdWN0aW5nOiAke2Nvc3RUb1BheX1gLFxuICAgICk7XG5cbiAgICAvLyBGaXJzdCBjaGVjayBpZiB1c2VyIGhhcyBzdWZmaWNpZW50IGNyZWRpdHNcbiAgICBjb25zdCBoYXNDcmVkaXRzID0gYXdhaXQgaGFzU3VmZmljaWVudENyZWRpdHModXNlcklkLCB1c2VybmFtZSwgY29zdFRvUGF5KTtcblxuICAgIGlmICghaGFzQ3JlZGl0cykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbnN1ZmZpY2llbnQgY3JlZGl0cyBmb3IgdXNlciAke3VzZXJJZH0gKCR7dXNlcm5hbWV9KWApO1xuICAgIH1cblxuICAgIC8vIFVwZGF0ZSB0aGUgY3JlZGl0IGJhbGFuY2VcbiAgICBjb25zdCB1cGRhdGVDb21tYW5kID0gbmV3IFVwZGF0ZUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiBVU0VSU19UQUJMRV9OQU1FLFxuICAgICAgS2V5OiB7XG4gICAgICAgIHVzZXJJZDogdXNlcklkLFxuICAgICAgICB1c2VybmFtZTogdXNlcm5hbWUsXG4gICAgICB9LFxuICAgICAgVXBkYXRlRXhwcmVzc2lvbjogJ1NFVCBjcmVkaXRzQXZhaWxhYmxlID0gY3JlZGl0c0F2YWlsYWJsZSAtIDpjb3N0VG9QYXknLFxuICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xuICAgICAgICAnOmNvc3RUb1BheSc6IGNvc3RUb1BheSxcbiAgICAgIH0sXG4gICAgICBSZXR1cm5WYWx1ZXM6ICdBTExfTkVXJyxcbiAgICB9KTtcblxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKHVwZGF0ZUNvbW1hbmQpO1xuXG4gICAgaWYgKCFyZXN1bHQuQXR0cmlidXRlcykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gdXBkYXRlIGNyZWRpdCBiYWxhbmNlJyk7XG4gICAgfVxuXG4gICAgY29uc3QgdXBkYXRlZENyZWRpdHMgPSByZXN1bHQuQXR0cmlidXRlcy5jcmVkaXRzQXZhaWxhYmxlIGFzIG51bWJlcjtcblxuICAgIGNvbnNvbGUubG9nKFxuICAgICAgYENyZWRpdCBiYWxhbmNlIHVwZGF0ZWQgZm9yIHVzZXIgJHt1c2VySWR9ICgke3VzZXJuYW1lfSkuIE5ldyBiYWxhbmNlOiAke3VwZGF0ZWRDcmVkaXRzfWAsXG4gICAgKTtcblxuICAgIHJldHVybiB1cGRhdGVkQ3JlZGl0cztcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciB1cGRhdGluZyBjcmVkaXQgYmFsYW5jZTonLCBlcnJvcik7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn1cblxuLyoqXG4gKiBHZXQgdXNlcidzIGN1cnJlbnQgY3JlZGl0IGJhbGFuY2VcbiAqIEBwYXJhbSB1c2VySWQgLSBUaGUgdXNlciBJRCAocGFydGl0aW9uIGtleSlcbiAqIEBwYXJhbSB1c2VybmFtZSAtIFRoZSB1c2VybmFtZSAoc29ydCBrZXkpXG4gKiBAcmV0dXJucyBQcm9taXNlPG51bWJlcj4gLSBUaGUgY3VycmVudCBjcmVkaXQgYmFsYW5jZVxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0Q3JlZGl0QmFsYW5jZShcbiAgdXNlcklkOiBzdHJpbmcsXG4gIHVzZXJuYW1lOiBzdHJpbmcsXG4pOiBQcm9taXNlPG51bWJlcj4ge1xuICB0cnkge1xuICAgIGNvbnNvbGUubG9nKFxuICAgICAgYEdldHRpbmcgY3JlZGl0IGJhbGFuY2UgZm9yIHVzZXJJZDogJHt1c2VySWR9LCB1c2VybmFtZTogJHt1c2VybmFtZX1gLFxuICAgICk7XG5cbiAgICBjb25zdCBnZXRDb21tYW5kID0gbmV3IEdldENvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiBVU0VSU19UQUJMRV9OQU1FLFxuICAgICAgS2V5OiB7XG4gICAgICAgIHVzZXJJZDogdXNlcklkLFxuICAgICAgICB1c2VybmFtZTogdXNlcm5hbWUsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQoZ2V0Q29tbWFuZCk7XG5cbiAgICBpZiAoIXJlc3VsdC5JdGVtKSB7XG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgYFVzZXIgbm90IGZvdW5kIGZvciB1c2VySWQ6ICR7dXNlcklkfSwgdXNlcm5hbWU6ICR7dXNlcm5hbWV9YCxcbiAgICAgICk7XG4gICAgICByZXR1cm4gMDtcbiAgICB9XG5cbiAgICBjb25zdCB1c2VyID0gcmVzdWx0Lkl0ZW0gYXMgVXNlcjtcbiAgICBjb25zdCBjdXJyZW50Q3JlZGl0cyA9IHVzZXIuY3JlZGl0c0F2YWlsYWJsZSB8fCAwO1xuXG4gICAgY29uc29sZS5sb2coYFVzZXIgJHt1c2VySWR9ICgke3VzZXJuYW1lfSkgaGFzICR7Y3VycmVudENyZWRpdHN9IGNyZWRpdHNgKTtcblxuICAgIHJldHVybiBjdXJyZW50Q3JlZGl0cztcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBnZXR0aW5nIGNyZWRpdCBiYWxhbmNlOicsIGVycm9yKTtcbiAgICByZXR1cm4gMDtcbiAgfVxufVxuXG4vKipcbiAqIEFkZCBjcmVkaXRzIHRvIHVzZXIncyBiYWxhbmNlXG4gKiBAcGFyYW0gdXNlcklkIC0gVGhlIHVzZXIgSUQgKHBhcnRpdGlvbiBrZXkpXG4gKiBAcGFyYW0gdXNlcm5hbWUgLSBUaGUgdXNlcm5hbWUgKHNvcnQga2V5KVxuICogQHBhcmFtIGNyZWRpdHMgLSBUaGUgY3JlZGl0cyB0byBhZGRcbiAqIEByZXR1cm5zIFByb21pc2U8bnVtYmVyPiAtIFRoZSB1cGRhdGVkIGNyZWRpdCBiYWxhbmNlXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBhZGRDcmVkaXRzKFxuICB1c2VySWQ6IHN0cmluZyxcbiAgdXNlcm5hbWU6IHN0cmluZyxcbiAgY3JlZGl0czogbnVtYmVyLFxuKTogUHJvbWlzZTxudW1iZXI+IHtcbiAgdHJ5IHtcbiAgICBjb25zb2xlLmxvZyhcbiAgICAgIGBBZGRpbmcgJHtjcmVkaXRzfSBjcmVkaXRzIGZvciB1c2VySWQ6ICR7dXNlcklkfSwgdXNlcm5hbWU6ICR7dXNlcm5hbWV9YCxcbiAgICApO1xuXG4gICAgY29uc3QgdXBkYXRlQ29tbWFuZCA9IG5ldyBVcGRhdGVDb21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogVVNFUlNfVEFCTEVfTkFNRSxcbiAgICAgIEtleToge1xuICAgICAgICB1c2VySWQ6IHVzZXJJZCxcbiAgICAgICAgdXNlcm5hbWU6IHVzZXJuYW1lLFxuICAgICAgfSxcbiAgICAgIFVwZGF0ZUV4cHJlc3Npb246XG4gICAgICAgICdTRVQgY3JlZGl0c0F2YWlsYWJsZSA9IGlmX25vdF9leGlzdHMoY3JlZGl0c0F2YWlsYWJsZSwgOnplcm8pICsgOmNyZWRpdHMnLFxuICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xuICAgICAgICAnOmNyZWRpdHMnOiBjcmVkaXRzLFxuICAgICAgICAnOnplcm8nOiAwLFxuICAgICAgfSxcbiAgICAgIFJldHVyblZhbHVlczogJ0FMTF9ORVcnLFxuICAgIH0pO1xuXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQodXBkYXRlQ29tbWFuZCk7XG5cbiAgICBpZiAoIXJlc3VsdC5BdHRyaWJ1dGVzKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byBhZGQgY3JlZGl0cycpO1xuICAgIH1cblxuICAgIGNvbnN0IHVwZGF0ZWRDcmVkaXRzID0gcmVzdWx0LkF0dHJpYnV0ZXMuY3JlZGl0c0F2YWlsYWJsZSBhcyBudW1iZXI7XG5cbiAgICBjb25zb2xlLmxvZyhcbiAgICAgIGBDcmVkaXRzIGFkZGVkIGZvciB1c2VyICR7dXNlcklkfSAoJHt1c2VybmFtZX0pLiBOZXcgYmFsYW5jZTogJHt1cGRhdGVkQ3JlZGl0c31gLFxuICAgICk7XG5cbiAgICByZXR1cm4gdXBkYXRlZENyZWRpdHM7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgYWRkaW5nIGNyZWRpdHM6JywgZXJyb3IpO1xuICAgIHRocm93IGVycm9yO1xuICB9XG59XG4iXX0=