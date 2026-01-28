# Viral Videos MVP

A web-based MVP that generates 60-second vertical videos for TikTok and Instagram Reels using AI-powered video generation, narration, and subtitles with real-time progress updates and subscription-based credits system.

## Features

- **AI Video Generation**: Uses Runway Gen-3 API to create cinematic video clips
- **AI Image Generation**: Google Gemini API for creating scene images (Nano Banana Pro)
- **AI Narration**: OpenAI TTS API for natural voice narration
- **Story Breakdown**: GPT-4 automatically breaks down prompts into scenes
- **Real-time Updates**: WebSocket connections for live generation progress
- **Vertical Format**: Optimized for 1080×1920 resolution (TikTok/Instagram)
- **User Authentication**: AWS Cognito for secure user management
- **Subscription Plans**: Stripe integration with credit-based system
- **Cloud Storage**: Secure video storage with pre-signed URLs
- **Modern UI**: Beautiful, responsive interface built with Next.js and Tailwind CSS

## System Architecture

The application follows a modern serverless architecture with multiple AWS services working together:

1. **User Flow**:
   - Users authenticate via AWS Cognito
   - JWT tokens authorize all API requests
   - WebSocket connections established for real-time updates

2. **Video Generation Pipeline**:
   - API request triggers video generation → SQS queue
   - Lambda processes queue message (up to 15 minutes)
   - FFmpeg layer combines video parts with subtitles
   - Progress updates broadcast via WebSocket
   - Final video stored in S3 with pre-signed URL

3. **Data Layer**:
   - DynamoDB stores user profiles, credits, and subscriptions
   - DynamoDB tracks active WebSocket connections
   - S3 stores video assets and final outputs

4. **Payment System**:
   - Stripe handles subscription checkout
   - Webhooks update user credits in DynamoDB
   - Customer portal for subscription management

## Technology Stack

### Frontend

- **Next.js 14**: React framework with App Router for server-side rendering and routing
- **React 18**: Component-based UI library
- **TypeScript**: Type-safe development across the entire codebase
- **Tailwind CSS**: Utility-first CSS framework for responsive design
- **Lucide React**: Modern icon library
- **WebSocket Client**: Real-time bidirectional communication for progress updates
- **AWS SDK**: Client-side integration with AWS services

### Backend & Infrastructure

#### AWS Services

- **AWS Lambda**: Serverless compute for video generation, user management, and WebSocket handlers
- **Amazon S3**: Dual-bucket architecture (final videos and video parts) with lifecycle policies
- **Amazon DynamoDB**: NoSQL database for users and WebSocket connections with GSI indices
- **Amazon SQS**: Message queue for asynchronous video generation with dead-letter queue
- **API Gateway REST API**: RESTful endpoints with CORS and JWT authorization
- **API Gateway WebSocket API**: Real-time bidirectional communication for progress updates
- **Amazon CloudWatch**: Centralized logging with automatic log retention policies
- **AWS IAM**: Fine-grained access control and role-based permissions
- **AWS Cognito**: User authentication, authorization, and user pool management
- **AWS CDK**: Infrastructure as Code using TypeScript for reproducible deployments

#### Video Processing

- **FFmpeg Lambda Layer**: Custom Lambda layer with FFmpeg binaries for video processing
- **Video Combining**: Multi-scene concatenation with subtitle overlays
- **Audio Processing**: TTS generation and audio synchronization

#### Authentication & Authorization

- **JWT (JSON Web Tokens)**: Token-based authentication with jose library
- **Custom JWT Authorizer**: Lambda authorizer for API Gateway
- **AWS Cognito**: User pools for registration, login, and session management

#### Payment Processing

- **Stripe**: Subscription management and payment processing
- **Stripe Webhooks**: Real-time event handling for subscription lifecycle
- **Credit System**: Usage-based credits tied to subscription tiers
- **Billing Portal**: Self-service subscription management

#### AI & Machine Learning APIs

- **Runway Gen-3 API**: State-of-the-art AI video generation
- **OpenAI API**:
  - GPT-4 for intelligent story breakdown and scene generation
  - TTS (Text-to-Speech) for natural voice narration
- **Google Gemini API**: AI-powered image generation for scenes

## Prerequisites

- Node.js 22+ and npm 10+
- AWS CLI configured with appropriate permissions
- AWS CDK CLI installed (`npm install -g aws-cdk`)
- Runway Gen-3 API key
- OpenAI API key
- Google Gemini API key
- Stripe account (for payment processing)
- AWS Cognito User Pool configured

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd viralvideos
npm install
```

### 2. Configure Environment Variables

Copy the example environment file and update with your values:

```bash
cp env.example .env.local
```

Update `.env.local` with your actual API keys and AWS configuration.

### 3. Deploy AWS Infrastructure

```bash
cd infrastructure
./deploy.sh
```

This will create:

- **S3 Buckets**: Two buckets (final videos and video parts) with lifecycle policies
- **DynamoDB Tables**: Users table and WebSocket connections table with GSI indices
- **Lambda Functions**:
  - Video generation with FFmpeg layer (15min timeout, 3GB memory)
  - Video queue manager
  - WebSocket handlers (connect, disconnect, message, broadcast)
  - User management (get, upsert)
  - Media processing (audio, image generation, animation)
  - JWT authorizer
  - Share resolver
- **SQS Queues**: Video generation queue with dead-letter queue
- **API Gateway**: REST API with JWT authorization and CORS
- **WebSocket API**: Real-time communication gateway
- **FFmpeg Lambda Layer**: Custom layer with FFmpeg binaries for video processing
- **IAM Roles and Policies**: Fine-grained permissions for all services
- **CloudWatch Log Groups**: Centralized logging with 1-week retention

### 4. Update Environment Variables

After deployment, update your `.env.local` with the actual ARNs from the CDK output:

```bash
cd ..
# Update .env.local with the actual values from CDK output
```

### 5. Run the Development Server

```bash
npm run dev
```

Visit `http://localhost:3000` to use the application.

## Usage

1. **Enter a Prompt**: Describe your video content in detail
2. **Generate Video**: Click "Generate Video" to start the process
3. **Wait for Processing**: The AI will create scenes, narration, and combine them
4. **Download Result**: Get your 60-second vertical video ready for social media

## API Endpoints

### POST /api/generate-video

Generates a video from a text prompt.

**Request Body:**

```json
{
  "prompt": "A beautiful sunset over the ocean with gentle waves"
}
```

**Response:**

```json
{
  "videoUrl": "https://s3.amazonaws.com/...",
  "videoKey": "videos/user-id/timestamp/final-video.mp4",
  "message": "Video generated successfully"
}
```

## Development

### Project Structure

```
viralvideos/
├── app/                              # Next.js app directory
│   ├── api/                          # API routes
│   │   ├── auth/                     # Authentication routes (signup, signin, session)
│   │   ├── stripe/                   # Stripe payment routes (checkout, webhook)
│   │   ├── generate-video/           # Video generation API
│   │   ├── websocket-token/          # WebSocket authentication
│   │   └── ...                       # Other API endpoints
│   ├── create/                       # Video creation page
│   ├── videos/                       # User videos page
│   ├── pricing/                      # Subscription pricing page
│   ├── settings/                     # User settings page
│   ├── globals.css                   # Global styles
│   ├── layout.tsx                    # Root layout with auth
│   └── page.tsx                      # Landing page
├── components/                       # React components
│   ├── AuthContext.tsx               # Authentication context provider
│   ├── WebSocketContext.tsx          # WebSocket connection management
│   ├── VideoGenerator.tsx            # Video generation form
│   ├── EditScene.tsx                 # Scene editing interface
│   └── ...                           # Other components
├── hooks/                            # Custom React hooks
│   ├── useWebSocket.ts               # WebSocket connection hook
│   ├── useUserCredits.ts             # User credits management
│   └── useToaster.tsx                # Toast notifications
├── lib/                              # Utility libraries
│   ├── auth-utils.ts                 # JWT and Cognito utilities
│   ├── session-utils.ts              # Session management
│   └── stripe-config.ts              # Stripe configuration
├── infrastructure/                   # AWS CDK infrastructure
│   ├── bin/                          # CDK app entry point
│   ├── lib/                          # CDK stack definitions
│   │   └── viral-videos-stack.ts     # Main stack with all AWS resources
│   ├── lambda/                       # Lambda function code
│   │   ├── video-generation/         # Main video generation handler
│   │   ├── video-queue/              # SQS queue manager
│   │   ├── websocket-connect/        # WebSocket connection handler
│   │   ├── websocket-disconnect/     # WebSocket disconnect handler
│   │   ├── websocket-message/        # WebSocket message handler
│   │   ├── websocket-broadcast/      # WebSocket broadcast handler
│   │   ├── jwt-authorizer/           # Custom JWT authorizer
│   │   ├── get-user/                 # User profile retrieval
│   │   ├── upsert-user/              # User profile management
│   │   ├── fetch-videos/             # Fetch user videos
│   │   ├── delete-video/             # Delete video handler
│   │   ├── generate-audio-subtitle/  # Audio and subtitle generation
│   │   ├── generate-image/           # Image generation handler
│   │   ├── animate-image/            # Image-to-video animation
│   │   ├── save-image/               # Image saving handler
│   │   └── utils/                    # Shared Lambda utilities
│   │       ├── user.ts               # User management utilities
│   │       ├── video.ts              # Video utilities
│   │       ├── videoCombiner.ts      # FFmpeg video combining
│   │       ├── audio.ts              # Audio processing
│   │       ├── videoEffects.ts       # Video effects and filters
│   │       ├── credits.ts            # Credit management
│   │       └── broadcastProgress.ts  # WebSocket progress updates
│   ├── layers/                       # Lambda layers
│   │   └── ffmpeg-layer/             # FFmpeg binaries and fonts
│   ├── dist/                         # Compiled Lambda functions
│   ├── deploy.sh                     # Main deployment script
│   ├── bundle-lambda.sh              # Lambda bundling script
│   └── package-lambda.sh             # Lambda packaging script
├── middleware.ts                     # Next.js middleware for auth
├── package.json                      # Frontend dependencies
└── tsconfig.json                     # TypeScript configuration
```

### Available Scripts

#### Frontend Scripts

- `npm run dev`: Start Next.js development server with AWS profile
- `npm run build`: Build Next.js application for production
- `npm run start`: Start Next.js production server
- `npm run lint`: Run ESLint for code quality

#### Infrastructure Scripts

- `cd infrastructure && ./deploy.sh`: Build and deploy all AWS infrastructure
- `cd infrastructure && ./bundle-lambda.sh`: Bundle specific Lambda function
- `cd infrastructure && ./package-lambda.sh`: Package Lambda for deployment
- `cd infrastructure && npm run destroy`: Destroy all AWS infrastructure (use with caution)

#### CDK Scripts

- `npm run cdk:deploy`: Direct CDK deployment (requires pre-built Lambdas)
- `npm run cdk:synth`: Generate CloudFormation template
- `npm run cdk:destroy`: Destroy CDK stack

## Environment Variables

### Core AWS Configuration

| Variable                | Description                      | Required |
| ----------------------- | -------------------------------- | -------- |
| `AWS_REGION`            | AWS region for deployment        | Yes      |
| `AWS_PROFILE`           | AWS CLI profile to use           | Yes      |
| `API_GATEWAY_URL`       | REST API Gateway URL             | Yes      |
| `WEBSOCKET_API_URL`     | WebSocket API Gateway URL        | Yes      |
| `WEBSOCKET_DOMAIN_NAME` | WebSocket domain for connections | Yes      |
| `WEBSOCKET_STAGE`       | WebSocket stage (prod)           | Yes      |

### AWS Services

| Variable                           | Description                          | Required |
| ---------------------------------- | ------------------------------------ | -------- |
| `VIDEO_BUCKET_NAME`                | S3 bucket for final videos           | Yes      |
| `VIDEO_PARTS_BUCKET_NAME`          | S3 bucket for video parts            | Yes      |
| `USERS_TABLE_NAME`                 | DynamoDB users table name            | Yes      |
| `WEBSOCKET_CONNECTIONS_TABLE_NAME` | DynamoDB WebSocket connections table | Yes      |
| `VIDEO_QUEUE_URL`                  | SQS queue URL for video generation   | Yes      |

### Authentication (AWS Cognito)

| Variable                           | Description                    | Required |
| ---------------------------------- | ------------------------------ | -------- |
| `NEXT_PUBLIC_COGNITO_USER_POOL_ID` | Cognito User Pool ID           | Yes      |
| `NEXT_PUBLIC_COGNITO_CLIENT_ID`    | Cognito App Client ID          | Yes      |
| `NEXT_PUBLIC_COGNITO_REGION`       | Cognito region                 | Yes      |
| `COGNITO_USER_POOL_ID`             | Cognito User Pool ID (backend) | Yes      |
| `COGNITO_CLIENT_ID`                | Cognito Client ID (backend)    | Yes      |

### AI API Keys

| Variable         | Description                                | Required |
| ---------------- | ------------------------------------------ | -------- |
| `RUNWAY_API_KEY` | Runway Gen-3 API key for video generation  | Yes      |
| `OPENAI_API_KEY` | OpenAI API key for GPT-4 and TTS           | Yes      |
| `GEMINI_API_KEY` | Google Gemini API key for image generation | Yes      |

### Payment Processing (Stripe)

| Variable                                 | Description                          | Required |
| ---------------------------------------- | ------------------------------------ | -------- |
| `STRIPE_SECRET_KEY`                      | Stripe secret key                    | Yes      |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`     | Stripe publishable key (client-side) | Yes      |
| `STRIPE_WEBHOOK_SECRET`                  | Stripe webhook signing secret        | Yes      |
| `NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID`    | Stripe price ID for Starter plan     | Yes      |
| `NEXT_PUBLIC_STRIPE_CREATOR_PRICE_ID`    | Stripe price ID for Creator plan     | Yes      |
| `NEXT_PUBLIC_STRIPE_INFLUENCER_PRICE_ID` | Stripe price ID for Influencer plan  | Yes      |
| `NEXT_PUBLIC_BASE_URL`                   | Base URL for Stripe redirects        | Yes      |

### JWT Configuration

| Variable     | Description                | Required |
| ------------ | -------------------------- | -------- |
| `JWT_SECRET` | Secret key for JWT signing | Yes      |

## Deployment

### Frontend Deployment

The Next.js app can be deployed to Vercel, Netlify, or any other hosting platform.

### Backend Deployment

The AWS infrastructure is deployed using CDK with a custom deployment script:

```bash
cd infrastructure
./deploy.sh
```

This script will:

1. Build all Lambda functions with TypeScript
2. Bundle Lambda layers (FFmpeg)
3. Deploy the CDK stack with all AWS resources
4. Output API Gateway URLs and resource ARNs

For individual lambda deployments, see the `bundle-lambda.sh` and `package-lambda.sh` scripts.

## Architecture Highlights

### Real-time WebSocket Communication

The application uses AWS API Gateway WebSocket API for real-time updates:

- **Connection Management**: Lambda handlers for connect/disconnect events
- **Authentication**: JWT-based WebSocket authentication via query parameters
- **Progress Broadcasting**: Real-time video generation progress updates
- **DynamoDB Integration**: Connection tracking with TTL for automatic cleanup
- **Bidirectional Communication**: Server-to-client push notifications

### Asynchronous Video Processing

Video generation uses a queue-based architecture:

- **SQS Queue**: Decouples API requests from long-running video generation
- **Lambda Triggers**: SQS event source triggers video generation Lambda
- **Dead Letter Queue**: Failed messages are routed to DLQ for analysis
- **Retry Logic**: Configurable retry attempts (max 3) before DLQ routing
- **15-Minute Processing**: Extended Lambda timeout for complex video operations

### FFmpeg Lambda Layer

Custom Lambda layer for video processing:

- **FFmpeg Binaries**: Static builds optimized for Lambda environment
- **Font Support**: Embedded fonts for subtitle rendering
- **Path Configuration**: Environment variables for binary and font paths
- **Memory Allocation**: 3GB memory for video processing operations

## Security Considerations

### Authentication & Authorization

- **AWS Cognito**: User registration, login, and session management
- **JWT Tokens**: Token-based API authentication using jose library
- **Custom Authorizer**: Lambda authorizer validates JWT tokens for API Gateway
- **WebSocket Auth**: JWT validation on WebSocket connection establishment
- **Token Refresh**: Automatic token refresh on expiration

### Data Protection

- **S3 Security**: All buckets have public access blocked by default
- **Pre-signed URLs**: Time-limited access to videos (10-hour expiration)
- **DynamoDB Encryption**: Encryption at rest for user and connection data
- **IAM Roles**: Least-privilege permissions for all Lambda functions
- **Environment Variables**: Sensitive keys stored as Lambda environment variables

### Payment Security

- **Stripe Integration**: PCI-compliant payment processing
- **Webhook Verification**: Cryptographic signature verification for all webhooks
- **Secure Redirects**: HTTPS-only redirect URLs for checkout sessions
- **Customer Portal**: Stripe-hosted billing management for security

### Network Security

- **CORS Configuration**: Restricted origins for API Gateway
- **API Authorization**: All endpoints require valid JWT except public share links
- **VPC Isolation**: Lambda functions can be placed in VPC if needed

## Cost Optimization

### Storage Optimization

- **S3 Lifecycle Policies**: Automatic deletion of old videos (30 days) and video parts (15 days)
- **Versioning Cleanup**: Noncurrent versions deleted after 15 days
- **DynamoDB TTL**: WebSocket connections auto-expire, reducing storage costs

### Compute Optimization

- **Lambda Timeout**: 15 minutes maximum for video generation (1 minute for others)
- **Memory Allocation**: Right-sized memory (128MB-3GB) based on function needs
- **Provisioned Concurrency**: Not used - pay only for actual invocations

### Database Optimization

- **DynamoDB On-Demand**: Pay-per-request billing mode, no idle capacity costs
- **GSI Design**: Minimal indices to reduce storage and query costs
- **Point-in-Time Recovery**: Enabled for critical data protection

### Logging & Monitoring

- **CloudWatch Logs**: 1-week retention for all Lambda functions
- **Structured Logging**: Efficient log queries reduce costs
- **No X-Ray**: Tracing disabled to reduce monitoring costs

### Message Queue

- **SQS Standard Queue**: Cost-effective message queuing
- **4-Day Retention**: Messages retained for 4 days before expiration
- **Dead Letter Queue**: 14-day retention for failed messages analysis

## Troubleshooting

### Common Issues

#### Authentication Issues

1. **Cognito Login Fails**
   - Verify User Pool ID and Client ID in environment variables
   - Check that user is confirmed in Cognito console
   - Ensure JWT tokens are not expired

2. **JWT Authorization Errors**
   - Check Authorization header format: `Bearer <token>`
   - Verify JWT authorizer Lambda has correct Cognito configuration
   - Check CloudWatch logs for JWT authorizer Lambda

#### WebSocket Issues

3. **WebSocket Connection Fails**
   - Verify WEBSOCKET_API_URL is correct
   - Check that JWT token is passed in query parameters
   - Ensure DynamoDB connections table exists
   - Check WebSocket Lambda logs in CloudWatch

4. **No Real-time Updates**
   - Verify WebSocket connection is established (check browser console)
   - Check that connectionId is stored in DynamoDB
   - Verify broadcast Lambda has execute-api:ManageConnections permission

#### Video Generation Issues

5. **Lambda Timeout**
   - Increase timeout in CDK stack (currently 15 minutes)
   - Check if video is too complex (reduce scenes or duration)
   - Monitor Lambda memory usage (increase if needed)

6. **Video Generation Fails**
   - Check CloudWatch logs for Lambda errors
   - Verify SQS message is in queue
   - Check dead letter queue for failed messages
   - Ensure FFmpeg layer is properly attached

7. **FFmpeg Errors**
   - Verify FFmpeg layer is deployed correctly
   - Check PATH environment variable includes `/opt/bin`
   - Ensure fonts are available for subtitle rendering
   - Check Lambda memory allocation (needs 3GB)

#### Storage Issues

8. **S3 Permission Errors**
   - Check IAM roles and policies for Lambda
   - Verify bucket names in environment variables
   - Ensure buckets exist and are in correct region
   - Check bucket CORS configuration

9. **Pre-signed URL Expired**
   - URLs expire after 10 hours by default
   - Generate new pre-signed URL if expired
   - Adjust TTL in fetch-preview Lambda if needed

#### Payment Issues

10. **Stripe Webhook Fails**
    - Verify webhook signature in Stripe Dashboard
    - Check STRIPE_WEBHOOK_SECRET is correct
    - Ensure webhook endpoint is HTTPS in production
    - Check CloudWatch logs for webhook handler

11. **Credits Not Updated**
    - Verify Stripe webhook is configured correctly
    - Check that checkout session includes metadata
    - Verify DynamoDB user table is being updated
    - Check Stripe Dashboard for webhook event logs

#### Database Issues

12. **DynamoDB Errors**
    - Verify table names in environment variables
    - Check IAM permissions for Lambda functions
    - Ensure GSI indices are created
    - Monitor provisioned/consumed capacity

### Debugging Tools

#### CloudWatch Logs

Check Lambda function logs grouped by function:

- `/aws/lambda/VideoGenerationLambda`: Video processing logs
- `/aws/lambda/WebSocketConnectLambda`: WebSocket connection logs
- `/aws/lambda/JWTAuthorizerLambda`: JWT authorization logs

#### AWS Console Checks

- **DynamoDB**: Verify user records and WebSocket connections
- **SQS**: Check message count in queue and DLQ
- **S3**: Verify videos are being uploaded
- **API Gateway**: Check request/error metrics
- **CloudWatch**: Monitor Lambda duration and errors

#### Local Testing

- Use Stripe CLI for webhook testing: `stripe listen --forward-to localhost:3000/api/stripe/webhook`
- Test WebSocket locally with browser console
- Verify JWT tokens with jwt.io
- Test API endpoints with curl or Postman

## Monitoring & Observability

### CloudWatch Metrics

- **Lambda Invocations**: Track function execution counts
- **Lambda Duration**: Monitor execution time and identify bottlenecks
- **Lambda Errors**: Alert on failed executions
- **API Gateway**: Request count, 4xx/5xx errors, latency
- **SQS Metrics**: Messages in queue, DLQ message count
- **DynamoDB Metrics**: Read/write capacity, throttled requests

### Logging Strategy

All Lambda functions log to CloudWatch with structured logging:

- **INFO**: General operational logs
- **ERROR**: Error conditions with stack traces
- **DEBUG**: Detailed debugging information (when needed)

### Cost Monitoring

- Enable AWS Cost Explorer for daily cost tracking
- Set up billing alerts for unexpected cost spikes
- Monitor Lambda invocation counts and duration
- Track S3 storage growth and data transfer

### Performance Optimization

- Monitor Lambda cold start times
- Track video generation duration by scene count
- Analyze WebSocket connection duration
- Monitor API Gateway latency

## Additional Documentation

- **[STRIPE_SETUP.md](./STRIPE_SETUP.md)**: Detailed Stripe integration setup guide
- **[ARCHITECTURE.md](./ARCHITECTURE.md)**: In-depth architecture documentation
- **CDK Documentation**: See `infrastructure/` directory for infrastructure details

## Related Technologies

### Key Libraries & Frameworks

- **jose**: JWT creation and verification
- **AWS SDK**: Comprehensive AWS service integration
- **axios**: HTTP client for API calls
- **date-fns**: Date manipulation and formatting
- **Stripe SDK**: Payment processing integration

### External APIs

- **Runway Gen-3**: https://docs.runwayml.com/
- **OpenAI API**: https://platform.openai.com/docs
- **Google Gemini**: https://ai.google.dev/docs
- **Stripe**: https://stripe.com/docs

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes following the existing code style
4. Test your changes locally
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Submit a pull request

### Development Guidelines

- Use TypeScript for type safety
- Follow existing code structure and patterns
- Add CloudWatch logging for debugging
- Test Lambda functions locally when possible
- Update environment variable documentation
- Use the `./deploy.sh` script for infrastructure changes

## License

MIT License - see LICENSE file for details.

## Support & Resources

### AWS Resources

- AWS CDK Documentation: https://docs.aws.amazon.com/cdk/
- AWS Lambda: https://docs.aws.amazon.com/lambda/
- Amazon DynamoDB: https://docs.aws.amazon.com/dynamodb/
- AWS Cognito: https://docs.aws.amazon.com/cognito/

### Community

- Report issues via GitHub Issues
- Feature requests welcome
- Pull requests appreciated

---

**Built with ❤️ using AWS serverless architecture, modern web technologies, and AI-powered APIs**
