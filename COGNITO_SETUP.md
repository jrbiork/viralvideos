# AWS Cognito OAuth Setup Guide

This guide will help you set up AWS Cognito with Google OAuth for your ViralVideos application.

## Prerequisites

- AWS Account
- Google Cloud Console access
- Domain name (optional, for production)

## Step 1: Set up Google OAuth

### 1.1 Create Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google+ API
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client IDs"
5. Choose "Web application"
6. Add authorized redirect URIs:
   - For development: `http://localhost:3000/auth/callback`
   - For production: `https://yourdomain.com/auth/callback`
7. Note down your Client ID and Client Secret

### 1.2 Configure Google OAuth Consent Screen

1. Go to "OAuth consent screen"
2. Fill in the required information:
   - App name: "ViralVideos"
   - User support email
   - Developer contact information
3. Add scopes: `email`, `profile`, `openid`

## Step 2: Set up AWS Cognito

### 2.1 Create User Pool

1. Go to AWS Cognito Console
2. Click "Create user pool"
3. Choose "Cognito user pool sign-in options"
4. Select "Email" and "Federated identity provider sign-in"
5. Configure password policy as needed
6. Choose "No MFA" for simplicity (or configure as needed)
7. Configure message customizations
8. Add app client:
   - Name: "viral-videos-client"
   - Generate client secret: No
   - Enable username password auth for admin APIs: Yes
   - Enable SRP (secure remote password) protocol: No
   - Enable refresh token rotation: Yes
   - Access token validity: 1 hour
   - ID token validity: 1 hour
   - Refresh token validity: 30 days
   - Read attributes: email, email_verified, name, picture
   - Write attributes: email, name, picture

### 2.2 Configure Identity Providers

1. In your User Pool, go to "Sign-in experience" → "Federated identity provider sign-in"
2. Add Google as an identity provider:
   - Provider name: "Google"
   - Client ID: Your Google OAuth Client ID
   - Client secret: Your Google OAuth Client Secret
   - Authorized scopes: email profile openid

### 2.3 Configure App Client

1. Go to "App integration" → "App client and analytics"
2. Select your app client
3. Under "Hosted UI", click "Launch hosted UI"
4. Configure the hosted UI:
   - Domain prefix: Choose a unique prefix
   - App client: Select your app client
   - Callback URLs: Add your callback URLs
   - Sign-out URLs: Add your sign-out URLs
   - Allowed OAuth flows: Authorization code grant
   - Allowed OAuth scopes: email, openid, profile
   - Identity providers: Select Google

## Step 3: Environment Configuration

Create a `.env.local` file in your project root with the following variables:

```env
# AWS Cognito Configuration
NEXT_PUBLIC_COGNITO_REGION=us-east-1
NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_xxxxxxxxx
NEXT_PUBLIC_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_COGNITO_DOMAIN=your-app.auth.us-east-1.amazoncognito.com
NEXT_PUBLIC_REDIRECT_URI=http://localhost:3000/auth/callback

# For production, update the redirect URI:
# NEXT_PUBLIC_REDIRECT_URI=https://yourdomain.com/auth/callback
```

## Step 4: Test the Setup

1. Start your development server: `npm run dev`
2. Navigate to `http://localhost:3000`
3. Click "Sign in with Google"
4. You should be redirected to Google's OAuth consent screen
5. After authorization, you should be redirected back to your app

## Troubleshooting

### Common Issues

1. **"Invalid redirect URI" error**

   - Ensure the redirect URI in Google Cloud Console matches exactly
   - Check for trailing slashes or protocol mismatches

2. **"Invalid client" error**

   - Verify your Cognito Client ID is correct
   - Ensure the client is configured for the hosted UI

3. **"Invalid identity provider" error**

   - Check that Google is properly configured as an identity provider
   - Verify the provider name matches exactly

4. **CORS errors**
   - Ensure your Cognito domain is properly configured
   - Check that callback URLs are correctly set

### Debug Steps

1. Check browser console for errors
2. Verify environment variables are loaded correctly
3. Test the OAuth flow step by step
4. Check AWS CloudWatch logs for Cognito errors

## Security Considerations

1. **Environment Variables**: Never commit `.env.local` to version control
2. **HTTPS**: Always use HTTPS in production
3. **Token Storage**: Consider using httpOnly cookies for production
4. **State Parameter**: The implementation includes CSRF protection via state parameter
5. **Token Validation**: Implement proper token validation on the server side

## Production Deployment

1. Update redirect URIs to your production domain
2. Configure custom domain for Cognito hosted UI (optional)
3. Set up proper SSL certificates
4. Configure CloudFront for better performance (optional)
5. Set up monitoring and logging

## Additional Identity Providers

To add more identity providers (Facebook, Apple, etc.):

1. Configure the provider in AWS Cognito
2. Add the provider to the LoginButton component
3. Update the OAuth flow to handle the new provider

## API Integration

To use the authentication in your API routes:

```typescript
// Example: Protected API route
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Validate token with Cognito
  // Implement token validation logic here

  return NextResponse.json({ message: 'Protected data' });
}
```

## Next Steps

1. Implement server-side token validation
2. Add user profile management
3. Set up user roles and permissions
4. Configure email verification flow
5. Add password reset functionality
