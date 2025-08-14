"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const jose_1 = require("jose");
class JWTAuthorizer {
    userPoolId;
    clientId;
    region;
    jwksUrl;
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
    async validateToken(token) {
        try {
            console.log('🔍 Validating JWT token in authorizer...');
            console.log('Token length:', token.length);
            console.log('User Pool ID:', this.userPoolId);
            console.log('Client ID:', this.clientId);
            console.log('JWKS URL:', this.jwksUrl);
            const JWKS = (0, jose_1.createRemoteJWKSet)(new URL(this.jwksUrl));
            const { payload } = await (0, jose_1.jwtVerify)(token, JWKS, {
                issuer: `https://cognito-idp.${this.region}.amazonaws.com/${this.userPoolId}`,
                algorithms: ['RS256'],
            });
            console.log('✅ JWT token validated successfully');
            console.log('Token payload keys:', Object.keys(payload));
            const jwtPayload = payload;
            const tokenClientId = jwtPayload.client_id || jwtPayload.aud;
            if (tokenClientId !== this.clientId) {
                console.error('❌ Invalid audience. Expected:', this.clientId, 'Got:', tokenClientId);
                return null;
            }
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
    generatePolicy(principalId, effect, resource, context) {
        const policy = {
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
let jwtAuthorizer = null;
function getJWTAuthorizer() {
    if (!jwtAuthorizer) {
        jwtAuthorizer = new JWTAuthorizer();
    }
    return jwtAuthorizer;
}
const handler = async (event) => {
    console.log('🚀 JWT Authorizer Lambda started');
    console.log('Event:', JSON.stringify(event, null, 2));
    try {
        const authHeader = event.authorizationToken;
        if (!authHeader) {
            console.log('❌ No authorization token provided');
            throw new Error('Unauthorized: No authorization token provided');
        }
        const token = authHeader.startsWith('Bearer ')
            ? authHeader.substring(7)
            : authHeader;
        if (!token || token.length < 10) {
            console.log('❌ Token too short or empty');
            throw new Error('Unauthorized: Invalid token format');
        }
        const authorizer = getJWTAuthorizer();
        const payload = await authorizer.validateToken(token);
        if (!payload) {
            console.log('❌ Token validation failed');
            throw new Error('Unauthorized: Token validation failed');
        }
        console.log('✅ Token validated successfully for user:', payload.sub);
        const policy = authorizer.generatePolicy(payload.sub, 'Allow', event.methodArn, {
            userId: payload.sub,
            email: payload.email,
            name: payload.name || '',
            picture: payload.picture || '',
        });
        console.log('✅ Policy generated:', JSON.stringify(policy, null, 2));
        return policy;
    }
    catch (error) {
        console.error('❌ Authorization failed:', error);
        const authorizer = getJWTAuthorizer();
        return authorizer.generatePolicy('unauthorized', 'Deny', event.methodArn);
    }
};
exports.handler = handler;
