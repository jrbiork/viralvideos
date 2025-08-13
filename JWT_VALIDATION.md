# JWT Validation Implementation

This document describes the proper JWT validation implementation for the Viral Videos application using AWS Cognito.

## Overview

The application now uses proper JWT validation instead of basic token length checks. This ensures that:

1. **Token Authenticity**: Tokens are cryptographically verified using Cognito's public keys
2. **Token Expiration**: Expired tokens are automatically rejected
3. **User Identification**: User information is extracted from validated tokens
4. **Security**: Only valid, non-expired tokens from the correct Cognito user pool are accepted

## Implementation Details

### Dependencies

The following packages were added to support JWT validation:

```json
{
  "jsonwebtoken": "^9.0.0",
  "jwks-client": "^3.0.0",
  "@types/jsonwebtoken": "^9.0.0"
}
```

### Core Components

#### 1. JWT Validator (`lib/jwt-validator.ts`)

The main JWT validation class that:

- Connects to Cognito's JWKS (JSON Web Key Set) endpoint
- Validates JWT tokens using RS256 algorithm
- Verifies token issuer, audience, and expiration
- Extracts user information from validated tokens

#### 2. Authentication Utilities (`lib/auth-utils.ts`)

Shared utilities for API routes that:

- Provide a consistent interface for token validation
- Handle authorization header parsing
- Return structured authentication results

### Environment Variables Required

Make sure these environment variables are set:

```env
NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_xxxxxxxxx
NEXT_PUBLIC_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_COGNITO_REGION=us-east-1
```

### API Route Updates

All API routes have been updated to use proper JWT validation:

#### Before (Basic Validation)

```typescript
// Basic validation - in production, you should validate the JWT token properly
if (!token || token.length < 10) {
  return null;
}
```

#### After (Proper JWT Validation)

```typescript
import { validateAuthToken } from '../../../lib/auth-utils';

// Validate authentication
const authResult = await validateAuthToken(request);
if (!authResult) {
  return NextResponse.json(
    { error: 'Unauthorized: Missing or invalid authentication token' },
    { status: 401 },
  );
}

const { userInfo } = authResult;
// userInfo contains: { id, email, name?, picture? }
```

### Updated Routes

1. **`/api/fetch-videos`** - Now uses authenticated user ID instead of hardcoded demo user
2. **`/api/generate-video`** - Uses authenticated user ID for video generation
3. **`/api/user`** - Returns actual user data from JWT token instead of mock data

## Security Features

### Token Validation Checks

1. **Signature Verification**: Uses Cognito's public keys to verify token signature
2. **Algorithm Validation**: Only accepts RS256 algorithm
3. **Issuer Verification**: Validates token issuer matches Cognito user pool
4. **Audience Verification**: Validates token audience matches client ID
5. **Expiration Check**: Rejects expired tokens
6. **Token Use Validation**: Ensures token is an access token

### Error Handling

- Invalid tokens return 401 Unauthorized
- Expired tokens are automatically rejected
- Network errors during validation are logged and handled gracefully
- JWKS caching reduces API calls to Cognito

## Usage Examples

### Basic API Route Authentication

```typescript
import { validateAuthToken } from '../../../lib/auth-utils';

export async function GET(request: NextRequest) {
  const authResult = await validateAuthToken(request);
  if (!authResult) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { userInfo } = authResult;
  // Use userInfo.id, userInfo.email, etc.
}
```

### Extracting User from Token

```typescript
import { extractUserFromToken } from '../../../lib/auth-utils';

const userInfo = await extractUserFromToken(token);
if (userInfo) {
  console.log('User ID:', userInfo.id);
  console.log('User Email:', userInfo.email);
}
```

## Testing

To test the JWT validation:

1. Ensure your Cognito configuration is correct
2. Get a valid token through the authentication flow
3. Make API requests with the token in the Authorization header
4. Verify that invalid/expired tokens are rejected
5. Verify that valid tokens return proper user information

## Troubleshooting

### Common Issues

1. **"NEXT_PUBLIC_COGNITO_USER_POOL_ID is not configured"**

   - Ensure the environment variable is set correctly

2. **"JWT validation error"**

   - Check that the token is valid and not expired
   - Verify Cognito configuration matches your setup

3. **"Invalid token use"**
   - Ensure you're using an access token, not an ID token

### Debug Mode

Enable debug logging by checking the console for JWT validation errors and Cognito configuration issues.
