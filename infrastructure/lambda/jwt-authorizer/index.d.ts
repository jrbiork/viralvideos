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
export declare const handler: (event: any) => Promise<AuthorizerResponse>;
export {};
