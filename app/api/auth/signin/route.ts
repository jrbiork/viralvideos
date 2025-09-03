import { NextRequest, NextResponse } from 'next/server';

const COGNITO_TOKEN_COOKIE_NAME = 'viral-videos-cognito-token';

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
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
    }
    const { region, clientId, clientSecret } = getCognitoConfig();
    const secretHash = computeSecretHash(email, clientId, clientSecret);

    const resp = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
      },
      body: JSON.stringify({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: clientId,
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password,
          ...(secretHash ? { SECRET_HASH: secretHash } : {}),
        },
      }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      return NextResponse.json({ error: data?.message || 'Sign in failed' }, { status: resp.status });
    }

    const accessToken = data?.AuthenticationResult?.AccessToken;
    if (!accessToken) {
      return NextResponse.json({ error: 'No access token returned' }, { status: 500 });
    }

    // Reuse session endpoint to set cookie and upsert user
    // First, set the cookie on the client response
    const res = NextResponse.json({ success: true });
    res.cookies.set(COGNITO_TOKEN_COOKIE_NAME, accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24,
      path: '/',
    });

    // Then, call the session endpoint to upsert the user and enrich response (server-side)
    // Note: This internal call does not rely on the browser cookie; it passes the token directly.
    const origin = req.nextUrl.origin;
    try {
      const sessionResp = await fetch(`${origin}/api/auth/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: accessToken, email }),
      });
      const sessionData = await sessionResp.json().catch(() => ({}));
      if (sessionResp.ok) {
        // Attach user to the existing response body
        return NextResponse.json({ success: true, user: sessionData.user }, { headers: res.headers });
      }
      // If session upsert fails, still return success (cookie is set) with a warning
      return NextResponse.json({ success: true, warning: sessionData?.error || 'Session upsert failed' }, { headers: res.headers });
    } catch (e) {
      return NextResponse.json({ success: true, warning: 'Session call failed' }, { headers: res.headers });
    }
    
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}
