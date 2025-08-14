"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const jose_1 = require("jose");
class JWTValidator {
    jwks;
    userPoolId;
    clientId;
    constructor() {
        this.userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || '';
        this.clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || '';
        if (!this.userPoolId) {
            throw new Error('NEXT_PUBLIC_COGNITO_USER_POOL_ID is not configured');
        }
        const region = process.env.NEXT_PUBLIC_COGNITO_REGION || 'us-east-1';
        const jwksUri = `https://cognito-idp.${region}.amazonaws.com/${this.userPoolId}/.well-known/jwks.json`;
        this.jwks = (0, jose_1.createRemoteJWKSet)(new URL(jwksUri));
    }
    async validateToken(token) {
        try {
            console.log('🔍 Validating JWT token...');
            console.log('Token length:', token.length);
            console.log('User Pool ID:', this.userPoolId);
            console.log('Client ID:', this.clientId);
            const region = process.env.NEXT_PUBLIC_COGNITO_REGION || 'us-east-1';
            const issuer = `https://cognito-idp.${region}.amazonaws.com/${this.userPoolId}`;
            const { payload } = await (0, jose_1.jwtVerify)(token, this.jwks, {
                issuer,
                algorithms: ['RS256'],
            });
            const jwtPayload = payload;
            console.log('✅ JWT token validated successfully');
            console.log('Token payload keys:', Object.keys(jwtPayload));
            if (jwtPayload.token_use !== 'access') {
                console.error('❌ Invalid token use:', jwtPayload.token_use);
                return null;
            }
            const now = Math.floor(Date.now() / 1000);
            if (jwtPayload.exp < now) {
                console.error('❌ Token expired. Exp:', jwtPayload.exp, 'Now:', now);
                return null;
            }
            console.log('✅ Token is valid and not expired');
            return jwtPayload;
        }
        catch (error) {
            console.error('❌ JWT validation failed:', error);
            return null;
        }
    }
}
const handler = async (event) => {
    try {
        console.log('🔐 JWT Authorizer called');
        console.log('Event:', JSON.stringify(event, null, 2));
        const token = event.authorizationToken;
        if (!token) {
            console.log('❌ No authorization token provided');
            throw new Error('Unauthorized: No authorization token provided');
        }
        const cleanToken = token.replace('Bearer ', '');
        if (!cleanToken) {
            console.log('❌ Empty token after cleaning');
            throw new Error('Unauthorized: Empty authorization token');
        }
        const jwtValidator = new JWTValidator();
        const payload = await jwtValidator.validateToken(cleanToken);
        if (!payload) {
            console.log('❌ JWT validation failed');
            throw new Error('Unauthorized: Invalid JWT token');
        }
        console.log('✅ JWT validation successful for user:', payload.sub);
        const policy = {
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
    }
    catch (error) {
        console.error('💥 JWT Authorizer error:', error);
        throw new Error('Unauthorized: JWT validation failed');
    }
};
exports.handler = handler;
