import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-client';

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
  private client: jwksClient.JwksClient;
  private userPoolId: string;
  private clientId: string;

  constructor() {
    this.userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || '';
    this.clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || '';

    if (!this.userPoolId) {
      throw new Error('NEXT_PUBLIC_COGNITO_USER_POOL_ID is not configured');
    }

    // Initialize JWKS client for Cognito
    const region = process.env.NEXT_PUBLIC_COGNITO_REGION || 'us-east-1';
    const jwksUri = `https://cognito-idp.${region}.amazonaws.com/${this.userPoolId}/.well-known/jwks.json`;

    this.client = jwksClient({
      jwksUri,
      cache: true,
      cacheMaxEntries: 5,
      cacheMaxAge: 600000, // 10 minutes
    });
  }

  private getKey(header: any, callback: any) {
    this.client.getSigningKey(header.kid, (err, key) => {
      if (err) {
        callback(err);
        return;
      }

      const signingKey = key?.getPublicKey();
      callback(null, signingKey);
    });
  }

  async validateToken(token: string): Promise<JWTPayload | null> {
    try {
      console.log('🔍 Validating JWT token...');
      console.log('Token length:', token.length);
      console.log('User Pool ID:', this.userPoolId);
      console.log('Client ID:', this.clientId);

      return new Promise((resolve, reject) => {
        jwt.verify(
          token,
          (header: any, callback: any) => this.getKey(header, callback),
          {
            algorithms: ['RS256'],
            issuer: `https://cognito-idp.${
              process.env.NEXT_PUBLIC_COGNITO_REGION || 'us-east-1'
            }.amazonaws.com/${this.userPoolId}`,
            audience: this.clientId,
          },
          (err, decoded) => {
            if (err) {
              console.error('❌ JWT validation error:', err.message);
              console.error('Error name:', err.name);
              resolve(null);
              return;
            }

            const payload = decoded as JWTPayload;
            console.log('✅ JWT token validated successfully');
            console.log('Token payload keys:', Object.keys(payload));

            // Additional validation
            if (payload.token_use !== 'access') {
              console.error('❌ Invalid token use:', payload.token_use);
              resolve(null);
              return;
            }

            // Check if token is expired
            const now = Math.floor(Date.now() / 1000);
            if (payload.exp < now) {
              console.error('❌ Token expired. Exp:', payload.exp, 'Now:', now);
              resolve(null);
              return;
            }

            console.log('✅ Token is valid and not expired');
            resolve(payload);
          },
        );
      });
    } catch (error) {
      console.error('❌ JWT validation failed:', error);
      return null;
    }
  }

  async extractUserInfo(token: string): Promise<{
    id: string;
    email: string;
    name?: string;
    picture?: string;
  } | null> {
    const payload = await this.validateToken(token);

    if (!payload) {
      return null;
    }

    return {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
    };
  }
}

// Create a singleton instance
let jwtValidator: JWTValidator | null = null;

export function getJWTValidator(): JWTValidator {
  if (!jwtValidator) {
    jwtValidator = new JWTValidator();
  }
  return jwtValidator;
}

export type { JWTPayload };
