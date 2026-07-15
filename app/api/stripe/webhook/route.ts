import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { planFromPriceId } from '@/lib/stripe-config';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia',
});

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const docClient = DynamoDBDocumentClient.from(client);
const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME || 'viral-videos-users';

// Reset the user's monthly video quota (on upgrade and on each renewal)
async function resetMonthlyQuota(
  userId: string,
  username: string,
): Promise<void> {
  const updateCommand = new UpdateCommand({
    TableName: USERS_TABLE_NAME,
    Key: {
      userId,
      username,
    },
    UpdateExpression:
      'SET videosCreatedThisMonth = :zero, quotaPeriodStart = :month',
    ExpressionAttributeValues: {
      ':zero': 0,
      ':month': new Date().toISOString().slice(0, 7),
    },
  });

  await docClient.send(updateCommand);
}

// Update user's Stripe and subscription information
async function updateUserSubscription(
  userId: string,
  username: string,
  updates: {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    subscriptionMode?: string;
    subscriptionStatus?: string;
    renewalDate?: string | null;
    cancelAtPeriodEnd?: boolean;
  },
) {
  // Build update expression dynamically
  let updateExpression = 'SET';
  const expressionAttributeValues: any = {};
  const parts: string[] = [];

  if (updates.stripeCustomerId) {
    parts.push(' stripeCustomerId = :stripeCustomerId');
    expressionAttributeValues[':stripeCustomerId'] = updates.stripeCustomerId;
  }

  if (updates.stripeSubscriptionId) {
    parts.push(' stripeSubscriptionId = :stripeSubscriptionId');
    expressionAttributeValues[':stripeSubscriptionId'] =
      updates.stripeSubscriptionId;
  }

  const hasSubscriptionUpdates =
    updates.subscriptionMode ||
    updates.subscriptionStatus ||
    updates.renewalDate !== undefined ||
    updates.cancelAtPeriodEnd !== undefined;

  if (hasSubscriptionUpdates) {
    // Update subscription object
    const subscriptionUpdates: string[] = [];

    if (updates.subscriptionMode) {
      subscriptionUpdates.push('#subscription.#mode = :mode');
      expressionAttributeValues[':mode'] = updates.subscriptionMode;
    }

    if (updates.subscriptionStatus) {
      subscriptionUpdates.push('#subscription.#status = :status');
      expressionAttributeValues[':status'] = updates.subscriptionStatus;
    }

    if (updates.renewalDate !== undefined) {
      subscriptionUpdates.push('#subscription.renewalDate = :renewalDate');
      expressionAttributeValues[':renewalDate'] = updates.renewalDate;
    }

    if (updates.cancelAtPeriodEnd !== undefined) {
      subscriptionUpdates.push(
        '#subscription.cancelAtPeriodEnd = :cancelAtPeriodEnd',
      );
      expressionAttributeValues[':cancelAtPeriodEnd'] =
        updates.cancelAtPeriodEnd;
    }

    parts.push(` ${subscriptionUpdates.join(', ')}`);
  }

  updateExpression += parts.join(',');

  const expressionAttributeNames: any = {};
  if (hasSubscriptionUpdates) {
    expressionAttributeNames['#subscription'] = 'subscription';
    if (updates.subscriptionMode) {
      expressionAttributeNames['#mode'] = 'mode';
    }
    if (updates.subscriptionStatus) {
      expressionAttributeNames['#status'] = 'status';
    }
  }

  const updateCommand = new UpdateCommand({
    TableName: USERS_TABLE_NAME,
    Key: {
      userId,
      username,
    },
    UpdateExpression: updateExpression,
    ExpressionAttributeValues: expressionAttributeValues,
    ExpressionAttributeNames:
      Object.keys(expressionAttributeNames).length > 0
        ? expressionAttributeNames
        : undefined,
    ReturnValues: 'ALL_NEW',
  });

  const result = await docClient.send(updateCommand);
  return result.Attributes;
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 },
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (error: any) {
    console.error('Webhook signature verification failed:', error.message);
    return NextResponse.json(
      { error: `Webhook Error: ${error.message}` },
      { status: 400 },
    );
  }

  console.log(`Processing webhook event: ${event.type}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const metadata = session.metadata!;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        console.log('Checkout session completed:', {
          userId: metadata.userId,
          customerId,
          subscriptionId,
        });

        // Get subscription details to find the renewal date. Stripe
        // redelivers this event on retries (and can redeliver successfully
        // processed events too), so derive state from the subscription's
        // *current* status rather than assuming it's still active — the
        // subscription may have since been cancelled.
        const subscription = await stripe.subscriptions.retrieve(
          subscriptionId,
        );
        const periodEnd =
          (subscription.items.data[0] as any)?.current_period_end ??
          subscription.current_period_end;
        const renewalDate = new Date(periodEnd * 1000).toISOString();

        const isStillActive =
          subscription.status === 'active' ||
          subscription.status === 'trialing';

        const priceId = subscription.items.data[0]?.price?.id;
        const resolvedPlan =
          (priceId && planFromPriceId(priceId)) ||
          (metadata.planName as 'creator' | 'pro' | undefined) ||
          'pro';

        // Update user with Stripe IDs and subscription info
        await updateUserSubscription(metadata.userId, metadata.username, {
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          subscriptionMode: resolvedPlan,
          subscriptionStatus: isStillActive ? 'active' : 'cancelled',
          renewalDate,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
        });

        // Start the monthly video quota fresh, but only if the
        // subscription is genuinely active right now (skip on a stale
        // redelivery of an event for a subscription that's since ended).
        if (isStillActive) {
          await resetMonthlyQuota(metadata.userId, metadata.username);
        }

        console.log(`User ${metadata.userId} upgraded to ${resolvedPlan}`);

        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;

        // Only process for subscriptions (not one-time payments)
        if (!invoice.subscription) {
          break;
        }

        const subscription = await stripe.subscriptions.retrieve(
          invoice.subscription as string,
        );

        const metadata = subscription.metadata;

        if (!metadata.userId || !metadata.username) {
          console.log('Subscription missing metadata, skipping');
          break;
        }

        // Check if this is a renewal (not the first payment)
        if (invoice.billing_reason === 'subscription_cycle') {
          // Reset the monthly video quota for the new billing period
          await resetMonthlyQuota(metadata.userId, metadata.username);

          console.log(
            `Renewed subscription for user ${metadata.userId}. Monthly quota reset.`,
          );

          // Update renewal date
          const renewalDate = new Date(
            subscription.current_period_end * 1000,
          ).toISOString();
          await updateUserSubscription(metadata.userId, metadata.username, {
            renewalDate,
            subscriptionStatus: 'active',
          });
        }

        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const metadata = subscription.metadata;

        if (!metadata.userId || !metadata.username) {
          console.log('Subscription missing metadata, skipping');
          break;
        }

        // Determine status. Note: cancel_at_period_end just means the
        // subscription won't renew — the user keeps pro access (status
        // stays 'active') until Stripe actually ends it, which fires
        // customer.subscription.deleted.
        let status: 'active' | 'cancelled' | 'expired' = 'active';
        if (subscription.status === 'canceled') {
          status = 'cancelled';
        } else if (
          subscription.status === 'past_due' ||
          subscription.status === 'unpaid'
        ) {
          status = 'expired';
        }

        // current_period_end moved from the subscription object to each
        // subscription item under newer Stripe API versions (not yet
        // reflected in the installed SDK's TypeScript types)
        const periodEnd =
          (subscription.items.data[0] as any)?.current_period_end ??
          subscription.current_period_end;
        const renewalDate = new Date(periodEnd * 1000).toISOString();

        // A customer-portal plan switch (Creator<->Pro) changes the price on
        // the same subscription without a new checkout.session.completed —
        // resolve the plan here too, and reset quota counters immediately if
        // it changed, so the new caps apply right away instead of at the
        // next renewal.
        const priceId = subscription.items.data[0]?.price?.id;
        const resolvedPlan = priceId ? planFromPriceId(priceId) : null;

        let planChanged = false;
        if (resolvedPlan) {
          const existing = await docClient.send(
            new GetCommand({
              TableName: USERS_TABLE_NAME,
              Key: { userId: metadata.userId, username: metadata.username },
            }),
          );
          planChanged = existing.Item?.subscription?.mode !== resolvedPlan;
        }

        await updateUserSubscription(metadata.userId, metadata.username, {
          subscriptionStatus: status,
          renewalDate,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          ...(resolvedPlan ? { subscriptionMode: resolvedPlan } : {}),
        });

        if (planChanged) {
          await resetMonthlyQuota(metadata.userId, metadata.username);
        }

        console.log(
          `Updated subscription status for user ${metadata.userId}: ${status}`,
        );

        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const metadata = subscription.metadata;

        if (!metadata.userId || !metadata.username) {
          console.log('Subscription missing metadata, skipping');
          break;
        }

        await updateUserSubscription(metadata.userId, metadata.username, {
          subscriptionStatus: 'cancelled',
          renewalDate: null,
          cancelAtPeriodEnd: false,
        });

        console.log(`Subscription cancelled for user ${metadata.userId}`);

        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Error processing webhook:', error);
    return NextResponse.json(
      { error: `Webhook handler failed: ${error.message}` },
      { status: 500 },
    );
  }
}





