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

    // Get request body
    const body = await request.json();
    const { priceId, planName, promoCode } = body;

    if (!priceId || !planName) {
      return NextResponse.json(
        { error: 'Missing required fields: priceId, planName' },
        { status: 400 },
      );
    }

    // Fetch full user data to get stripeCustomerId and email
    const fullUserData = await getUserData(
      token,
      userData.sub,
      userData.username,
    );

    if (!fullUserData?.user) {
      return NextResponse.json(
        { error: 'Failed to fetch user data' },
        { status: 500 },
      );
    }

    const user = fullUserData.user;

    // Create or retrieve Stripe customer
    let customerId = user.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          userId: userData.sub,
          username: userData.username,
        },
      });
      customerId = customer.id;
    }

    // Create checkout session
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${
        process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
      }/create?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${
        process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
      }/pricing`,
      metadata: {
        userId: userData.sub,
        username: userData.username,
        planName,
      },
      subscription_data: {
        metadata: {
          userId: userData.sub,
          username: userData.username,
          planName,
        },
      },
    };

    // Add promo code if provided
    if (promoCode) {
      // Find the coupon by promotion code
      const promotionCodes = await stripe.promotionCodes.list({
        code: promoCode,
        active: true,
        limit: 1,
      });

      if (promotionCodes.data.length > 0) {
        sessionParams.discounts = [
          {
            promotion_code: promotionCodes.data[0].id,
          },
        ];
      }
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error('Error creating checkout session:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create checkout session' },
      { status: 500 },
    );
  }
}

