import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { verifyCognitoTokenPayload } from '@/lib/auth-utils';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia',
});

const API_GATEWAY_URL = process.env.API_GATEWAY_URL;

async function getUserData(token: string, userId: string, username: string) {
  try {
    const queryParams = new URLSearchParams({
      userId,
      username,
    });

    const response = await fetch(
      `${API_GATEWAY_URL}user?${queryParams.toString()}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error('Failed to fetch user data');
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching user data:', error);
    return null;
  }
}

// GET: Create billing portal session
export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const authHeader = request.headers.get('authorization');
    let token = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else {
      const cookieStore = request.cookies;
      const cognitoToken = cookieStore.get('viral-videos-cognito-token');
      if (cognitoToken) {
        token = cognitoToken.value;
      }
    }

    if (!token) {
      return NextResponse.json(
        { error: 'No authentication token found' },
        { status: 401 },
      );
    }

    const userData = await verifyCognitoTokenPayload(token);
    if (!userData || !userData.username) {
      return NextResponse.json(
        { error: 'Invalid authentication token' },
        { status: 401 },
      );
    }

    // Fetch full user data to get stripeCustomerId
    const fullUserData = await getUserData(
      token,
      userData.sub,
      userData.username,
    );

    if (!fullUserData?.user?.stripeCustomerId) {
      return NextResponse.json(
        { error: 'No subscription found' },
        { status: 404 },
      );
    }

    // Create billing portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: fullUserData.user.stripeCustomerId,
      return_url: `${
        process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
      }/settings`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error('Error creating portal session:', error);
    // The stored customer can point at a Stripe customer that no longer
    // exists (e.g. stale test data) — the portal can't manage a
    // subscription it can't find, so surface an actionable message instead
    // of the raw Stripe error.
    const isMissingCustomer =
      error?.code === 'resource_missing' && error?.param === 'customer';
    return NextResponse.json(
      {
        error: isMissingCustomer
          ? 'Your billing record is out of sync. Please resubscribe from the pricing page to fix it.'
          : error.message || 'Failed to create portal session',
        code: isMissingCustomer ? 'customer_not_found' : undefined,
      },
      { status: 500 },
    );
  }
}

// POST: Cancel subscription
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const authHeader = request.headers.get('authorization');
    let token = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else {
      const cookieStore = request.cookies;
      const cognitoToken = cookieStore.get('viral-videos-cognito-token');
      if (cognitoToken) {
        token = cognitoToken.value;
      }
    }

    if (!token) {
      return NextResponse.json(
        { error: 'No authentication token found' },
        { status: 401 },
      );
    }

    const userData = await verifyCognitoTokenPayload(token);
    if (!userData || !userData.username) {
      return NextResponse.json(
        { error: 'Invalid authentication token' },
        { status: 401 },
      );
    }

    // Fetch full user data to get stripeSubscriptionId
    const fullUserData = await getUserData(
      token,
      userData.sub,
      userData.username,
    );

    if (!fullUserData?.user?.stripeSubscriptionId) {
      return NextResponse.json(
        { error: 'No active subscription found' },
        { status: 404 },
      );
    }

    // Cancel subscription at period end
    const subscription = await stripe.subscriptions.update(
      fullUserData.user.stripeSubscriptionId,
      {
        cancel_at_period_end: true,
      },
    );

    return NextResponse.json({
      success: true,
      cancelAt: new Date(subscription.cancel_at! * 1000).toISOString(),
    });
  } catch (error: any) {
    console.error('Error cancelling subscription:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to cancel subscription' },
      { status: 500 },
    );
  }
}

