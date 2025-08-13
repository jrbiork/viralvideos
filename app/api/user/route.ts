import { NextRequest, NextResponse } from 'next/server';
import { validateAuthToken } from '../../../lib/auth-utils';

export async function GET(request: NextRequest) {
  try {
    // Validate authentication
    const authResult = await validateAuthToken(request);
    if (!authResult) {
      return NextResponse.json(
        { error: 'Missing or invalid authorization header' },
        { status: 401 },
      );
    }

    const { userInfo } = authResult;

    // Return actual user data from the JWT token
    const userData = {
      id: userInfo.id,
      email: userInfo.email,
      name: userInfo.name || userInfo.email,
      picture: userInfo.picture,
      createdAt: new Date().toISOString(),
    };

    return NextResponse.json({
      message: 'Protected user data',
      user: userData,
    });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Validate authentication
    const authResult = await validateAuthToken(request);
    if (!authResult) {
      return NextResponse.json(
        { error: 'Missing or invalid authorization header' },
        { status: 401 },
      );
    }

    const { userInfo } = authResult;
    const body = await request.json();

    // Process user data update
    // In a real implementation, you would update the user in your database
    // You can use userInfo.id to ensure the user can only update their own data

    return NextResponse.json({
      message: 'User data updated successfully',
      updatedData: body,
      userId: userInfo.id,
    });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
