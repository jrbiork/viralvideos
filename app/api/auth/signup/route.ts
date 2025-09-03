import { NextRequest, NextResponse } from 'next/server';

function getCognitoConfig() {
  const region = process.env.NEXT_PUBLIC_COGNITO_REGION || 'us-east-1';
  const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
  const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
  const clientSecret = process.env.NEXT_PUBLIC_COGNITO_CLIENT_SECRET;
  if (!userPoolId || !clientId) throw new Error('Cognito not configured');
  return { region, userPoolId, clientId, clientSecret };
}

function computeSecretHash(username: string, clientId: string, clientSecret?: string) {
  if (!clientSecret) return undefined;
  const crypto = require('crypto');
  return crypto
    .createHmac('SHA256', clientSecret)
    .update(username + clientId)
    .digest('base64');
}

export async function POST(req: NextRequest) {
  try {
    const { email, password, name } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
    }
    const { region, clientId, clientSecret } = getCognitoConfig();
    // When the user pool is configured with email as an alias, Username
    // cannot be an email. Generate a compliant username and use email as an attribute.
    const base = String(email).split('@')[0].replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 24);
    const suffix = Math.random().toString(36).slice(2, 8);
    const username = `${base}_${suffix}`; // ensure non-email format
    const secretHash = computeSecretHash(username, clientId, clientSecret);

    const resp = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.SignUp',
      },
      body: JSON.stringify({
        ClientId: clientId,
        Username: username,
        Password: password,
        SecretHash: secretHash,
        UserAttributes: [
          { Name: 'email', Value: email },
          ...(name ? [{ Name: 'name', Value: name }] : []),
          // Optional: help sign-in UX by exposing preferred_username
          { Name: 'preferred_username', Value: email },
        ],
      }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      return NextResponse.json({ error: data?.message || 'Sign up failed' }, { status: resp.status });
    }

    return NextResponse.json({
      userConfirmed: data.UserConfirmed,
      codeDelivery: data.CodeDeliveryDetails,
      // Inform the client we used email as alias and a generated username
      usernameUsed: username,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}
