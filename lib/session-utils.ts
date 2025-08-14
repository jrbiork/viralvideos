import { jwtVerify, createRemoteJWKSet } from 'jose';
import { cookies } from 'next/headers';

const COGNITO_TOKEN_COOKIE_NAME = 'viral-videos-cognito-token';

export interface CognitoUserPayload {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  exp: number;
  iat: number;
  iss: string;
  aud: string;
  token_use: string;
  auth_time: number;
  client_id: string;
  [key: string]: any;
}

async function verifyCognitoToken(token: string): Promise<CognitoUserPayload | null> {
  try {
    const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
    const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
    const region = process.env.NEXT_PUBLIC_COGNITO_REGION || 'us-east-1';

    if (!userPoolId || !clientId) {
      return null;
    }

    const jwksUrl = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`;
    const JWKS = createRemoteJWKSet(new URL(jwksUrl));

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`,
      algorithms: ['RS256'],
    });

    const jwtPayload = payload as CognitoUserPayload;

    // Manual audience validation
    const tokenClientId = jwtPayload.client_id || jwtPayload.aud;
    if (tokenClientId !== clientId) {
      return null;
    }

    // Additional validation
    if (jwtPayload.token_use !== 'access') {
      return null;
    }

    // Check if token is expired
    const now = Math.floor(Date.now() / 1000);
    if (jwtPayload.exp < now) {
      return null;
    }

    return jwtPayload;
  } catch (error) {
    console.error('Cognito token verification failed:', error);
    return null;
  }
}

export async function verifySession(): Promise<CognitoUserPayload | null> {
  try {
    const cookieStore = cookies();
    const cognitoToken = cookieStore.get(COGNITO_TOKEN_COOKIE_NAME);

    if (!cognitoToken) {
      return null;
    }

    return await verifyCognitoToken(cognitoToken.value);
  } catch (error) {
    console.error('Session verification failed:', error);
    return null;
  }
}
