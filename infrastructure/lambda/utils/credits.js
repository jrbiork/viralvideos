"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CREDITS_COST = void 0;
exports.hasSufficientCreditsByUserId = hasSufficientCreditsByUserId;
exports.updateCreditBalanceByUserId = updateCreditBalanceByUserId;
exports.getCreditBalanceByUserId = getCreditBalanceByUserId;
exports.addCredits = addCredits;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client = new client_dynamodb_1.DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1',
});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(client);
const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME || 'viral-videos-users';
exports.CREDITS_COST = {
    preview_video: 15,
    new_audio_subtitle: 1,
    new_image: 5,
    ai_video_5s: 20,
    ai_video_10s: 40,
};
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
        return {
            hasSufficientCredits: currentCredits >= costToPay,
            currentCredits,
        };
    }
    catch (error) {
        console.error('Error checking credit balance:', error);
        return { hasSufficientCredits: false, currentCredits: 0 };
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3JlZGl0cy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImNyZWRpdHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBb0NBLG9FQXVCQztBQVFELGtFQW9FQztBQU9ELDREQWdDQztBQVNELGdDQTBDQztBQWpPRCw4REFBMEQ7QUFDMUQsd0RBSStCO0FBRS9CLE1BQU0sTUFBTSxHQUFHLElBQUksZ0NBQWMsQ0FBQztJQUNoQyxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLElBQUksV0FBVztDQUM5QyxDQUFDLENBQUM7QUFFSCxNQUFNLFNBQVMsR0FBRyxxQ0FBc0IsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7QUFFdEQsTUFBTSxnQkFBZ0IsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGdCQUFnQixJQUFJLG9CQUFvQixDQUFDO0FBRWpFLFFBQUEsWUFBWSxHQUFHO0lBQzFCLGFBQWEsRUFBRSxFQUFFO0lBQ2pCLGtCQUFrQixFQUFFLENBQUM7SUFDckIsU0FBUyxFQUFFLENBQUM7SUFDWixXQUFXLEVBQUUsRUFBRTtJQUNmLFlBQVksRUFBRSxFQUFFO0NBQ2pCLENBQUM7QUFTRjs7Ozs7R0FLRztBQUNJLEtBQUssVUFBVSw0QkFBNEIsQ0FDaEQsTUFBYyxFQUNkLFNBQWlCO0lBRWpCLElBQUksQ0FBQztRQUNILE9BQU8sQ0FBQyxHQUFHLENBQ1QsdUNBQXVDLE1BQU0sZ0JBQWdCLFNBQVMsRUFBRSxDQUN6RSxDQUFDO1FBRUYsTUFBTSxjQUFjLEdBQUcsTUFBTSx3QkFBd0IsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUU5RCxPQUFPLENBQUMsR0FBRyxDQUNULFFBQVEsTUFBTSxRQUFRLGNBQWMsdUJBQXVCLFNBQVMsRUFBRSxDQUN2RSxDQUFDO1FBRUYsT0FBTztZQUNMLG9CQUFvQixFQUFFLGNBQWMsSUFBSSxTQUFTO1lBQ2pELGNBQWM7U0FDZixDQUFDO0lBQ0osQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENB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QVE7YUFDbkI7WUFDRCxnQkFBZ0IsRUFDZCwwRUFBMEU7WUFDNUUseUJBQXlCLEVBQUU7Z0JBQ3pCLFVBQVUsRUFBRSxPQUFPO2dCQUNuQixPQUFPLEVBQUUsQ0FBQzthQUNYO1lBQ0QsWUFBWSxFQUFFLFNBQVM7U0FDeEIsQ0FBQyxDQUFDO1FBRUgsTUFBTSxNQUFNLEdBQUcsTUFBTSxTQUFTLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBRW5ELElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDdkIsTUFBTSxJQUFJLEtBQUssQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1FBQzNDLENBQUM7UUFFRCxNQUFNLGNBQWMsR0FBRyxNQUFNLENBQUMsVUFBVSxDQUFDLGdCQUEwQixDQUFDO1FBRXBFLE9BQU8sQ0FBQyxHQUFHLENBQ1QsMEJBQTBCLE1BQU0sS0FBSyxRQUFRLG1CQUFtQixjQUFjLEVBQUUsQ0FDakYsQ0FBQztRQUVGLE9BQU8sY0FBYyxDQUFDO0lBQ3hCLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyx1QkFBdUIsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUM5QyxNQUFNLEtBQUssQ0FBQztJQUNkLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgRHluYW1vREJDbGllbnQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtZHluYW1vZGInO1xuaW1wb3J0IHtcbiAgRHluYW1vREJEb2N1bWVudENsaWVudCxcbiAgVXBkYXRlQ29tbWFuZCxcbiAgUXVlcnlDb21tYW5kLFxufSBmcm9tICdAYXdzLXNkay9saWItZHluYW1vZGInO1xuXG5jb25zdCBjbGllbnQgPSBuZXcgRHluYW1vREJDbGllbnQoe1xuICByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfHwgJ3VzLWVhc3QtMScsXG59KTtcblxuY29uc3QgZG9jQ2xpZW50ID0gRHluYW1vREJEb2N1bWVudENsaWVudC5mcm9tKGNsaWVudCk7XG5cbmNvbnN0IFVTRVJTX1RBQkxFX05BTUUgPSBwcm9jZXNzLmVudi5VU0VSU19UQUJMRV9OQU1FIHx8ICd2aXJhbC12aWRlb3MtdXNlcnMnO1xuXG5leHBvcnQgY29uc3QgQ1JFRElUU19DT1NUID0ge1xuICBwcmV2aWV3X3ZpZGVvOiAxNSxcbiAgbmV3X2F1ZGlvX3N1YnRpdGxlOiAxLFxuICBuZXdfaW1hZ2U6IDUsXG4gIGFpX3ZpZGVvXzVzOiAyMCxcbiAgYWlfdmlkZW9fMTBzOiA0MCxcbn07XG5cbmludGVyZmFjZSBVc2VyIHtcbiAgdXNlcklkOiBzdHJpbmc7XG4gIHVzZXJuYW1lOiBzdHJpbmc7XG4gIGNyZWRpdHNBdmFpbGFibGU6IG51bWJlcjtcbiAgW2tleTogc3RyaW5nXTogYW55O1xufVxuXG4vKipcbiAqIENoZWNrIGlmIHVzZXIgaGFzIHN1ZmZpY2llbnQgY3JlZGl0IGJhbGFuY2UgdXNpbmcgb25seSB1c2VySWRcbiAqIEBwYXJhbSB1c2VySWQgLSBUaGUgdXNlciBJRCAocGFydGl0aW9uIGtleSlcbiAqIEBwYXJhbSBjb3N0VG9QYXkgLSBUaGUgY29zdFRvUGF5IHRvIGNoZWNrIGFnYWluc3RcbiAqIEByZXR1cm5zIFByb21pc2U8Ym9vbGVhbj4gLSBUcnVlIGlmIHVzZXIgaGFzIHN1ZmZpY2llbnQgY3JlZGl0cywgZmFsc2Ugb3RoZXJ3aXNlXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBoYXNTdWZmaWNpZW50Q3JlZGl0c0J5VXNlcklkKFxuICB1c2VySWQ6IHN0cmluZyxcbiAgY29zdFRvUGF5OiBudW1iZXIsXG4pOiBQcm9taXNlPHsgaGFzU3VmZmljaWVudENyZWRpdHM6IGJvb2xlYW47IGN1cnJlbnRDcmVkaXRzOiBudW1iZXIgfT4ge1xuICB0cnkge1xuICAgIGNvbnNvbGUubG9nKFxuICAgICAgYENoZWNraW5nIGNyZWRpdCBiYWxhbmNlIGZvciB1c2VySWQ6ICR7dXNlcklkfSwgY29zdFRvUGF5OiAke2Nvc3RUb1BheX1gLFxuICAgICk7XG5cbiAgICBjb25zdCBjdXJyZW50Q3JlZGl0cyA9IGF3YWl0IGdldENyZWRpdEJhbGFuY2VCeVVzZXJJZCh1c2VySWQpO1xuXG4gICAgY29uc29sZS5sb2coXG4gICAgICBgVXNlciAke3VzZXJJZH0gaGFzICR7Y3VycmVudENyZWRpdHN9IGNyZWRpdHMsIHJlcXVpcmVkOiAke2Nvc3RUb1BheX1gLFxuICAgICk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgaGFzU3VmZmljaWVudENyZWRpdHM6IGN1cnJlbnRDcmVkaXRzID49IGNvc3RUb1BheSxcbiAgICAgIGN1cnJlbnRDcmVkaXRzLFxuICAgIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgY2hlY2tpbmcgY3JlZGl0IGJhbGFuY2U6JywgZXJyb3IpO1xuICAgIHJldHVybiB7IGhhc1N1ZmZpY2llbnRDcmVkaXRzOiBmYWxzZSwgY3VycmVudENyZWRpdHM6IDAgfTtcbiAgfVxufVxuXG4vKipcbiAqIFVwZGF0ZSB1c2VyJ3MgY3JlZGl0IGJhbGFuY2UgYnkgZGVkdWN0aW5nIHRoZSBjb3N0VG9QYXkgdXNpbmcgb25seSB1c2VySWRcbiAqIEBwYXJhbSB1c2VySWQgLSBUaGUgdXNlciBJRCAocGFydGl0aW9uIGtleSlcbiAqIEBwYXJhbSBjb3N0VG9QYXkgLSBUaGUgY29zdFRvUGF5IHRvIGRlZHVjdFxuICogQHJldHVybnMgUHJvbWlzZTxudW1iZXI+IC0gVGhlIHVwZGF0ZWQgY3JlZGl0IGJhbGFuY2VcbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHVwZGF0ZUNyZWRpdEJhbGFuY2VCeVVzZXJJZChcbiAgdXNlcklkOiBzdHJpbmcsXG4gIGNvc3RUb1BheTogbnVtYmVyLFxuKTogUHJvbWlzZTxudW1iZXI+IHtcbiAgdHJ5IHtcbiAgICBjb25zb2xlLmxvZyhcbiAgICAgIGBVcGRhdGluZyBjcmVkaXQgYmFsYW5jZSBmb3IgdXNlcklkOiAke3VzZXJJZH0sIGRlZHVjdGluZzogJHtjb3N0VG9QYXl9YCxcbiAgICApO1xuXG4gICAgLy8gRmlyc3QgY2hlY2sgaWYgdXNlciBoYXMgc3VmZmljaWVudCBjcmVkaXRzXG4gICAgY29uc3QgY3VycmVudENyZWRpdHMgPSBhd2FpdCBnZXRDcmVkaXRCYWxhbmNlQnlVc2VySWQodXNlcklkKTtcblxuICAgIGlmIChjdXJyZW50Q3JlZGl0cyA8IGNvc3RUb1BheSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICBgSW5zdWZmaWNpZW50IGNyZWRpdHMgZm9yIHVzZXIgJHt1c2VySWR9LiBDdXJyZW50OiAke2N1cnJlbnRDcmVkaXRzfSwgUmVxdWlyZWQ6ICR7Y29zdFRvUGF5fWAsXG4gICAgICApO1xuICAgIH1cblxuICAgIC8vIEdldCB0aGUgdXNlcidzIHVzZXJuYW1lIGZpcnN0XG4gICAgY29uc3QgcXVlcnlDb21tYW5kID0gbmV3IFF1ZXJ5Q29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IFVTRVJTX1RBQkxFX05BTUUsXG4gICAgICBLZXlDb25kaXRpb25FeHByZXNzaW9uOiAndXNlcklkID0gOnVzZXJJZCcsXG4gICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XG4gICAgICAgICc6dXNlcklkJzogdXNlcklkLFxuICAgICAgfSxcbiAgICAgIExpbWl0OiAxLFxuICAgIH0pO1xuXG4gICAgY29uc3QgcXVlcnlSZXN1bHQgPSBhd2FpdCBkb2NDbGllbnQuc2VuZChxdWVyeUNvbW1hbmQpO1xuXG4gICAgaWYgKCFxdWVyeVJlc3VsdC5JdGVtcyB8fCBxdWVyeVJlc3VsdC5JdGVtcy5sZW5ndGggPT09IDApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgVXNlciBub3QgZm91bmQgZm9yIHVzZXJJZDogJHt1c2VySWR9YCk7XG4gICAgfVxuXG4gICAgY29uc3QgdXNlciA9IHF1ZXJ5UmVzdWx0Lkl0ZW1zWzBdIGFzIFVzZXI7XG4gICAgY29uc3QgdXNlcm5hbWUgPSB1c2VyLnVzZXJuYW1lO1xuXG4gICAgLy8gVXBkYXRlIHRoZSBjcmVkaXQgYmFsYW5jZVxuICAgIGNvbnN0IHVwZGF0ZUNvbW1hbmQgPSBuZXcgVXBkYXRlQ29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IFVTRVJTX1RBQkxFX05BTUUsXG4gICAgICBLZXk6IHtcbiAgICAgICAgdXNlcklkOiB1c2VySWQsXG4gICAgICAgIHVzZXJuYW1lOiB1c2VybmFtZSxcbiAgICAgIH0sXG4gICAgICBVcGRhdGVFeHByZXNzaW9uOiAnU0VUIGNyZWRpdHNBdmFpbGFibGUgPSBjcmVkaXRzQXZhaWxhYmxlIC0gOmNvc3RUb1BheScsXG4gICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XG4gICAgICAgICc6Y29zdFRvUGF5JzogY29zdFRvUGF5LFxuICAgICAgfSxcbiAgICAgIFJldHVyblZhbHVlczogJ0FMTF9ORVcnLFxuICAgIH0pO1xuXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQodXBkYXRlQ29tbWFuZCk7XG5cbiAgICBpZiAoIXJlc3VsdC5BdHRyaWJ1dGVzKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byB1cGRhdGUgY3JlZGl0IGJhbGFuY2UnKTtcbiAgICB9XG5cbiAgICBjb25zdCB1cGRhdGVkQ3JlZGl0cyA9IHJlc3VsdC5BdHRyaWJ1dGVzLmNyZWRpdHNBdmFpbGFibGUgYXMgbnVtYmVyO1xuXG4gICAgY29uc29sZS5sb2coXG4gICAgICBgQ3JlZGl0IGJhbGFuY2UgdXBkYXRlZCBmb3IgdXNlciAke3VzZXJJZH0uIE5ldyBiYWxhbmNlOiAke3VwZGF0ZWRDcmVkaXRzfWAsXG4gICAgKTtcblxuICAgIHJldHVybiB1cGRhdGVkQ3JlZGl0cztcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciB1cGRhdGluZyBjcmVkaXQgYmFsYW5jZTonLCBlcnJvcik7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn1cblxuLyoqXG4gKiBHZXQgdXNlcidzIGN1cnJlbnQgY3JlZGl0IGJhbGFuY2UgdXNpbmcgb25seSB1c2VySWRcbiAqIEBwYXJhbSB1c2VySWQgLSBUaGUgdXNlciBJRCAocGFydGl0aW9uIGtleSlcbiAqIEByZXR1cm5zIFByb21pc2U8bnVtYmVyPiAtIFRoZSBjdXJyZW50IGNyZWRpdCBiYWxhbmNlXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRDcmVkaXRCYWxhbmNlQnlVc2VySWQoXG4gIHVzZXJJZDogc3RyaW5nLFxuKTogUHJvbWlzZTxudW1iZXI+IHtcbiAgdHJ5IHtcbiAgICBjb25zb2xlLmxvZyhgR2V0dGluZyBjcmVkaXQgYmFsYW5jZSBmb3IgdXNlcklkOiAke3VzZXJJZH1gKTtcblxuICAgIGNvbnN0IHF1ZXJ5Q29tbWFuZCA9IG5ldyBRdWVyeUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiBVU0VSU19UQUJMRV9OQU1FLFxuICAgICAgS2V5Q29uZGl0aW9uRXhwcmVzc2lvbjogJ3VzZXJJZCA9IDp1c2VySWQnLFxuICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xuICAgICAgICAnOnVzZXJJZCc6IHVzZXJJZCxcbiAgICAgIH0sXG4gICAgICBMaW1pdDogMSxcbiAgICB9KTtcblxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKHF1ZXJ5Q29tbWFuZCk7XG5cbiAgICBpZiAoIXJlc3VsdC5JdGVtcyB8fCByZXN1bHQuSXRlbXMubGVuZ3RoID09PSAwKSB7XG4gICAgICBjb25zb2xlLmxvZyhgVXNlciBub3QgZm91bmQgZm9yIHVzZXJJZDogJHt1c2VySWR9YCk7XG4gICAgICByZXR1cm4gMDtcbiAgICB9XG5cbiAgICBjb25zdCB1c2VyID0gcmVzdWx0Lkl0ZW1zWzBdIGFzIFVzZXI7XG4gICAgY29uc3QgY3VycmVudENyZWRpdHMgPSB1c2VyLmNyZWRpdHNBdmFpbGFibGUgfHwgMDtcblxuICAgIGNvbnNvbGUubG9nKGBVc2VyICR7dXNlcklkfSBoYXMgJHtjdXJyZW50Q3JlZGl0c30gY3JlZGl0c2ApO1xuXG4gICAgcmV0dXJuIGN1cnJlbnRDcmVkaXRzO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGdldHRpbmcgY3JlZGl0IGJhbGFuY2U6JywgZXJyb3IpO1xuICAgIHJldHVybiAwO1xuICB9XG59XG5cbi8qKlxuICogQWRkIGNyZWRpdHMgdG8gdXNlcidzIGJhbGFuY2VcbiAqIEBwYXJhbSB1c2VySWQgLSBUaGUgdXNlciBJRCAocGFydGl0aW9uIGtleSlcbiAqIEBwYXJhbSB1c2VybmFtZSAtIFRoZSB1c2VybmFtZSAoc29ydCBrZXkpXG4gKiBAcGFyYW0gY3JlZGl0cyAtIFRoZSBjcmVkaXRzIHRvIGFkZFxuICogQHJldHVybnMgUHJvbWlzZTxudW1iZXI+IC0gVGhlIHVwZGF0ZWQgY3JlZGl0IGJhbGFuY2VcbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGFkZENyZWRpdHMoXG4gIHVzZXJJZDogc3RyaW5nLFxuICB1c2VybmFtZTogc3RyaW5nLFxuICBjcmVkaXRzOiBudW1iZXIsXG4pOiBQcm9taXNlPG51bWJlcj4ge1xuICB0cnkge1xuICAgIGNvbnNvbGUubG9nKFxuICAgICAgYEFkZGluZyAke2NyZWRpdHN9IGNyZWRpdHMgZm9yIHVzZXJJZDogJHt1c2VySWR9LCB1c2VybmFtZTogJHt1c2VybmFtZX1gLFxuICAgICk7XG5cbiAgICBjb25zdCB1cGRhdGVDb21tYW5kID0gbmV3IFVwZGF0ZUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiBVU0VSU19UQUJMRV9OQU1FLFxuICAgICAgS2V5OiB7XG4gICAgICAgIHVzZXJJZDogdXNlcklkLFxuICAgICAgICB1c2VybmFtZTogdXNlcm5hbWUsXG4gICAgICB9LFxuICAgICAgVXBkYXRlRXhwcmVzc2lvbjpcbiAgICAgICAgJ1NFVCBjcmVkaXRzQXZhaWxhYmxlID0gaWZfbm90X2V4aXN0cyhjcmVkaXRzQXZhaWxhYmxlLCA6emVybykgKyA6Y3JlZGl0cycsXG4gICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XG4gICAgICAgICc6Y3JlZGl0cyc6IGNyZWRpdHMsXG4gICAgICAgICc6emVybyc6IDAsXG4gICAgICB9LFxuICAgICAgUmV0dXJuVmFsdWVzOiAnQUxMX05FVycsXG4gICAgfSk7XG5cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBkb2NDbGllbnQuc2VuZCh1cGRhdGVDb21tYW5kKTtcblxuICAgIGlmICghcmVzdWx0LkF0dHJpYnV0ZXMpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignRmFpbGVkIHRvIGFkZCBjcmVkaXRzJyk7XG4gICAgfVxuXG4gICAgY29uc3QgdXBkYXRlZENyZWRpdHMgPSByZXN1bHQuQXR0cmlidXRlcy5jcmVkaXRzQXZhaWxhYmxlIGFzIG51bWJlcjtcblxuICAgIGNvbnNvbGUubG9nKFxuICAgICAgYENyZWRpdHMgYWRkZWQgZm9yIHVzZXIgJHt1c2VySWR9ICgke3VzZXJuYW1lfSkuIE5ldyBiYWxhbmNlOiAke3VwZGF0ZWRDcmVkaXRzfWAsXG4gICAgKTtcblxuICAgIHJldHVybiB1cGRhdGVkQ3JlZGl0cztcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBhZGRpbmcgY3JlZGl0czonLCBlcnJvcik7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn1cbiJdfQ==