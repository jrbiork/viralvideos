export interface UserSubscription {
    mode: 'free' | 'creator' | 'pro' | 'starter' | 'influencer';
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
    animationsGenerated?: number;
    animationsGeneratedThisMonth?: number;
    animationQuotaPeriodStart?: string;
    [key: string]: any;
}
/**
 * Fetch the user's subscription info by userId (partition key).
 * Falls back to a free subscription if user not found or subscription missing.
 */
export declare function getUser(userId: string): Promise<UserItem | null>;
