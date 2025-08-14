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
                clockTolerance: 30,
            });
            const jwtPayload = payload;
            console.log('✅ JWT token validated successfully');
            console.log('Token payload keys:', Object.keys(jwtPayload));
            const hasValidAudience = (jwtPayload.aud && jwtPayload.aud === this.clientId) ||
                (jwtPayload.client_id && jwtPayload.client_id === this.clientId);
            if (!hasValidAudience) {
                console.error('❌ Invalid audience. Expected:', this.clientId);
                console.error('❌ Token aud:', jwtPayload.aud);
                console.error('❌ Token client_id:', jwtPayload.client_id);
                return null;
            }
            if (jwtPayload.token_use !== 'access') {
                console.error('❌ Invalid token use:', jwtPayload.token_use);
                return null;
            }
            const now = Math.floor(Date.now() / 1000);
            const clockSkew = 30;
            if (jwtPayload.exp < now - clockSkew) {
                console.error('❌ Token expired. Exp:', jwtPayload.exp, 'Now:', now, 'Tolerance:', clockSkew);
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
    console.log('🔐 JWT Authorizer called - START');
    console.log('Event type:', typeof event);
    console.log('Event keys:', Object.keys(event || {}));
    console.log('Method ARN:', event.methodArn);
    try {
        console.log('🔐 JWT Authorizer called');
        console.log('Event summary:', {
            methodArn: event.methodArn,
            type: typeof event,
            hasAuthToken: !!event.authorizationToken,
            tokenLength: (event.authorizationToken || '').length,
        });
        const token = event.authorizationToken;
        if (!token) {
            console.log('❌ No authorization token provided');
            throw new Error('Unauthorized: No authorization token provided');
        }
        const cleanToken = token.replace(/^Bearer\s+/i, '').trim();
        if (!cleanToken) {
            console.log('❌ Empty token after cleaning');
            throw new Error('Unauthorized: Empty authorization token');
        }
        console.log('🔧 Creating JWT validator...');
        const jwtValidator = new JWTValidator();
        console.log('🔧 JWT validator created successfully');
        console.log('🔧 Validating token...');
        const payload = await jwtValidator.validateToken(cleanToken);
        if (!payload) {
            console.log('❌ JWT validation failed');
            throw new Error('Unauthorized: Invalid JWT token');
        }
        console.log('✅ JWT validation successful for user:', payload.sub);
        const arnParts = event.methodArn.split('/');
        const apiGatewayArn = arnParts[0];
        const stage = arnParts[1];
        const resource = arnParts[2];
        const method = arnParts[3];
        const specificResource = `${apiGatewayArn}/${stage}/${resource}/${method}`;
        const wildcardResource = `${apiGatewayArn}/${stage}/*`;
        console.log('Specific resource:', specificResource);
        console.log('Wildcard resource:', wildcardResource);
        const policy = {
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
                timestamp: Date.now().toString(),
            },
        };
        console.log('📋 Generated policy:', JSON.stringify(policy, null, 2));
        console.log('🔐 JWT Authorizer completed successfully');
        return policy;
    }
    catch (error) {
        console.error('💥 JWT Authorizer error:', error);
        throw new Error('Unauthorized: JWT validation failed');
    }
};
exports.handler = handler;
