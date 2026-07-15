// Stripe configuration and price IDs — single source of truth for mapping a
// Stripe price ID back to a plan (used by the checkout and webhook routes).
export const STRIPE_PLANS = {
  creator: {
    name: 'Creator',
    priceId: process.env.NEXT_PUBLIC_STRIPE_CREATOR_PRICE_ID || '',
    price: 12,
  },
  pro: {
    name: 'Pro',
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID || '',
    price: 19.9,
  },
} as const;

export type PlanType = keyof typeof STRIPE_PLANS;

export function planFromPriceId(priceId: string): PlanType | null {
  if (priceId === STRIPE_PLANS.creator.priceId) return 'creator';
  if (priceId === STRIPE_PLANS.pro.priceId) return 'pro';
  return null;
}
