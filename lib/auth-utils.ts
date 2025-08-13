import { NextRequest } from 'next/server';
import { getJWTValidator } from './jwt-validator';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name?: string;
  picture?: string;
}

export interface AuthResult {
  token: string;
  userInfo: AuthenticatedUser;
}

/**
 * Validates the JWT token from the Authorization header
 * @param request - The Next.js request object
 * @returns Promise<AuthResult | null> - The authentication result or null if invalid
 */
export async function validateAuthToken(
  request: NextRequest,
): Promise<AuthResult | null> {
  console.log('🔍 Validating auth token from request...');

  const authHeader = request.headers.get('authorization');
  console.log('Auth header present:', !!authHeader);

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('❌ No valid authorization header found');
    return null;
  }

  const token = authHeader.replace('Bearer ', '');
  console.log('Token extracted, length:', token.length);

  if (!token || token.length < 10) {
    console.log('❌ Token too short or empty');
    return null;
  }

  try {
    console.log('🔧 Getting JWT validator...');
    const jwtValidator = getJWTValidator();
    console.log('🔧 Extracting user info from token...');
    const userInfo = await jwtValidator.extractUserInfo(token);

    if (!userInfo) {
      console.log('❌ Failed to extract user info from token');
      return null;
    }

    console.log('✅ User info extracted successfully:', {
      id: userInfo.id,
      email: userInfo.email,
      name: userInfo.name,
    });
    return { token, userInfo };
  } catch (error) {
    console.error('❌ JWT validation error:', error);
    return null;
  }
}

/**
 * Extracts user information from the JWT token without full validation
 * This is useful for cases where you just need the user info and don't need to validate the token again
 * @param token - The JWT token
 * @returns Promise<AuthenticatedUser | null> - The user information or null if invalid
 */
export async function extractUserFromToken(
  token: string,
): Promise<AuthenticatedUser | null> {
  try {
    const jwtValidator = getJWTValidator();
    return await jwtValidator.extractUserInfo(token);
  } catch (error) {
    console.error('Error extracting user from token:', error);
    return null;
  }
}
