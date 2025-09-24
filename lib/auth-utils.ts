import {
  jwtVerify,
  createRemoteJWKSet,
  JWTPayload as JoseJWTPayload,
} from 'jose';

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

// Singleton JWKS per user pool to avoid repeated network fetches
type PoolKey = string; // `${region}:${userPoolId}`
const jwksByPool = new Map<PoolKey, ReturnType<typeof createRemoteJWKSet>>();

function getJWKS(region: string, userPoolId: string) {
  const key = `${region}:${userPoolId}`;
  let jwks = jwksByPool.get(key);
  if (!jwks) {
    const jwksUrl = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`;
    jwks = createRemoteJWKSet(new URL(jwksUrl));
    jwksByPool.set(key, jwks);
  }
  return jwks;
}

// Simple in-memory token verification cache keyed by token
const tokenCache = new Map<string, { payload: JoseJWTPayload; exp: number }>();

function getCachedPayload(token: string): JoseJWTPayload | null {
  const entry = tokenCache.get(token);
  if (!entry) return null;
  const nowSec = Math.floor(Date.now() / 1000);
  if (entry.exp && entry.exp > nowSec) return entry.payload;
  tokenCache.delete(token);
  return null;
}

function setCachedPayload(token: string, payload: JoseJWTPayload) {
  const exp = typeof payload.exp === 'number' ? payload.exp : 0;
  if (exp > 0) tokenCache.set(token, { payload, exp });
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

    // Try cache first to avoid repeated signature checks within token lifetime
    const cached = getCachedPayload(token);
    if (cached) {
      console.log('cached:', cached);
      if (returnType === 'boolean') return true;
      const jwtPayload = cached as unknown as CognitoUserPayload;
      // Also ensure audience and token_use still match
      const tokenClientIdCached =
        (jwtPayload as any).client_id || (jwtPayload as any).aud;
      if (
        tokenClientIdCached !== clientId ||
        (jwtPayload as any).token_use !== 'access'
      ) {
        // fall through to full verification
        console.log('falling through to full verification');
      } else {
        return jwtPayload;
      }
    }

    const JWKS = getJWKS(region, userPoolId);

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

    // Cache verified payload until exp
    setCachedPayload(token, payload);

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
