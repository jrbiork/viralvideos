# API Gateway Migration Guide

This document explains the migration from direct Lambda invocation to using API Gateway for the video generation endpoint.

## Changes Made

### 1. Infrastructure Updates (`infrastructure/lib/viral-videos-stack.ts`)

- Added API Gateway import: `import * as apigateway from 'aws-cdk-lib/aws-apigateway';`
- Created a REST API with CORS support
- Added Lambda integration for the queue manager
- Created `/generate-video` endpoint with POST method
- Added API Gateway URL outputs

### 2. Next.js API Route Updates (`app/api/generate-video/route.ts`)

- Removed Lambda client imports (`@aws-sdk/client-lambda`)
- Replaced direct Lambda invocation with HTTP requests to API Gateway
- Updated environment variable from `QUEUE_MANAGER_LAMBDA_ARN` to `API_GATEWAY_URL`
- Added proper HTTP error handling

### 3. Environment Configuration

- Updated `env.example` to use `API_GATEWAY_URL` instead of `QUEUE_MANAGER_LAMBDA_ARN`

## Benefits of Using API Gateway

1. **Better Error Handling**: HTTP status codes and error messages
2. **CORS Support**: Built-in CORS configuration for web applications
3. **Request/Response Transformation**: Can transform requests and responses
4. **Monitoring**: CloudWatch integration for API monitoring
5. **Rate Limiting**: Built-in throttling capabilities
6. **Authentication**: Easy to add API keys, JWT tokens, or other auth methods

## Authentication

The API Gateway endpoint now uses session-based authentication:

1. **Next.js API Route**: Verifies session and forwards user information to API Gateway
2. **API Gateway**: Public endpoint (no authorization required)
3. **Queue Manager Lambda**: Receives user information from the request body
4. **Session Management**: Handled by Next.js with secure HTTP-only cookies

This provides a fast, secure authentication mechanism without external API calls.

### Session-Based Authentication Features:

- Fast local session verification (no Cognito API calls)
- Secure HTTP-only cookies
- 24-hour session duration
- Automatic session expiration handling

## Deployment Steps

1. **Deploy the updated infrastructure**:

   ```bash
   cd infrastructure
   ./deploy.sh
   ```

2. **Update your environment variables**:

   - The deployment script will automatically update your `.env` file
   - Or manually add: `API_GATEWAY_URL=https://your-api-id.execute-api.region.amazonaws.com/prod/`

3. **Restart your Next.js development server**:
   ```bash
   npm run dev
   ```

## API Endpoint

The API Gateway endpoint will be:

```
https://{api-id}.execute-api.{region}.amazonaws.com/prod/generate-video
```

## Testing

You can test the endpoint directly:

```bash
curl -X POST https://your-api-id.execute-api.region.amazonaws.com/prod/generate-video \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A beautiful sunset over the ocean",
    "totalDuration": 30,
    "sceneCount": 3,
    "userId": "test-user",
    "userEmail": "test@example.com",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }'
```

**Note**: The API Gateway endpoint is now public and expects user information in the request body:

- `userId`: User ID from the session
- `userEmail`: User email from the session

## Troubleshooting

### Common Issues

1. **CORS Errors**: The API Gateway is configured with CORS, but you may need to adjust the allowed origins
2. **Authentication**: Currently set to `AuthorizationType.NONE` - add authentication as needed
3. **Environment Variables**: Ensure `API_GATEWAY_URL` is set correctly in your `.env` file

### Debugging

- Check CloudWatch logs for the queue manager Lambda
- Monitor API Gateway metrics in the AWS Console
- Verify the API Gateway URL is correct and accessible

## Future Enhancements

1. **Add Authentication**: Implement API keys or JWT token validation
2. **Rate Limiting**: Add usage plans and throttling
3. **Request Validation**: Add request schema validation
4. **Monitoring**: Set up CloudWatch alarms for API errors
