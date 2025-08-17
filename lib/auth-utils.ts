import { jwtVerify, createRemoteJWKSet } from 'jose';

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
  username?: string;
  [key: string]: any;
}

export interface JWTPayload {
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
  username?: string;
  [key: string]: any;
}

/**
 * Verifies a Cognito JWT token and returns the payload if valid
 * @param token - The JWT token to verify
 * @param returnType - Whether to return the full payload or just a boolean
 * @returns The decoded payload if valid, null otherwise (or boolean for middleware)
 */
export async function verifyCognitoToken(
  token: string,
  returnType: 'payload' | 'boolean' = 'payload',
): Promise<CognitoUserPayload | boolean | null> {
  try {
    const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
    const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
    const region = process.env.NEXT_PUBLIC_COGNITO_REGION || 'us-east-1';

    if (!userPoolId || !clientId) {
      if (returnType === 'boolean') {
        return false;
      }
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
      if (returnType === 'boolean') {
        return false;
      }
      return null;
    }

    // Additional validation
    if (jwtPayload.token_use !== 'access') {
      if (returnType === 'boolean') {
        return false;
      }
      return null;
    }

    // Check if token is expired
    const now = Math.floor(Date.now() / 1000);
    if (jwtPayload.exp < now) {
      if (returnType === 'boolean') {
        return false;
      }
      return null;
    }

    if (returnType === 'boolean') {
      return true;
    }

    return jwtPayload;
  } catch (error) {
    console.error('Cognito token verification failed:', error);
    if (returnType === 'boolean') {
      return false;
    }
    return null;
  }
}

/**
 * Verifies a Cognito JWT token and returns the payload if valid
 * This is a convenience function that always returns the payload
 */
export async function verifyCognitoTokenPayload(
  token: string,
): Promise<CognitoUserPayload | null> {
  const result = await verifyCognitoToken(token, 'payload');
  return result as CognitoUserPayload | null;
}

/**
 * Verifies a Cognito JWT token and returns a boolean indicating validity
 * This is a convenience function that always returns a boolean
 */
export async function verifyCognitoTokenBoolean(
  token: string,
): Promise<boolean> {
  const result = await verifyCognitoToken(token, 'boolean');
  return result as boolean;
}
