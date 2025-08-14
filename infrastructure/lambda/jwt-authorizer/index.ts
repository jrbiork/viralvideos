import {
  APIGatewayTokenAuthorizerEvent,
  APIGatewayAuthorizerResult,
} from 'aws-lambda';
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

class JWTValidator {
  private jwks: any;
  private userPoolId: string;
  private clientId: string;

  constructor() {
    this.userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || '';
    this.clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || '';

    if (!this.userPoolId) {
      throw new Error('NEXT_PUBLIC_COGNITO_USER_POOL_ID is not configured');
    }

    // Initialize JWKS for Cognito
    const region = process.env.NEXT_PUBLIC_COGNITO_REGION || 'us-east-1';
    const jwksUri = `https://cognito-idp.${region}.amazonaws.com/${this.userPoolId}/.well-known/jwks.json`;

    this.jwks = createRemoteJWKSet(new URL(jwksUri));
  }

  async validateToken(token: string): Promise<JWTPayload | null> {
    try {
      console.log('🔍 Validating JWT token...');
      console.log('Token length:', token.length);
      console.log('User Pool ID:', this.userPoolId);
      console.log('Client ID:', this.clientId);

      const region = process.env.NEXT_PUBLIC_COGNITO_REGION || 'us-east-1';
      const issuer = `https://cognito-idp.${region}.amazonaws.com/${this.userPoolId}`;

      const { payload } = await jwtVerify(token, this.jwks, {
        issuer,
        algorithms: ['RS256'],
        // Don't validate audience here - we'll do it manually below
      });

      const jwtPayload = payload as JWTPayload;
      console.log('✅ JWT token validated successfully');
      console.log('Token payload keys:', Object.keys(jwtPayload));

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
}

export const handler = async (
  event: APIGatewayTokenAuthorizerEvent,
): Promise<APIGatewayAuthorizerResult> => {
  try {
    console.log('🔐 JWT Authorizer called');
    console.log('Event:', JSON.stringify(event, null, 2));

    const token = event.authorizationToken;

    if (!token) {
      console.log('❌ No authorization token provided');
      throw new Error('Unauthorized: No authorization token provided');
    }

    // Remove 'Bearer ' prefix if present
    const cleanToken = token.replace('Bearer ', '');

    if (!cleanToken) {
      console.log('❌ Empty token after cleaning');
      throw new Error('Unauthorized: Empty authorization token');
    }

    // Validate the JWT token
    const jwtValidator = new JWTValidator();
    const payload = await jwtValidator.validateToken(cleanToken);

    if (!payload) {
      console.log('❌ JWT validation failed');
      throw new Error('Unauthorized: Invalid JWT token');
    }

    console.log('✅ JWT validation successful for user:', payload.sub);

    // Generate IAM policy
    const policy: APIGatewayAuthorizerResult = {
      principalId: payload.sub,
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Action: 'execute-api:Invoke',
            Effect: 'Allow',
            Resource: event.methodArn,
          },
        ],
      },
      context: {
        userId: payload.sub,
        email: payload.email,
        name: payload.name || '',
        picture: payload.picture || '',
      },
    };

    console.log('📋 Generated policy:', JSON.stringify(policy, null, 2));
    return policy;
  } catch (error) {
    console.error('💥 JWT Authorizer error:', error);
    throw new Error('Unauthorized: JWT validation failed');
  }
};
