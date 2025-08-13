# AWS Cognito OAuth Troubleshooting Guide

## 🔍 Current Issue: `invalid_client` Error

The error `{"error":"invalid_client"}` indicates that the client ID or client secret being used in the token exchange doesn't match what Cognito expects.

## 🛠️ Solutions

### 1. **Check App Client Configuration**

In AWS Cognito Console:

1. Go to your User Pool
2. Navigate to "App integration" → "App client and analytics"
3. Select your app client
4. Verify the following settings:

#### Required Settings:

- **Client ID**: Copy this exact value to `NEXT_PUBLIC_COGNITO_CLIENT_ID`
- **Client Secret**: If "Generate client secret" is enabled, copy this to `NEXT_PUBLIC_COGNITO_CLIENT_SECRET`
- **OAuth Flows**: Must include "Authorization code grant"
- **Callback URLs**: Must include `http://localhost:3000/auth/callback`
- **Sign-out URLs**: Must include `http://localhost:3000`
- **Allowed OAuth Scopes**: Must include `email`, `openid`, `profile`
- **Identity Providers**: Must include Google

### 2. **Environment Variables Setup**

Create or update your `.env.local` file:

```env
# AWS Cognito OAuth Configuration
NEXT_PUBLIC_COGNITO_REGION=us-east-1
NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_xxxxxxxxx
NEXT_PUBLIC_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_COGNITO_CLIENT_SECRET=your_client_secret_here
NEXT_PUBLIC_COGNITO_DOMAIN=your-app.auth.us-east-1.amazoncognito.com
NEXT_PUBLIC_REDIRECT_URI=http://localhost:3000/auth/callback
```

### 3. **Client Secret Requirements**

#### If your app client has a client secret:

- You MUST include `NEXT_PUBLIC_COGNITO_CLIENT_SECRET` in your environment variables
- The client secret is required for token exchange

#### If your app client does NOT have a client secret:

- Remove `NEXT_PUBLIC_COGNITO_CLIENT_SECRET` from environment variables
- The app client must be configured as a "public client"

### 4. **Verify App Client Type**

#### Public Client (No Client Secret):

- Used for browser-based applications
- Client secret is not generated
- Less secure but simpler for frontend apps

#### Confidential Client (With Client Secret):

- Used for server-side applications
- Client secret is generated and required
- More secure but requires secret management

## 🔧 Debug Steps

### Step 1: Check Configuration

1. Check your environment variables in `.env.local`
2. Verify all environment variables are set correctly
3. Check the browser console for any error messages

### Step 2: Verify Cognito Settings

1. In AWS Console, go to your User Pool
2. Check "App integration" → "App client and analytics"
3. Verify the app client settings match your environment variables

### Step 3: Test OAuth Flow

1. Clear browser localStorage: `localStorage.clear()`
2. Try the authentication flow again
3. Check browser console for detailed error messages

### Step 4: Check Network Requests

1. Open browser Developer Tools → Network tab
2. Try authentication flow
3. Look for the `/oauth2/token` request
4. Check request payload and response

## 🚨 Common Issues and Solutions

### Issue 1: Wrong Client ID

**Symptoms**: `invalid_client` error
**Solution**:

- Copy the exact Client ID from Cognito Console
- Ensure no extra spaces or characters

### Issue 2: Missing Client Secret

**Symptoms**: `invalid_client` error
**Solution**:

- If app client has a secret, add `NEXT_PUBLIC_COGNITO_CLIENT_SECRET`
- If app client doesn't have a secret, remove the variable

### Issue 3: Incorrect Redirect URI

**Symptoms**: `invalid_redirect_uri` error
**Solution**:

- Ensure redirect URI matches exactly in Cognito and environment
- Check for trailing slashes or protocol mismatches

### Issue 4: Wrong Domain

**Symptoms**: CORS errors or connection failures
**Solution**:

- Verify `NEXT_PUBLIC_COGNITO_DOMAIN` is correct
- Check the domain format: `your-app.auth.us-east-1.amazoncognito.com`

### Issue 5: OAuth Scopes Missing

**Symptoms**: Authentication succeeds but no user info
**Solution**:

- Ensure scopes include `email`, `openid`, `profile`
- Check Cognito app client OAuth scopes configuration

## 🔐 Security Considerations

### For Development:

- Using `NEXT_PUBLIC_` prefix exposes variables to the browser
- This is acceptable for client-side OAuth flows
- Client secrets are still protected by HTTPS

### For Production:

- Consider using server-side token exchange
- Implement proper token validation
- Use environment-specific configurations

## 📋 Checklist

- [ ] App client ID matches `NEXT_PUBLIC_COGNITO_CLIENT_ID`
- [ ] Client secret is set if app client has one
- [ ] Redirect URI matches exactly
- [ ] Cognito domain is correct
- [ ] OAuth scopes are configured
- [ ] Identity providers are enabled
- [ ] Callback URLs are set in Cognito
- [ ] Environment variables are loaded correctly

## 🆘 Still Having Issues?

1. **Check AWS CloudWatch Logs**:

   - Go to CloudWatch → Log groups
   - Look for Cognito-related logs
   - Check for authentication errors

2. **Verify Google OAuth**:

   - Check Google Cloud Console
   - Ensure redirect URIs match
   - Verify OAuth consent screen

3. **Test with AWS CLI**:

   ```bash
   aws cognito-idp describe-user-pool-client \
     --user-pool-id YOUR_USER_POOL_ID \
     --client-id YOUR_CLIENT_ID
   ```

4. **Contact Support**:
   - AWS Support for Cognito issues
   - Check AWS documentation for latest updates
