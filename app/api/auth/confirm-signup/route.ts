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
    const { email, code, username, password } = await req.json();
    if ((!email && !username) || !code) {
      return NextResponse.json({ error: 'Email or username and code required' }, { status: 400 });
    }
    const { region, clientId, clientSecret } = getCognitoConfig();
    const usernameForConfirm = username || email;
    const secretHash = computeSecretHash(usernameForConfirm, clientId, clientSecret);

    const resp = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.ConfirmSignUp',
      },
      body: JSON.stringify({
        ClientId: clientId,
        Username: usernameForConfirm,
        ConfirmationCode: code,
        SecretHash: secretHash,
      }),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return NextResponse.json({ error: data?.message || 'Confirmation failed' }, { status: resp.status });
    }

    // Optionally initiate auth and set cookie if password provided
    if (password && email) {
      // Initiate USER_PASSWORD_AUTH login
      const secretHashForSignin = computeSecretHash(email, clientId, clientSecret);
      const signInResp = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
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
            ...(secretHashForSignin ? { SECRET_HASH: secretHashForSignin } : {}),
          },
        }),
      });
      const signInData = await signInResp.json().catch(() => ({}));
      if (!signInResp.ok) {
        // If sign-in fails, return confirmation success but with sign-in error
        return NextResponse.json({ success: true, signInError: signInData?.message || 'Sign-in failed' });
      }

      const accessToken = signInData?.AuthenticationResult?.AccessToken;
      if (accessToken) {
        // First, set cookie on the client response
        const cookieHeaders = new Headers();
        const resWithCookie = NextResponse.json({ success: true });
        resWithCookie.cookies.set(COGNITO_TOKEN_COOKIE_NAME, accessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24,
          path: '/',
        });

        // Then, call the session endpoint to upsert user (server-side) using the token
        const origin = req.nextUrl.origin;
        try {
          const sessionResp = await fetch(`${origin}/api/auth/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: accessToken, email }),
          });
          const sessionData = await sessionResp.json().catch(() => ({}));
          if (sessionResp.ok) {
            // Return success with user; cookie header retained
            return NextResponse.json({ success: true, user: sessionData.user }, { headers: resWithCookie.headers });
          }
          return NextResponse.json(
            { success: true, warning: 'Confirmed but failed to create session', details: sessionData?.error },
            { headers: resWithCookie.headers },
          );
        } catch (e) {
          return NextResponse.json(
            { success: true, warning: 'Confirmed but session call failed' },
            { headers: resWithCookie.headers },
          );
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}
