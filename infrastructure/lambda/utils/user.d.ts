export interface UserSubscription {
    mode: 'free' | 'starter' | 'creator' | 'influencer';
    renewalDate: string | null;
    status: 'active' | 'cancelled' | 'expired';
}
export interface UserItem {
    userId: string;
    username: string;
    email: string;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    subscription?: UserSubscription;
    videosCreated?: number;
    videosCreatedThisMonth?: number;
    quotaPeriodStart?: string;
    imagesGenerated?: number;
    imagesGeneratedThisMonth?: number;
    imageQuotaPeriodStart?: string;
    [key: string]: any;
}
/**
 * Fetch the user's subscription info by userId (partition key).
 * Falls back to a free subscription if user not found or subscription missing.
 */
export declare function getUser(userId: string): Promise<UserItem | null>;
