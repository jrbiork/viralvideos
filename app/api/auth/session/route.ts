import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import { cookies } from 'next/headers';
import { SignJWT, jwtDecode } from 'jose';

const SESSION_SECRET =
  process.env.SESSION_SECRET || 'your-session-secret-key-change-in-production';
const SESSION_COOKIE_NAME = 'viral-videos-session';

interface JWTPayload {
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

interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  picture?: string;
  cognitoToken?: string; // Store the Cognito JWT token
  iat: number;
  exp: number;
}

async function verifyCognitoToken(token: string): Promise<JWTPayload | null> {
  try {
    const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
    const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
    const region = process.env.NEXT_PUBLIC_COGNITO_REGION || 'us-east-1';

    if (!userPoolId || !clientId) {
      throw new Error('Cognito configuration missing');
    }

    const jwksUrl = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`;
    const JWKS = createRemoteJWKSet(new URL(jwksUrl));

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`,
      algorithms: ['RS256'],
    });

    const jwtPayload = payload as JWTPayload;

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
    console.error('Token verification failed:', error);
    return null;
  }
}

async function getUserInfoFromCognito(accessToken: string) {
  try {
    const cognitoDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN;
    if (cognitoDomain) {
      const cleanDomain = cognitoDomain.replace(/^https?:\/\//, '');
      const userInfoResponse = await fetch(
        `https://${cleanDomain}/oauth2/userInfo`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (userInfoResponse.ok) {
        const cognitoUserInfo = await userInfoResponse.json();
        console.log('Cognito user info response:', {
          status: userInfoResponse.status,
          headers: Object.fromEntries(userInfoResponse.headers.entries()),
          data: cognitoUserInfo,
          availableFields: Object.keys(cognitoUserInfo),
          nameField: cognitoUserInfo.name,
          givenNameField: cognitoUserInfo.given_name,
          familyNameField: cognitoUserInfo.family_name,
          emailField: cognitoUserInfo.email,
        });
        return cognitoUserInfo;
      } else {
        console.error('Cognito user info request failed:', {
          status: userInfoResponse.status,
          statusText: userInfoResponse.statusText,
          headers: Object.fromEntries(userInfoResponse.headers.entries()),
        });
      }
    }
  } catch (error) {
    console.error('Failed to fetch user info from Cognito:', error);
  }
  return null;
}

async function createSession(
  userData: JWTPayload,
  accessToken: string,
): Promise<string> {
  // Try to get additional user info from Cognito user info endpoint
  const cognitoUserInfo = await getUserInfoFromCognito(accessToken);

  const userInfo = {
    name:
      cognitoUserInfo?.name ||
      cognitoUserInfo?.given_name ||
      cognitoUserInfo?.preferred_username ||
      userData.name ||
      userData.email?.split('@')[0] ||
      'User',
    picture:
      cognitoUserInfo?.picture ||
      cognitoUserInfo?.picture_url ||
      userData.picture,
  };

  console.log('User info extraction:', {
    cognitoUserInfo: cognitoUserInfo
      ? {
          name: cognitoUserInfo.name,
          given_name: cognitoUserInfo.given_name,
          preferred_username: cognitoUserInfo.preferred_username,
        }
      : null,
    userData: {
      name: userData.name,
      email: userData.email,
    },
    finalUserInfo: userInfo,
  });

  const sessionPayload: SessionPayload = {
    userId: userData.sub,
    email: userData.email,
    name: userInfo.name,
    picture: userInfo.picture,
    cognitoToken: accessToken, // Store the Cognito JWT token
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24 hours
  };

  console.log('Session payload created:', {
    userId: sessionPayload.userId,
    email: sessionPayload.email,
    hasCognitoToken: !!sessionPayload.cognitoToken,
    cognitoTokenLength: sessionPayload.cognitoToken?.length,
  });

  const sessionToken = await new SignJWT(sessionPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(new TextEncoder().encode(SESSION_SECRET));

  return sessionToken;
}

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json({ error: 'Token required' }, { status: 400 });
    }

    // Verify the Cognito token
    const userData = await verifyCognitoToken(token);
    if (!userData) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Debug: Log the user data to see what fields are available
    console.log('Cognito JWT token payload:', {
      sub: userData.sub,
      email: userData.email,
      name: userData.name,
      picture: userData.picture,
      availableFields: Object.keys(userData),
      allData: userData,
    });

    // Create a session
    console.log('Creating session with token length:', token.length);
    const sessionToken = await createSession(userData, token);

    // Get user info for response
    const cognitoUserInfo = await getUserInfoFromCognito(token);

    const userInfo = {
      name:
        cognitoUserInfo?.name ||
        cognitoUserInfo?.given_name ||
        cognitoUserInfo?.preferred_username ||
        userData.name ||
        userData.email?.split('@')[0] ||
        'User',
      picture:
        cognitoUserInfo?.picture ||
        cognitoUserInfo?.picture_url ||
        userData.picture,
    };

    // Set the session cookie
    const response = NextResponse.json({
      success: true,
      user: {
        id: userData.sub,
        email: userData.email,
        name: userInfo.name,
        picture: userInfo.picture,
      },
    });

    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60, // 24 hours
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Session creation failed:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    const cookieStore = cookies();
    const sessionToken = cookieStore.get(SESSION_COOKIE_NAME);

    if (!sessionToken) {
      return NextResponse.json({ user: null });
    }

    // Verify the session token
    const { payload } = await jwtVerify(
      sessionToken.value,
      new TextEncoder().encode(SESSION_SECRET),
    );

    const sessionData = payload as unknown as SessionPayload;

    // Check if session is expired
    const now = Math.floor(Date.now() / 1000);
    if (sessionData.exp < now) {
      return NextResponse.json({ user: null });
    }

    const userResponse = {
      user: {
        id: sessionData.userId,
        email: sessionData.email,
        name: sessionData.name || sessionData.email?.split('@')[0] || 'User',
        picture: sessionData.picture,
      },
    };

    console.log('Session GET response:', {
      sessionData,
      userResponse,
      hasCognitoToken: !!sessionData.cognitoToken,
    });

    return NextResponse.json(userResponse);
  } catch (error) {
    console.error('Session verification failed:', error);
    return NextResponse.json({ user: null });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}
