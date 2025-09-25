import { NextRequest, NextResponse } from 'next/server';
import { decodeJwt } from 'jose';

const API_GATEWAY_URL = process.env.API_GATEWAY_URL;

// In-memory cache for user data (30 seconds TTL)
const userCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 30 * 1000; // 30 seconds in milliseconds

// Cache helper functions
function getCacheKey(userId: string, username: string): string {
  return `${userId}:${username}`;
}

function getFromCache(cacheKey: string): any | null {
  const cached = userCache.get(cacheKey);
  if (!cached) return null;

  const now = Date.now();
  if (now - cached.timestamp > CACHE_TTL) {
    userCache.delete(cacheKey);
    return null;
  }

  return cached.data;
}

function setCache(cacheKey: string, data: any): void {
  userCache.set(cacheKey, {
    data,
    timestamp: Date.now(),
  });
}

// Clear expired entries periodically (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of userCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      userCache.delete(key);
    }
  }
}, 5 * 60 * 1000);

async function verifyAndExtractUserFromJWT(token: string): Promise<any | null> {
  try {
    const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;

    if (!clientId) {
      console.error('Cognito client ID missing');
      return null;
    }

    // Decode the JWT token without verification to extract user info
    const payload = decodeJwt(token);

    // JWT payload extracted successfully

    // Basic validation checks without API calls
    if (!payload.sub) {
      console.error('Missing sub claim');
      return null;
    }

    // Manual audience validation for Cognito tokens
    const hasValidAudience =
      (payload.aud && payload.aud === clientId) ||
      (payload.client_id && payload.client_id === clientId);

    if (!hasValidAudience) {
      console.error('Invalid audience');
      return null;
    }

    // Additional validation
    if (payload.token_use !== 'access') {
      console.error('Invalid token use:', payload.token_use);
      return null;
    }

    // Check if token is expired (with clock skew tolerance)
    const now = Math.floor(Date.now() / 1000);
    const clockSkew = 30; // 30 seconds tolerance
    if (payload.exp && payload.exp < now - clockSkew) {
      console.error('Token expired');
      return null;
    }

    // Extract basic user info from token payload
    // Note: Access tokens typically don't include email, so we use username as identifier
    return {
      sub: payload.sub,
      username: payload.username,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
    };
  } catch (error) {
    console.error('JWT verification failed:', error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get the Cognito token from Authorization header first, then fallback to cookies
    const authHeader = request.headers.get('authorization');

    let token = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7); // Remove 'Bearer ' prefix
    } else {
      // Fallback to cookies
      const cookieStore = request.cookies;
      const cognitoToken = cookieStore.get('viral-videos-cognito-token');
      if (cognitoToken) {
        token = cognitoToken.value;
      }
    }

    if (!token) {
      console.error('No authorization token found');
      return NextResponse.json(
        { error: 'No authentication token found' },
        { status: 401 },
      );
    }

    if (!API_GATEWAY_URL) {
      console.error('API_GATEWAY_URL environment variable is not set');
      return NextResponse.json(
        { error: 'API Gateway URL not configured' },
        { status: 500 },
      );
    }

    // Verify and extract user info from JWT token
    const userData = await verifyAndExtractUserFromJWT(token);
    if (!userData) {
      console.error('Failed to verify JWT token');
      return NextResponse.json(
        { error: 'Invalid authentication token' },
        { status: 401 },
      );
    }

    // Get the request body
    const requestBody: {
      userId: string;
      email: string;
      name: string;
      username: string;
      picture?: string;
    } = await request.json();

    // Forward the request to API Gateway

    try {
      const apiGatewayResponse = await fetch(`${API_GATEWAY_URL}user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
      });

      const responseData = await apiGatewayResponse.json();

      if (!apiGatewayResponse.ok) {
        console.error('API Gateway error:', responseData);
        return NextResponse.json(
          { error: responseData.error || 'API Gateway request failed' },
          { status: apiGatewayResponse.status },
        );
      }

      return NextResponse.json(responseData);
    } catch (fetchError: any) {
      console.error('Fetch error details:', {
        message: fetchError?.message || 'Unknown error',
        cause: fetchError?.cause,
        url: `${API_GATEWAY_URL}user`,
      });

      // Return a more specific error message
      return NextResponse.json(
        {
          error:
            'Unable to connect to API Gateway. Please ensure the infrastructure is deployed.',
          details: fetchError?.message || 'Unknown error',
        },
        { status: 503 },
      );
    }
  } catch (error) {
    console.error('User gateway error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get the Cognito token from Authorization header first, then fallback to cookies
    const authHeader = request.headers.get('authorization');
    let token = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7); // Remove 'Bearer ' prefix
    } else {
      // Fallback to cookies
      const cookieStore = request.cookies;
      const cognitoToken = cookieStore.get('viral-videos-cognito-token');
      if (cognitoToken) {
        token = cognitoToken.value;
      }
    }

    if (!token) {
      return NextResponse.json(
        { error: 'No authentication token found' },
        { status: 401 },
      );
    }

    if (!API_GATEWAY_URL) {
      console.error('API_GATEWAY_URL environment variable is not set');
      return NextResponse.json(
        { error: 'API Gateway URL not configured' },
        { status: 500 },
      );
    }

    // Verify and extract user info from JWT token
    const userData = await verifyAndExtractUserFromJWT(token);
    if (!userData) {
      console.error('Failed to verify JWT token');
      return NextResponse.json(
        { error: 'Invalid authentication token' },
        { status: 401 },
      );
    }

    // Check cache first
    const cacheKey = getCacheKey(userData.sub, userData.username);
    const cachedData = getFromCache(cacheKey);

    if (cachedData) {
      console.log('Returning cached user data for:', userData.sub);
      return NextResponse.json(cachedData);
    }

    // Create query parameters from verified JWT token
    const queryParams = new URLSearchParams({
      userId: userData.sub,
      username: userData.username,
    });

    console.log('Sending user data to API Gateway for GET:', {
      userId: userData.sub,
      username: userData.username,
    });

    // Forward the request to API Gateway with query parameters
    console.log(
      'Attempting to call API Gateway:',
      `${API_GATEWAY_URL}user?${queryParams.toString()}`,
    );

    try {
      const apiGatewayResponse = await fetch(
        `${API_GATEWAY_URL}user?${queryParams.toString()}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const responseData = await apiGatewayResponse.json();

      if (!apiGatewayResponse.ok) {
        console.error('API Gateway error:', responseData);
        return NextResponse.json(
          { error: responseData.error || 'API Gateway request failed' },
          { status: apiGatewayResponse.status },
        );
      }

      // Cache the successful response
      setCache(cacheKey, responseData);
      console.log('Cached user data for:', userData.sub);

      return NextResponse.json(responseData);
    } catch (fetchError: any) {
      console.error('Fetch error details:', {
        message: fetchError?.message || 'Unknown error',
        cause: fetchError?.cause,
        url: `${API_GATEWAY_URL}user?${queryParams.toString()}`,
      });

      // Return a more specific error message
      return NextResponse.json(
        {
          error:
            'Unable to connect to API Gateway. Please ensure the infrastructure is deployed.',
          details: fetchError?.message || 'Unknown error',
        },
        { status: 503 },
      );
    }
  } catch (error) {
    console.error('User gateway error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
