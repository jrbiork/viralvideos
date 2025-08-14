import { jwtVerify, createRemoteJWKSet } from 'jose';

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
  [key: string]: any;
}

interface AuthorizerResponse {
  principalId: string;
  policyDocument: {
    Version: string;
    Statement: Array<{
      Action: string;
      Effect: string;
      Resource: string;
    }>;
  };
  context?: {
    [key: string]: string;
  };
}

class JWTAuthorizer {
  private userPoolId: string;
  private clientId: string;
  private region: string;
  private jwksUrl: string;

  constructor() {
    this.userPoolId = process.env.COGNITO_USER_POOL_ID || '';
    this.clientId = process.env.COGNITO_CLIENT_ID || '';
    this.region = process.env.COGNITO_REGION || 'us-east-1';

    if (!this.userPoolId) {
      throw new Error('COGNITO_USER_POOL_ID is not configured');
    }

    if (!this.clientId) {
      throw new Error('COGNITO_CLIENT_ID is not configured');
    }

    this.jwksUrl = `https://cognito-idp.${this.region}.amazonaws.com/${this.userPoolId}/.well-known/jwks.json`;
  }

  async validateToken(token: string): Promise<JWTPayload | null> {
    try {
      console.log('🔍 Validating JWT token in authorizer...');
      console.log('Token length:', token.length);
      console.log('User Pool ID:', this.userPoolId);
      console.log('Client ID:', this.clientId);
      console.log('JWKS URL:', this.jwksUrl);

      // Create JWKS client
      const JWKS = createRemoteJWKSet(new URL(this.jwksUrl));

      // Verify the JWT token
      const { payload } = await jwtVerify(token, JWKS, {
        issuer: `https://cognito-idp.${this.region}.amazonaws.com/${this.userPoolId}`,
        algorithms: ['RS256'],
      });

      console.log('✅ JWT token validated successfully');
      console.log('Token payload keys:', Object.keys(payload));

      const jwtPayload = payload as JWTPayload;

      // Manual audience validation - check client_id instead of aud
      const tokenClientId = jwtPayload.client_id || jwtPayload.aud;
      if (tokenClientId !== this.clientId) {
        console.error(
          '❌ Invalid audience. Expected:',
          this.clientId,
          'Got:',
          tokenClientId,
        );
        return null;
      }

      // Additional validation
      if (jwtPayload.token_use !== 'access') {
        console.error('❌ Invalid token use:', jwtPayload.token_use);
        return null;
      }

      // Check if token is expired
      const now = Math.floor(Date.now() / 1000);
      if (jwtPayload.exp < now) {
        console.error('❌ Token expired. Exp:', jwtPayload.exp, 'Now:', now);
        return null;
      }

      console.log('✅ Token is valid and not expired');
      return jwtPayload;
    } catch (error) {
      console.error('❌ JWT validation failed:', error);
      return null;
    }
  }

  generatePolicy(
    principalId: string,
    effect: string,
    resource: string,
    context?: any,
  ): AuthorizerResponse {
    const policy: AuthorizerResponse = {
      principalId,
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Action: 'execute-api:Invoke',
            Effect: effect,
            Resource: resource,
          },
        ],
      },
    };

    if (context) {
      policy.context = context;
    }

    return policy;
  }
}

// Create a singleton instance
let jwtAuthorizer: JWTAuthorizer | null = null;

function getJWTAuthorizer(): JWTAuthorizer {
  if (!jwtAuthorizer) {
    jwtAuthorizer = new JWTAuthorizer();
  }
  return jwtAuthorizer;
}

export const handler = async (event: any): Promise<AuthorizerResponse> => {
  console.log('🚀 JWT Authorizer Lambda started');
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    // Extract the token from the Authorization header
    const authHeader = event.authorizationToken;

    if (!authHeader) {
      console.log('❌ No authorization token provided');
      throw new Error('Unauthorized: No authorization token provided');
    }

    // Remove 'Bearer ' prefix if present
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.substring(7)
      : authHeader;

    if (!token || token.length < 10) {
      console.log('❌ Token too short or empty');
      throw new Error('Unauthorized: Invalid token format');
    }

    // Validate the JWT token
    const authorizer = getJWTAuthorizer();
    const payload = await authorizer.validateToken(token);

    if (!payload) {
      console.log('❌ Token validation failed');
      throw new Error('Unauthorized: Token validation failed');
    }

    console.log('✅ Token validated successfully for user:', payload.sub);

    // Generate the policy document
    const policy = authorizer.generatePolicy(
      payload.sub,
      'Allow',
      event.methodArn,
      {
        userId: payload.sub,
        email: payload.email,
        name: payload.name || '',
        picture: payload.picture || '',
      },
    );

    console.log('✅ Policy generated:', JSON.stringify(policy, null, 2));
    return policy;
  } catch (error) {
    console.error('❌ Authorization failed:', error);

    // Return a deny policy
    const authorizer = getJWTAuthorizer();
    return authorizer.generatePolicy('unauthorized', 'Deny', event.methodArn);
  }
};
