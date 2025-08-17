import { cookies } from 'next/headers';
import {
  verifyCognitoTokenPayload,
  type CognitoUserPayload,
} from './auth-utils';

const COGNITO_TOKEN_COOKIE_NAME = 'viral-videos-cognito-token';

export async function verifySession(): Promise<CognitoUserPayload | null> {
  try {
    const cookieStore = cookies();
    const cognitoToken = cookieStore.get(COGNITO_TOKEN_COOKIE_NAME);

    if (!cognitoToken) {
      return null;
    }

    return await verifyCognitoTokenPayload(cognitoToken.value);
  } catch (error) {
    console.error('Session verification failed:', error);
    return null;
  }
}
