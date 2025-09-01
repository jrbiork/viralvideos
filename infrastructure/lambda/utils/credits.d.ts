export declare const CREDITS_COST: {
    preview_video: number;
    new_audio_subtitle: number;
    new_image: number;
    ai_video_5s: number;
    ai_video_10s: number;
};
/**
 * Check if user has sufficient credit balance using only userId
 * @param userId - The user ID (partition key)
 * @param costToPay - The costToPay to check against
 * @returns Promise<boolean> - True if user has sufficient credits, false otherwise
 */
export declare function hasSufficientCreditsByUserId(userId: string, costToPay: number): Promise<{
    hasSufficientCredits: boolean;
    currentCredits: number;
}>;
/**
 * Update user's credit balance by deducting the costToPay using only userId
 * @param userId - The user ID (partition key)
 * @param costToPay - The costToPay to deduct
 * @returns Promise<number> - The updated credit balance
 */
export declare function updateCreditBalanceByUserId(userId: string, costToPay: number): Promise<number>;
/**
 * Get user's current credit balance using only userId
 * @param userId - The user ID (partition key)
 * @returns Promise<number> - The current credit balance
 */
export declare function getCreditBalanceByUserId(userId: string): Promise<number>;
/**
 * Add credits to user's balance
 * @param userId - The user ID (partition key)
 * @param username - The username (sort key)
 * @param credits - The credits to add
 * @returns Promise<number> - The updated credit balance
 */
export declare function addCredits(userId: string, username: string, credits: number): Promise<number>;
