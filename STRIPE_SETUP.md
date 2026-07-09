# Stripe Payment Integration Setup

This guide will help you set up Stripe payment processing for your Viral Shorts application.

## Prerequisites

- Stripe account (create one at https://stripe.com)
- Access to Stripe Dashboard
- AWS infrastructure deployed

## Step 1: Get Stripe API Keys

1. Go to https://dashboard.stripe.com/test/apikeys
2. Copy your **Publishable key** (starts with `pk_test_`)
3. Copy your **Secret key** (starts with `sk_test_`)
4. Add these to your `.env.local` file:

```env
STRIPE_SECRET_KEY=sk_test_your_key_here
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

## Step 2: Create Products and Prices

### Using Stripe Dashboard:

1. Go to https://dashboard.stripe.com/test/products
2. Click "Add product"

#### Pro Plan

- **Name**: Pro Plan
- **Description**: 30 videos per month
- **Pricing**: Recurring, Monthly, $9.00
- Click "Save product"
- Copy the Price ID (starts with `price_`)

3. Add the Price ID to your `.env.local`:

```env
NEXT_PUBLIC_STRIPE_PRO_PRICE_ID=price_your_pro_id
```

## Step 3: Create Promotion Code (SAVE20)

1. Go to https://dashboard.stripe.com/test/coupons
2. Click "Create coupon"
3. Fill in:
   - **ID**: SAVE20
   - **Type**: Percentage
   - **Percent off**: 20%
   - **Duration**: Forever (applies to all future payments)
4. Click "Create coupon"

5. Go to https://dashboard.stripe.com/test/promotion-codes
6. Click "Create promotion code"
7. Fill in:
   - **Coupon**: Select "SAVE20"
   - **Code**: SAVE20
   - **Active**: Yes
8. Click "Create promotion code"

## Step 4: Set Up Webhook Endpoint

1. Go to https://dashboard.stripe.com/test/webhooks
2. Click "Add endpoint"
3. Enter your webhook URL:
   - **Local development**: Use Stripe CLI (see below)
   - **Production**: `https://yourdomain.com/api/stripe/webhook`
4. Select events to listen to:
   - `checkout.session.completed`
   - `invoice.payment_succeeded`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
5. Click "Add endpoint"
6. Copy the **Signing secret** (starts with `whsec_`)
7. Add to your `.env.local`:

```env
STRIPE_WEBHOOK_SECRET=whsec_your_secret_here
```

### Testing Webhooks Locally with Stripe CLI

1. Install Stripe CLI: https://stripe.com/docs/stripe-cli
2. Login: `stripe login`
3. Forward webhooks to local server:
   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```
4. The CLI will output a webhook signing secret. Use this in your `.env.local` for local testing.

## Step 5: Configure Billing Portal

1. Go to https://dashboard.stripe.com/test/settings/billing/portal
2. Click "Activate test link"
3. Configure settings:
   - **Customer information**: Allow customers to update email
   - **Subscriptions**: Allow customers to cancel subscriptions
   - **Payment methods**: Allow customers to update payment methods
4. Save settings

## Step 6: Add Environment Variables to Production

For your production deployment, add these environment variables to your hosting platform:

```env
# Stripe
STRIPE_SECRET_KEY=sk_live_your_production_key
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_your_production_key
STRIPE_WEBHOOK_SECRET=whsec_your_production_secret
NEXT_PUBLIC_STRIPE_PRO_PRICE_ID=price_your_production_pro_id
NEXT_PUBLIC_BASE_URL=https://yourdomain.com

# AWS (if not already set)
AWS_REGION=us-east-1
API_GATEWAY_URL=https://your-api-gateway-url/
WEBSOCKET_API_URL=https://your-websocket-api-url/
USERS_TABLE_NAME=viral-videos-users
WEBSOCKET_CONNECTIONS_TABLE_NAME=viral-videos-websocket-connections
```

## Step 7: Deploy Lambda Changes

The Stripe integration requires updates to the user lambda. Build and deploy:

```bash
cd infrastructure
./deploy.sh
```

## Step 8: Test the Integration

### Test Subscription Flow:

1. Start your development server: `npm run dev`
2. Navigate to the pricing page: http://localhost:3000/pricing
3. Click "Subscribe" on any plan
4. Use Stripe test card: `4242 4242 4242 4242`
   - Any future expiry date
   - Any CVC
   - Any postal code
5. Complete the checkout
6. Verify:
   - You're redirected to the create page
   - Credits are added to your account
   - Subscription appears in settings page

### Test Webhook Events:

If using Stripe CLI for local testing:

```bash
# In one terminal, start the webhook listener
stripe listen --forward-to localhost:3000/api/stripe/webhook

# In another terminal, trigger test events
stripe trigger checkout.session.completed
stripe trigger invoice.payment_succeeded
```

### Test Subscription Management:

1. Go to settings page: http://localhost:3000/settings
2. Click "Manage Subscription" button
3. Verify Stripe Billing Portal opens
4. Try cancelling the subscription
5. Verify status updates in your app

## Stripe Test Cards

Use these test cards for different scenarios:

- **Success**: `4242 4242 4242 4242`
- **Payment requires authentication**: `4000 0025 0000 3155`
- **Payment is declined**: `4000 0000 0000 9995`

## Monitoring

### View Payments and Subscriptions

- **Dashboard**: https://dashboard.stripe.com/test/payments
- **Subscriptions**: https://dashboard.stripe.com/test/subscriptions
- **Customers**: https://dashboard.stripe.com/test/customers

### View Webhook Logs

- Go to https://dashboard.stripe.com/test/webhooks
- Click on your webhook endpoint
- View the logs for each event

## Troubleshooting

### Webhook signature verification fails

- Ensure `STRIPE_WEBHOOK_SECRET` is correctly set
- For local testing, use the secret from Stripe CLI
- For production, use the secret from Stripe Dashboard

### Credits not being added

- Check webhook logs in Stripe Dashboard
- Check CloudWatch logs for the webhook handler
- Verify the metadata is being passed correctly in checkout session

### Subscription status not updating

- Ensure webhook endpoint is receiving events
- Check that the webhook handler is processing events correctly
- Verify DynamoDB user table is being updated

## Production Checklist

Before going live:

- [ ] Switch to live API keys (remove `test` from keys)
- [ ] Create live products and prices
- [ ] Create live promotion codes
- [ ] Set up production webhook endpoint
- [ ] Test with real payment methods
- [ ] Configure billing portal for live mode
- [ ] Set up email notifications in Stripe
- [ ] Enable Stripe Radar for fraud prevention
- [ ] Review Stripe dashboard settings

## Security Best Practices

1. **Never expose secret keys**: Only use `NEXT_PUBLIC_` prefix for publishable keys
2. **Always verify webhook signatures**: Already implemented in webhook handler
3. **Use HTTPS in production**: Required for webhook endpoints
4. **Store sensitive data securely**: Customer and subscription IDs are in DynamoDB
5. **Implement proper error handling**: Webhook failures should be logged and monitored

## Support

For Stripe-specific issues:

- Documentation: https://stripe.com/docs
- Support: https://support.stripe.com

For application-specific issues:

- Check CloudWatch logs
- Review webhook event logs in Stripe Dashboard
- Verify DynamoDB table updates

