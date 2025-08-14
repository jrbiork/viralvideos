import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const SESSION_SECRET =
  process.env.SESSION_SECRET || 'your-session-secret-key-change-in-production';
const SESSION_COOKIE_NAME = 'viral-videos-session';

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  picture?: string;
  cognitoToken?: string;
  iat: number;
  exp: number;
}

export async function verifySession(): Promise<SessionPayload | null> {
  try {
    const cookieStore = cookies();
    const sessionToken = cookieStore.get(SESSION_COOKIE_NAME);

    if (!sessionToken) {
      return null;
    }

    const { payload } = await jwtVerify(
      sessionToken.value,
      new TextEncoder().encode(SESSION_SECRET),
    );

    const sessionData = payload as unknown as SessionPayload;

    // Check if session is expired
    const now = Math.floor(Date.now() / 1000);
    if (sessionData.exp < now) {
      return null;
    }

    return sessionData;
  } catch (error) {
    return null;
  }
}
