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
      const region = process.env.NEXT_PUBLIC_COGNITO_REGION || 'us-east-1';
      const issuer = `https://cognito-idp.${region}.amazonaws.com/${this.userPoolId}`;

      const { payload } = await jwtVerify(token, this.jwks, {
        issuer,
        algorithms: ['RS256'],
        // Add clock skew tolerance to handle slight time differences
        clockTolerance: 30, // 30 seconds tolerance
        // Don't validate audience here - we'll do it manually below
      });

      const jwtPayload = payload as JWTPayload;

      // Manual audience validation for Cognito tokens
      const hasValidAudience =
        (jwtPayload.aud && jwtPayload.aud === this.clientId) ||
        (jwtPayload.client_id && jwtPayload.client_id === this.clientId);

      if (!hasValidAudience) {
        console.error('❌ Invalid audience. Expected:', this.clientId);
        console.error('❌ Token aud:', jwtPayload.aud);
        console.error('❌ Token client_id:', jwtPayload.client_id);
        return null;
      }

      // Additional validation
      if (jwtPayload.token_use !== 'access') {
        console.error('❌ Invalid token use:', jwtPayload.token_use);
        return null;
      }

      // Check if token is expired (with clock skew tolerance)
      const now = Math.floor(Date.now() / 1000);
      const clockSkew = 30; // 30 seconds tolerance
      if (jwtPayload.exp < now - clockSkew) {
        console.error(
          '❌ Token expired. Exp:',
          jwtPayload.exp,
          'Now:',
          now,
          'Tolerance:',
          clockSkew,
        );
        return null;
      }

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
    const token = event.authorizationToken;

    if (!token) {
      console.log('❌ No authorization token provided');
      throw new Error('Unauthorized: No authorization token provided');
    }

    // Remove 'Bearer ' prefix if present
    const cleanToken = token.replace(/^Bearer\s+/i, '').trim();

    if (!cleanToken) {
      console.log('❌ Empty token after cleaning');
      throw new Error('Unauthorized: Empty authorization token');
    }

    // Validate the JWT token
    const jwtValidator = new JWTValidator();
    const payload = await jwtValidator.validateToken(cleanToken);

    if (!payload) {
      throw new Error('Unauthorized: Invalid JWT token');
    }

    // Parse the method ARN to get the correct resource pattern
    const arnParts = event.methodArn.split('/');
    const apiGatewayArn = arnParts[0];
    const stage = arnParts[1];
    const resource = arnParts[2];
    const method = arnParts[3];

    // Create specific resource ARN for this exact endpoint
    const specificResource = `${apiGatewayArn}/${stage}/${resource}/${method}`;
    // Also create wildcard resource for broader access
    const wildcardResource = `${apiGatewayArn}/${stage}/*`;

    // Generate IAM policy with both specific and wildcard resources
    const policy: APIGatewayAuthorizerResult = {
      principalId: payload.sub,
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Action: 'execute-api:Invoke',
            Effect: 'Allow',
            Resource: [specificResource, wildcardResource],
          },
        ],
      },
      context: {
        userId: payload.sub,
        email: payload.email,
        name: payload.name || '',
        picture: payload.picture || '',
        // Add timestamp to prevent caching issues
        timestamp: Date.now().toString(),
      },
    };

    return policy;
  } catch (error) {
    console.error('💥 JWT Authorizer error:', error);
    throw new Error('Unauthorized: JWT validation failed');
  }
};
