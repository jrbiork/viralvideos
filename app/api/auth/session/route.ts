import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  verifyCognitoTokenPayload,
  type CognitoUserPayload,
} from '../../../../lib/auth-utils';
import { userSessionCache } from '../../../../lib/session-cache';

const COGNITO_TOKEN_COOKIE_NAME = 'viral-videos-cognito-token';

type JWTPayload = CognitoUserPayload;

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
        // User info retrieved successfully
        return cognitoUserInfo;
      } else {
        console.error('Cognito user info request failed:', {
          status: userInfoResponse.status,
          statusText: userInfoResponse.statusText,
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
    const {
      token,
      email: fallbackEmail,
      name: fallbackName,
    } = await request.json();

    if (!token) {
      return NextResponse.json({ error: 'Token required' }, { status: 400 });
    }

    // Verify the Cognito token
    const userData = await verifyCognitoTokenPayload(token);
    if (!userData) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // User data verified successfully

    // Get user info for response
    const cognitoUserInfo = await getUserInfoFromCognito(token);

    // Get email from userInfo if not in JWT
    let userEmail = fallbackEmail || userData.email || cognitoUserInfo?.email;
    const userName =
      fallbackName ||
      userData.name ||
      cognitoUserInfo?.name ||
      cognitoUserInfo?.given_name ||
      userData.username?.split('_')[1] ||
      'User';

    // Validate required fields after getting user info
    if (!userData.sub || !userEmail) {
      console.error('Missing required user data fields:', {
        sub: userData.sub,
        email: userEmail,
        cognitoUserInfo: cognitoUserInfo,
        allData: userData,
      });
      // As a last resort, synthesize an email to satisfy downstream requirements
      // This keeps the session flow working even if /oauth2/userInfo doesn't include email.
      // Format: <username>@unknown.local
      const synthesizedEmail = `${userData.username || 'user'}@unknown.local`;
      (request as any).synthesizedEmail = synthesizedEmail;
      // Proceed with synthesized email
      const userInfo = {
        name: userName,
        picture:
          cognitoUserInfo?.picture ||
          cognitoUserInfo?.picture_url ||
          userData.picture,
      };

      // Create or update user in DynamoDB
      try {
        const userPayload = {
          userId: userData.sub,
          email: synthesizedEmail,
          name: userInfo.name,
          username: userData.username,
          picture: userInfo.picture,
        };

        const userManagementResponse = await fetch(
          `${request.nextUrl.origin}/api/user`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(userPayload),
          },
        );

        if (!userManagementResponse.ok) {
          console.error(
            'Failed to manage user via API Gateway:',
            await userManagementResponse.text(),
          );
        }
      } catch (error) {
        console.error(
          'Error managing user via API Gateway (synthesized):',
          error,
        );
      }

      const response = NextResponse.json({
        success: true,
        user: {
          id: userData.sub,
          email: synthesizedEmail,
          name: userName,
          picture:
            cognitoUserInfo?.picture ||
            cognitoUserInfo?.picture_url ||
            userData.picture,
        },
      });
      response.cookies.set(COGNITO_TOKEN_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24,
        path: '/',
      });
      return response;
    }

    const userInfo = {
      name: userName,
      picture:
        cognitoUserInfo?.picture ||
        cognitoUserInfo?.picture_url ||
        userData.picture,
    };

    // Create or update user in DynamoDB
    let dbEmail: string | undefined;
    try {
      const userPayload = {
        userId: userData.sub,
        email: userEmail,
        name: userInfo.name,
        username: userData.username,
        picture: userInfo.picture,
      };

      const userManagementResponse = await fetch(
        `${request.nextUrl.origin}/api/user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(userPayload), // User info comes from JWT token
        },
      );

      if (userManagementResponse.ok) {
        const managed = await userManagementResponse.json();
        dbEmail = managed?.user?.email || dbEmail;
        // User management successful; prefer DB email if present
      } else {
        console.error(
          'Failed to manage user via API Gateway:',
          await userManagementResponse.text(),
        );
      }
    } catch (error) {
      console.error('Error managing user via API Gateway:', error);
    }

    // Prefer the email returned from DB if available
    const finalEmail = dbEmail || userEmail;

    // Set the Cognito token directly in a cookie
    const response = NextResponse.json({
      success: true,
      user: {
        id: userData.sub,
        email: finalEmail,
        name: userInfo.name,
        picture: userInfo.picture,
      },
    });

    response.cookies.set(COGNITO_TOKEN_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24, // 1 day
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

export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const cognitoToken = cookieStore.get(COGNITO_TOKEN_COOKIE_NAME);

    if (!cognitoToken) {
      return NextResponse.json({ user: null });
    }

    // Verify the Cognito token directly
    const userData = await verifyCognitoTokenPayload(cognitoToken.value);
    if (!userData) {
      return NextResponse.json({ user: null });
    }

    // Check cache first
    const cachedUser = userSessionCache.getSession(
      userData.sub,
      cognitoToken.value,
    );
    if (cachedUser) {
      return NextResponse.json({ user: cachedUser });
    }

    // Get additional user info from Cognito (may not include email for access tokens without OIDC scope)
    const cognitoUserInfo = await getUserInfoFromCognito(cognitoToken.value);

    // Derive best-effort email and name
    let derivedEmail =
      userData.email ||
      cognitoUserInfo?.email ||
      `${userData.username || 'user'}@unknown.local`;
    const userName =
      userData.name ||
      cognitoUserInfo?.name ||
      cognitoUserInfo?.given_name ||
      userData.username?.split('_')[1] ||
      'User';

    // Validate required id
    if (!userData.sub) {
      console.error('Missing required user sub in GET:', { allData: userData });
      return NextResponse.json({ user: null });
    }

    const userInfo = {
      name: userName,
      picture:
        cognitoUserInfo?.picture ||
        cognitoUserInfo?.picture_url ||
        userData.picture,
    };

    // Update lastLoginAt in DynamoDB for existing sessions
    // Try to sync/update user and prefer DB email afterwards
    let dbEmailGet: string | undefined;
    try {
      const userPayload = {
        userId: userData.sub,
        email: derivedEmail,
        name: userInfo.name,
        username: userData.username,
        picture: userInfo.picture,
      };

      const userManagementResponse = await fetch(
        `${request.nextUrl.origin}/api/user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${cognitoToken.value}`,
          },
          body: JSON.stringify(userPayload), // User info comes from JWT token
        },
      );

      if (userManagementResponse.ok) {
        const managed = await userManagementResponse.json();
        dbEmailGet = managed?.user?.email || dbEmailGet;
        // Session update successful
      } else {
        console.error(
          'Failed to update user session via API Gateway:',
          await userManagementResponse.text(),
        );
      }
    } catch (error) {
      console.error('Error updating user session via API Gateway:', error);
    }

    // Prefer email from DB if returned
    const finalEmailGet = dbEmailGet || derivedEmail;

    const userResponse = {
      user: {
        id: userData.sub,
        email: finalEmailGet,
        name: userInfo.name,
        picture: userInfo.picture,
      },
    };

    // Cache the user data for 1 hour
    userSessionCache.setSession(
      userData.sub,
      cognitoToken.value,
      userResponse.user,
    );

    return NextResponse.json(userResponse);
  } catch (error) {
    console.error('Session verification failed:', error);
    return NextResponse.json({ user: null });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const cognitoToken = cookieStore.get(COGNITO_TOKEN_COOKIE_NAME);

    // Clear cache for this user if token exists
    if (cognitoToken) {
      const userData = await verifyCognitoTokenPayload(cognitoToken.value);
      if (userData?.sub) {
        userSessionCache.deleteSession(userData.sub, cognitoToken.value);
      }
    }

    const response = NextResponse.json({ success: true });
    response.cookies.delete(COGNITO_TOKEN_COOKIE_NAME);
    return response;
  } catch (error) {
    console.error('Session deletion failed:', error);
    const response = NextResponse.json({ success: true });
    response.cookies.delete(COGNITO_TOKEN_COOKIE_NAME);
    return response;
  }
}
