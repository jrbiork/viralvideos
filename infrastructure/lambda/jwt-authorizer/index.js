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
            const region = process.env.NEXT_PUBLIC_COGNITO_REGION || 'us-east-1';
            const issuer = `https://cognito-idp.${region}.amazonaws.com/${this.userPoolId}`;
            const { payload } = await (0, jose_1.jwtVerify)(token, this.jwks, {
                issuer,
                algorithms: ['RS256'],
                clockTolerance: 30,
            });
            const jwtPayload = payload;
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
        const jwtValidator = new JWTValidator();
        const payload = await jwtValidator.validateToken(cleanToken);
        if (!payload) {
            throw new Error('Unauthorized: Invalid JWT token');
        }
        const arnParts = event.methodArn.split('/');
        const apiGatewayArn = arnParts[0];
        const stage = arnParts[1];
        const resource = arnParts[2];
        const method = arnParts[3];
        const specificResource = `${apiGatewayArn}/${stage}/${resource}/${method}`;
        const wildcardResource = `${apiGatewayArn}/${stage}/*`;
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
        return policy;
    }
    catch (error) {
        console.error('💥 JWT Authorizer error:', error);
        throw new Error('Unauthorized: JWT validation failed');
    }
};
exports.handler = handler;
