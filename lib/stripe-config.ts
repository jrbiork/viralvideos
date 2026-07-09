// Stripe configuration and price IDs
export const STRIPE_PLANS = {
  pro: {
    name: 'Pro',
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID || '',
    videosPerMonth: 30,
    price: 9,
  },
} as const;

export type PlanType = keyof typeof STRIPE_PLANS;
