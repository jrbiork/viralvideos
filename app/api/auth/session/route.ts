import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import { cookies } from 'next/headers';

const COGNITO_TOKEN_COOKIE_NAME = 'viral-videos-cognito-token';

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

    // Set the Cognito token directly in a cookie
    const response = NextResponse.json({
      success: true,
      user: {
        id: userData.sub,
        email: userData.email,
        name: userInfo.name,
        picture: userInfo.picture,
      },
    });

    response.cookies.set(COGNITO_TOKEN_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60, // 1 hour (matches Cognito token lifetime)
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
    const cognitoToken = cookieStore.get(COGNITO_TOKEN_COOKIE_NAME);

    if (!cognitoToken) {
      return NextResponse.json({ user: null });
    }

    // Verify the Cognito token directly
    const userData = await verifyCognitoToken(cognitoToken.value);
    if (!userData) {
      return NextResponse.json({ user: null });
    }

    // Get additional user info from Cognito
    const cognitoUserInfo = await getUserInfoFromCognito(cognitoToken.value);

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

    const userResponse = {
      user: {
        id: userData.sub,
        email: userData.email,
        name: userInfo.name,
        picture: userInfo.picture,
      },
    };

    console.log('Session GET response:', {
      userData,
      userResponse,
    });

    return NextResponse.json(userResponse);
  } catch (error) {
    console.error('Session verification failed:', error);
    return NextResponse.json({ user: null });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete(COGNITO_TOKEN_COOKIE_NAME);
  return response;
}
