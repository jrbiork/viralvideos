"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ViralVideosStack = void 0;
const cdk = require("aws-cdk-lib");
const s3 = require("aws-cdk-lib/aws-s3");
const lambda = require("aws-cdk-lib/aws-lambda");
const iam = require("aws-cdk-lib/aws-iam");
const logs = require("aws-cdk-lib/aws-logs");
const sqs = require("aws-cdk-lib/aws-sqs");
const lambdaEventSources = require("aws-cdk-lib/aws-lambda-event-sources");
const apigateway = require("aws-cdk-lib/aws-apigateway");
const path = require("path");
const dotenv = require("dotenv");
// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '../.env') });
class ViralVideosStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        // Get API keys with fallbacks
        const runwayApiKey = process.env.RUNWAY_API_KEY || '';
        const openaiApiKey = process.env.OPENAI_API_KEY || '';
        // Validate API keys
        if (!runwayApiKey) {
            console.warn('⚠️  RUNWAY_API_KEY is not set. Video generation may fail.');
        }
        if (!openaiApiKey) {
            console.warn('⚠️  OPENAI_API_KEY is not set. Video generation may fail.');
        }
        // S3 Bucket for storing videos and assets
        const videoBucket = new s3.Bucket(this, 'VideoBucket', {
            bucketName: `viral-videos-${this.account}-${this.region}`,
            versioned: true,
            encryption: s3.BucketEncryption.S3_MANAGED,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            removalPolicy: cdk.RemovalPolicy.DESTROY, // For demo purposes
            lifecycleRules: [
                {
                    id: 'DeleteOldAssets',
                    enabled: true,
                    noncurrentVersionExpiration: cdk.Duration.days(7),
                    expiration: cdk.Duration.days(30),
                },
            ],
        });
        // S3 Bucket for storing video parts
        const videoPartsBucket = new s3.Bucket(this, 'VideoPartsBucket', {
            bucketName: `video-parts-${this.account}-${this.region}`,
            versioned: true,
            encryption: s3.BucketEncryption.S3_MANAGED,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            removalPolicy: cdk.RemovalPolicy.DESTROY, // For demo purposes
            lifecycleRules: [
                {
                    id: 'DeleteOldVideoParts',
                    enabled: true,
                    noncurrentVersionExpiration: cdk.Duration.days(7),
                    expiration: cdk.Duration.days(30),
                },
            ],
        });
        // SQS Queue for video generation requests
        const videoQueue = new sqs.Queue(this, 'VideoGenerationQueue', {
            queueName: 'video-generation-queue',
            visibilityTimeout: cdk.Duration.minutes(15), // Match lambda timeout
            retentionPeriod: cdk.Duration.days(4),
            deadLetterQueue: {
                queue: new sqs.Queue(this, 'VideoGenerationDLQ', {
                    queueName: 'video-generation-dlq',
                    retentionPeriod: cdk.Duration.days(14),
                }),
                maxReceiveCount: 3,
            },
        });
        // IAM Role for Lambda
        const lambdaRole = new iam.Role(this, 'VideoGenerationLambdaRole', {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
            ],
        });
        // Grant S3 permissions to Lambda
        videoBucket.grantReadWrite(lambdaRole);
        videoPartsBucket.grantReadWrite(lambdaRole);
        // Grant SQS permissions to Lambda
        videoQueue.grantSendMessages(lambdaRole);
        videoQueue.grantConsumeMessages(lambdaRole);
        // Create FFmpeg Lambda Layer
        const ffmpegLayer = new lambda.LayerVersion(this, 'FFmpegLayer', {
            code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/ffmpeg-layer')),
            compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
            description: 'FFmpeg binaries for video processing',
            layerVersionName: 'ffmpeg-layer',
        });
        // Lambda function for video generation (now triggered by SQS)
        const videoGenerationLambda = new lambda.Function(this, 'VideoGenerationLambda', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../dist/video-generation')),
            role: lambdaRole,
            timeout: cdk.Duration.minutes(15),
            memorySize: 3008, // Increased for video processing
            layers: [ffmpegLayer],
            environment: {
                VIDEO_BUCKET_NAME: videoBucket.bucketName,
                VIDEO_PARTS_BUCKET_NAME: videoPartsBucket.bucketName,
                RUNWAY_API_KEY: runwayApiKey,
                OPENAI_API_KEY: openaiApiKey,
                VIDEO_QUEUE_URL: videoQueue.queueUrl,
                PATH: '/opt/bin:/usr/local/bin:/usr/bin/:/bin',
                FONTCONFIG_PATH: '/opt/etc/fonts',
                FONTCONFIG_FILE: '/opt/etc/fonts/fonts.conf',
            },
        });
        // Add SQS event source to video generation lambda
        videoGenerationLambda.addEventSource(new lambdaEventSources.SqsEventSource(videoQueue, {
            batchSize: 1, // Process one message at a time
            maxBatchingWindow: cdk.Duration.seconds(0),
        }));
        // Lambda function for queue management (receives requests and puts them in SQS)
        const queueManagerLambda = new lambda.Function(this, 'QueueManagerLambda', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../dist/queue-manager')),
            role: lambdaRole,
            timeout: cdk.Duration.minutes(1),
            memorySize: 128,
            environment: {
                VIDEO_QUEUE_URL: videoQueue.queueUrl,
            },
        });
        // Lambda function for JWT authorization
        const jwtAuthorizerLambda = new lambda.Function(this, 'JWTAuthorizerLambda', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../dist/jwt-authorizer')),
            role: lambdaRole,
            timeout: cdk.Duration.seconds(30),
            memorySize: 128,
            environment: {
                NEXT_PUBLIC_COGNITO_USER_POOL_ID: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || '',
                NEXT_PUBLIC_COGNITO_CLIENT_ID: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || '',
                NEXT_PUBLIC_COGNITO_REGION: process.env.NEXT_PUBLIC_COGNITO_REGION || 'us-east-1',
            },
        });
        // Lambda function for fetching videos
        const fetchVideosLambda = new lambda.Function(this, 'FetchVideosLambda', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../dist/fetch-videos')),
            role: lambdaRole,
            timeout: cdk.Duration.minutes(1),
            memorySize: 128,
            environment: {
                VIDEO_BUCKET_NAME: videoBucket.bucketName,
            },
        });
        // API Gateway REST API
        const api = new apigateway.RestApi(this, 'VideoGenerationApi', {
            restApiName: 'Video Generation API',
            description: 'API for video generation requests',
            defaultCorsPreflightOptions: {
                allowOrigins: apigateway.Cors.ALL_ORIGINS,
                allowMethods: apigateway.Cors.ALL_METHODS,
                allowHeaders: ['Content-Type', 'Authorization'],
            },
        });
        // Lambda integration for the queue manager
        const queueManagerIntegration = new apigateway.LambdaIntegration(queueManagerLambda, {
            requestTemplates: {
                'application/json': JSON.stringify({
                    body: "$util.escapeJavaScript($input.json('$'))",
                }),
            },
        });
        // JWT Authorizer
        const jwtAuthorizer = new apigateway.TokenAuthorizer(this, 'JWTAuthorizer', {
            handler: jwtAuthorizerLambda,
            identitySource: 'method.request.header.Authorization',
            authorizerName: 'JWTAuthorizer',
        });
        // Lambda integration for fetching videos
        const fetchVideosIntegration = new apigateway.LambdaIntegration(fetchVideosLambda, {
            requestTemplates: {
                'application/json': JSON.stringify({
                    body: "$util.escapeJavaScript($input.json('$'))",
                }),
            },
        });
        // Create API resources and methods with JWT authorization
        const videoResource = api.root.addResource('generate-video');
        videoResource.addMethod('POST', queueManagerIntegration, {
            authorizer: jwtAuthorizer,
        });
        const fetchVideosResource = api.root.addResource('fetch-videos');
        fetchVideosResource.addMethod('GET', fetchVideosIntegration, {
            authorizer: jwtAuthorizer,
        });
        // CloudWatch Log Group for Lambda
        new logs.LogGroup(this, 'VideoGenerationLogGroup', {
            logGroupName: `/aws/lambda/${videoGenerationLambda.functionName}`,
            retention: logs.RetentionDays.ONE_WEEK,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
        new logs.LogGroup(this, 'QueueManagerLogGroup', {
            logGroupName: `/aws/lambda/${queueManagerLambda.functionName}`,
            retention: logs.RetentionDays.ONE_WEEK,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
        new logs.LogGroup(this, 'FetchVideosLogGroup', {
            logGroupName: `/aws/lambda/${fetchVideosLambda.functionName}`,
            retention: logs.RetentionDays.ONE_WEEK,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
        new logs.LogGroup(this, 'JWTAuthorizerLogGroup', {
            logGroupName: `/aws/lambda/${jwtAuthorizerLambda.functionName}`,
            retention: logs.RetentionDays.ONE_WEEK,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
        // Outputs
        new cdk.CfnOutput(this, 'VideoBucketName', {
            value: videoBucket.bucketName,
            description: 'S3 Bucket for storing videos',
        });
        new cdk.CfnOutput(this, 'VideoPartsBucketName', {
            value: videoPartsBucket.bucketName,
            description: 'S3 Bucket for storing video parts',
        });
        new cdk.CfnOutput(this, 'VideoGenerationLambdaArn', {
            value: videoGenerationLambda.functionArn,
            description: 'Lambda function ARN for video generation',
        });
        new cdk.CfnOutput(this, 'VideoGenerationLambdaName', {
            value: videoGenerationLambda.functionName,
            description: 'Lambda function name for video generation',
        });
        new cdk.CfnOutput(this, 'QueueManagerLambdaArn', {
            value: queueManagerLambda.functionArn,
            description: 'Lambda function ARN for queue management',
        });
        new cdk.CfnOutput(this, 'FetchVideosLambdaArn', {
            value: fetchVideosLambda.functionArn,
            description: 'Lambda function ARN for fetching videos',
        });
        new cdk.CfnOutput(this, 'FetchVideosLambdaName', {
            value: fetchVideosLambda.functionName,
            description: 'Lambda function name for fetching videos',
        });
        new cdk.CfnOutput(this, 'JWTAuthorizerLambdaArn', {
            value: jwtAuthorizerLambda.functionArn,
            description: 'Lambda function ARN for JWT authorization',
        });
        new cdk.CfnOutput(this, 'JWTAuthorizerLambdaName', {
            value: jwtAuthorizerLambda.functionName,
            description: 'Lambda function name for JWT authorization',
        });
        new cdk.CfnOutput(this, 'VideoQueueUrl', {
            value: videoQueue.queueUrl,
            description: 'SQS Queue URL for video generation',
        });
        new cdk.CfnOutput(this, 'ApiGatewayUrl', {
            value: api.url,
            description: 'API Gateway URL for video generation',
        });
        new cdk.CfnOutput(this, 'ApiGatewayEndpoint', {
            value: `${api.url}generate-video`,
            description: 'API Gateway endpoint for video generation',
        });
        new cdk.CfnOutput(this, 'FetchVideosEndpoint', {
            value: `${api.url}fetch-videos`,
            description: 'API Gateway endpoint for fetching videos',
        });
    }
}
exports.ViralVideosStack = ViralVideosStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlyYWwtdmlkZW9zLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidmlyYWwtdmlkZW9zLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG1DQUFtQztBQUVuQyx5Q0FBeUM7QUFDekMsaURBQWlEO0FBQ2pELDJDQUEyQztBQUMzQyw2Q0FBNkM7QUFDN0MsMkNBQTJDO0FBQzNDLDJFQUEyRTtBQUMzRSx5REFBeUQ7QUFDekQsNkJBQTZCO0FBQzdCLGlDQUFpQztBQUVqQyw0Q0FBNEM7QUFDNUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxTQUFTLENBQUMsRUFBRSxDQUFDLENBQUM7QUFFekQsTUFBYSxnQkFBaUIsU0FBUSxHQUFHLENBQUMsS0FBSztJQUM3QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXNCO1FBQzlELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLDhCQUE4QjtRQUM5QixNQUFNLFlBQVksR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWMsSUFBSSxFQUFFLENBQUM7UUFDdEQsTUFBTSxZQUFZLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLElBQUksRUFBRSxDQUFDO1FBRXRELG9CQUFvQjtRQUNwQixJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDbEIsT0FBTyxDQUFDLElBQUksQ0FBQywyREFBMkQsQ0FBQyxDQUFDO1FBQzVFLENBQUM7UUFDRCxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDbEIsT0FBTyxDQUFDLElBQUksQ0FBQywyREFBMkQsQ0FBQyxDQUFDO1FBQzVFLENBQUM7UUFFRCwwQ0FBMEM7UUFDMUMsTUFBTSxXQUFXLEdBQUcsSUFBSSxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxhQUFhLEVBQUU7WUFDckQsVUFBVSxFQUFFLGdC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QUMsU0FBUyxDQUFDLElBQUksRUFBRSx5QkFBeUIsRUFBRTtZQUNqRCxLQUFLLEVBQUUsbUJBQW1CLENBQUMsWUFBWTtZQUN2QyxXQUFXLEVBQUUsNENBQTRDO1NBQzFELENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFO1lBQ3ZDLEtBQUssRUFBRSxVQUFVLENBQUMsUUFBUTtZQUMxQixXQUFXLEVBQUUsb0NBQW9DO1NBQ2xELENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFO1lBQ3ZDLEtBQUssRUFBRSxHQUFHLENBQUMsR0FBRztZQUNkLFdBQVcsRUFBRSxzQ0FBc0M7U0FDcEQsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxvQkFBb0IsRUFBRTtZQUM1QyxLQUFLLEVBQUUsR0FBRyxHQUFHLENBQUMsR0FBRyxnQkFBZ0I7WUFDakMsV0FBVyxFQUFFLDJDQUEyQztTQUN6RCxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLHFCQUFxQixFQUFFO1lBQzdDLEtBQUssRUFBRSxHQUFHLEdBQUcsQ0FBQyxHQUFHLGNBQWM7WUFDL0IsV0FBVyxFQUFFLDBDQUEwQztTQUN4RCxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUF2VUQsNENBdVVDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIGxvZ3MgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxvZ3MnO1xuaW1wb3J0ICogYXMgc3FzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zcXMnO1xuaW1wb3J0ICogYXMgbGFtYmRhRXZlbnRTb3VyY2VzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEtZXZlbnQtc291cmNlcyc7XG5pbXBvcnQgKiBhcyBhcGlnYXRld2F5IGZyb20gJ2F3cy1jZGstbGliL2F3cy1hcGlnYXRld2F5JztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgKiBhcyBkb3RlbnYgZnJvbSAnZG90ZW52JztcblxuLy8gTG9hZCBlbnZpcm9ubWVudCB2YXJpYWJsZXMgZnJvbSAuZW52IGZpbGVcbmRvdGVudi5jb25maWcoeyBwYXRoOiBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLmVudicpIH0pO1xuXG5leHBvcnQgY2xhc3MgVmlyYWxWaWRlb3NTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzPzogY2RrLlN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIC8vIEdldCBBUEkga2V5cyB3aXRoIGZhbGxiYWNrc1xuICAgIGNvbnN0IHJ1bndheUFwaUtleSA9IHByb2Nlc3MuZW52LlJVTldBWV9BUElfS0VZIHx8ICcnO1xuICAgIGNvbnN0IG9wZW5haUFwaUtleSA9IHByb2Nlc3MuZW52Lk9QRU5BSV9BUElfS0VZIHx8ICcnO1xuXG4gICAgLy8gVmFsaWRhdGUgQVBJIGtleXNcbiAgICBpZiAoIXJ1bndheUFwaUtleSkge1xuICAgICAgY29uc29sZS53YXJuKCfimqDvuI8gIFJVTldBWV9BUElfS0VZIGlzIG5vdCBzZXQuIFZpZGVvIGdlbmVyYXRpb24gbWF5IGZhaWwuJyk7XG4gICAgfVxuICAgIGlmICghb3BlbmFpQXBpS2V5KSB7XG4gICAgICBjb25zb2xlLndhcm4oJ+KaoO+4jyAgT1BFTkFJX0FQSV9LRVkgaXMgbm90IHNldC4gVmlkZW8gZ2VuZXJhdGlvbiBtYXkgZmFpbC4nKTtcbiAgICB9XG5cbiAgICAvLyBTMyBCdWNrZXQgZm9yIHN0b3JpbmcgdmlkZW9zIGFuZCBhc3NldHNcbiAgICBjb25zdCB2aWRlb0J1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ1ZpZGVvQnVja2V0Jywge1xuICAgICAgYnVja2V0TmFtZTogYHZpcmFsLXZpZGVvcy0ke3RoaXMuYWNjb3VudH0tJHt0aGlzLnJlZ2lvbn1gLFxuICAgICAgdmVyc2lvbmVkOiB0cnVlLFxuICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksIC8vIEZvciBkZW1vIHB1cnBvc2VzXG4gICAgICBsaWZlY3ljbGVSdWxlczogW1xuICAgICAgICB7XG4gICAgICAgICAgaWQ6ICdEZWxldGVPbGRBc3NldHMnLFxuICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgbm9uY3VycmVudFZlcnNpb25FeHBpcmF0aW9uOiBjZGsuRHVyYXRpb24uZGF5cyg3KSxcbiAgICAgICAgICBleHBpcmF0aW9uOiBjZGsuRHVyYXRpb24uZGF5cygzMCksXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gUzMgQnVja2V0IGZvciBzdG9yaW5nIHZpZGVvIHBhcnRzXG4gICAgY29uc3QgdmlkZW9QYXJ0c0J1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ1ZpZGVvUGFydHNCdWNrZXQnLCB7XG4gICAgICBidWNrZXROYW1lOiBgdmlkZW8tcGFydHMtJHt0aGlzLmFjY291bnR9LSR7dGhpcy5yZWdpb259YCxcbiAgICAgIHZlcnNpb25lZDogdHJ1ZSxcbiAgICAgIGVuY3J5cHRpb246IHMzLkJ1Y2tldEVuY3J5cHRpb24uUzNfTUFOQUdFRCxcbiAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBzMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLCAvLyBGb3IgZGVtbyBwdXJwb3Nlc1xuICAgICAgbGlmZWN5Y2xlUnVsZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGlkOiAnRGVsZXRlT2xkVmlkZW9QYXJ0cycsXG4gICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBub25jdXJyZW50VmVyc2lvbkV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKDcpLFxuICAgICAgICAgIGV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKDMwKSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBTUVMgUXVldWUgZm9yIHZpZGVvIGdlbmVyYXRpb24gcmVxdWVzdHNcbiAgICBjb25zdCB2aWRlb1F1ZXVlID0gbmV3IHNxcy5RdWV1ZSh0aGlzLCAnVmlkZW9HZW5lcmF0aW9uUXVldWUnLCB7XG4gICAgICBxdWV1ZU5hbWU6ICd2aWRlby1nZW5lcmF0aW9uLXF1ZXVlJyxcbiAgICAgIHZpc2liaWxpdHlUaW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcygxNSksIC8vIE1hdGNoIGxhbWJkYSB0aW1lb3V0XG4gICAgICByZXRlbnRpb25QZXJpb2Q6IGNkay5EdXJhdGlvbi5kYXlzKDQpLFxuICAgICAgZGVhZExldHRlclF1ZXVlOiB7XG4gICAgICAgIHF1ZXVlOiBuZXcgc3FzLlF1ZXVlKHRoaXMsICdWaWRlb0dlbmVyYXRpb25ETFEnLCB7XG4gICAgICAgICAgcXVldWVOYW1lOiAndmlkZW8tZ2VuZXJhdGlvbi1kbHEnLFxuICAgICAgICAgIHJldGVudGlvblBlcmlvZDogY2RrLkR1cmF0aW9uLmRheXMoMTQpLFxuICAgICAgICB9KSxcbiAgICAgICAgbWF4UmVjZWl2ZUNvdW50OiAzLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIElBTSBSb2xlIGZvciBMYW1iZGFcbiAgICBjb25zdCBsYW1iZGFSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdWaWRlb0dlbmVyYXRpb25MYW1iZGFSb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2xhbWJkYS5hbWF6b25hd3MuY29tJyksXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKFxuICAgICAgICAgICdzZXJ2aWNlLXJvbGUvQVdTTGFtYmRhQmFzaWNFeGVjdXRpb25Sb2xlJyxcbiAgICAgICAgKSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCBTMyBwZXJtaXNzaW9ucyB0byBMYW1iZGFcbiAgICB2aWRlb0J1Y2tldC5ncmFudFJlYWRXcml0ZShsYW1iZGFSb2xlKTtcbiAgICB2aWRlb1BhcnRzQnVja2V0LmdyYW50UmVhZFdyaXRlKGxhbWJkYVJvbGUpO1xuXG4gICAgLy8gR3JhbnQgU1FTIHBlcm1pc3Npb25zIHRvIExhbWJkYVxuICAgIHZpZGVvUXVldWUuZ3JhbnRTZW5kTWVzc2FnZXMobGFtYmRhUm9sZSk7XG4gICAgdmlkZW9RdWV1ZS5ncmFudENvbnN1bWVNZXNzYWdlcyhsYW1iZGFSb2xlKTtcblxuICAgIC8vIENyZWF0ZSBGRm1wZWcgTGFtYmRhIExheWVyXG4gICAgY29uc3QgZmZtcGVnTGF5ZXIgPSBuZXcgbGFtYmRhLkxheWVyVmVyc2lvbih0aGlzLCAnRkZtcGVnTGF5ZXInLCB7XG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXG4gICAgICAgIHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9sYW1iZGEvZmZtcGVnLWxheWVyJyksXG4gICAgICApLFxuICAgICAgY29tcGF0aWJsZVJ1bnRpbWVzOiBbbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1hdLFxuICAgICAgZGVzY3JpcHRpb246ICdGRm1wZWcgYmluYXJpZXMgZm9yIHZpZGVvIHByb2Nlc3NpbmcnLFxuICAgICAgbGF5ZXJWZXJzaW9uTmFtZTogJ2ZmbXBlZy1sYXllcicsXG4gICAgfSk7XG5cbiAgICAvLyBMYW1iZGEgZnVuY3Rpb24gZm9yIHZpZGVvIGdlbmVyYXRpb24gKG5vdyB0cmlnZ2VyZWQgYnkgU1FTKVxuICAgIGNvbnN0IHZpZGVvR2VuZXJhdGlvbkxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24oXG4gICAgICB0aGlzLFxuICAgICAgJ1ZpZGVvR2VuZXJhdGlvbkxhbWJkYScsXG4gICAgICB7XG4gICAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxuICAgICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcbiAgICAgICAgICBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vZGlzdC92aWRlby1nZW5lcmF0aW9uJyksXG4gICAgICAgICksXG4gICAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDE1KSxcbiAgICAgICAgbWVtb3J5U2l6ZTogMzAwOCwgLy8gSW5jcmVhc2VkIGZvciB2aWRlbyBwcm9jZXNzaW5nXG4gICAgICAgIGxheWVyczogW2ZmbXBlZ0xheWVyXSxcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICBWSURFT19CVUNLRVRfTkFNRTogdmlkZW9CdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgICAgICBWSURFT19QQVJUU19CVUNLRVRfTkFNRTogdmlkZW9QYXJ0c0J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgICAgIFJVTldBWV9BUElfS0VZOiBydW53YXlBcGlLZXksXG4gICAgICAgICAgT1BFTkFJX0FQSV9LRVk6IG9wZW5haUFwaUtleSxcbiAgICAgICAgICBWSURFT19RVUVVRV9VUkw6IHZpZGVvUXVldWUucXVldWVVcmwsXG4gICAgICAgICAgUEFUSDogJy9vcHQvYmluOi91c3IvbG9jYWwvYmluOi91c3IvYmluLzovYmluJyxcbiAgICAgICAgICBGT05UQ09ORklHX1BBVEg6ICcvb3B0L2V0Yy9mb250cycsXG4gICAgICAgICAgRk9OVENPTkZJR19GSUxFOiAnL29wdC9ldGMvZm9udHMvZm9udHMuY29uZicsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBBZGQgU1FTIGV2ZW50IHNvdXJjZSB0byB2aWRlbyBnZW5lcmF0aW9uIGxhbWJkYVxuICAgIHZpZGVvR2VuZXJhdGlvbkxhbWJkYS5hZGRFdmVudFNvdXJjZShcbiAgICAgIG5ldyBsYW1iZGFFdmVudFNvdXJjZXMuU3FzRXZlbnRTb3VyY2UodmlkZW9RdWV1ZSwge1xuICAgICAgICBiYXRjaFNpemU6IDEsIC8vIFByb2Nlc3Mgb25lIG1lc3NhZ2UgYXQgYSB0aW1lXG4gICAgICAgIG1heEJhdGNoaW5nV2luZG93OiBjZGsuRHVyYXRpb24uc2Vjb25kcygwKSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICAvLyBMYW1iZGEgZnVuY3Rpb24gZm9yIHF1ZXVlIG1hbmFnZW1lbnQgKHJlY2VpdmVzIHJlcXVlc3RzIGFuZCBwdXRzIHRoZW0gaW4gU1FTKVxuICAgIGNvbnN0IHF1ZXVlTWFuYWdlckxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1F1ZXVlTWFuYWdlckxhbWJkYScsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFxuICAgICAgICBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vZGlzdC9xdWV1ZS1tYW5hZ2VyJyksXG4gICAgICApLFxuICAgICAgcm9sZTogbGFtYmRhUm9sZSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDEpLFxuICAgICAgbWVtb3J5U2l6ZTogMTI4LFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgVklERU9fUVVFVUVfVVJMOiB2aWRlb1F1ZXVlLnF1ZXVlVXJsLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIExhbWJkYSBmdW5jdGlvbiBmb3IgSldUIGF1dGhvcml6YXRpb25cbiAgICBjb25zdCBqd3RBdXRob3JpemVyTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbihcbiAgICAgIHRoaXMsXG4gICAgICAnSldUQXV0aG9yaXplckxhbWJkYScsXG4gICAgICB7XG4gICAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxuICAgICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcbiAgICAgICAgICBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vZGlzdC9qd3QtYXV0aG9yaXplcicpLFxuICAgICAgICApLFxuICAgICAgICByb2xlOiBsYW1iZGFSb2xlLFxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICAgIG1lbW9yeVNpemU6IDEyOCxcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICBORVhUX1BVQkxJQ19DT0dOSVRPX1VTRVJfUE9PTF9JRDpcbiAgICAgICAgICAgIHByb2Nlc3MuZW52Lk5FWFRfUFVCTElDX0NPR05JVE9fVVNFUl9QT09MX0lEIHx8ICcnLFxuICAgICAgICAgIE5FWFRfUFVCTElDX0NPR05JVE9fQ0xJRU5UX0lEOlxuICAgICAgICAgICAgcHJvY2Vzcy5lbnYuTkVYVF9QVUJMSUNfQ09HTklUT19DTElFTlRfSUQgfHwgJycsXG4gICAgICAgICAgTkVYVF9QVUJMSUNfQ09HTklUT19SRUdJT046XG4gICAgICAgICAgICBwcm9jZXNzLmVudi5ORVhUX1BVQkxJQ19DT0dOSVRPX1JFR0lPTiB8fCAndXMtZWFzdC0xJyxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIExhbWJkYSBmdW5jdGlvbiBmb3IgZmV0Y2hpbmcgdmlkZW9zXG4gICAgY29uc3QgZmV0Y2hWaWRlb3NMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdGZXRjaFZpZGVvc0xhbWJkYScsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9kaXN0L2ZldGNoLXZpZGVvcycpKSxcbiAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcygxKSxcbiAgICAgIG1lbW9yeVNpemU6IDEyOCxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFZJREVPX0JVQ0tFVF9OQU1FOiB2aWRlb0J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIEFQSSBHYXRld2F5IFJFU1QgQVBJXG4gICAgY29uc3QgYXBpID0gbmV3IGFwaWdhdGV3YXkuUmVzdEFwaSh0aGlzLCAnVmlkZW9HZW5lcmF0aW9uQXBpJywge1xuICAgICAgcmVzdEFwaU5hbWU6ICdWaWRlbyBHZW5lcmF0aW9uIEFQSScsXG4gICAgICBkZXNjcmlwdGlvbjogJ0FQSSBmb3IgdmlkZW8gZ2VuZXJhdGlvbiByZXF1ZXN0cycsXG4gICAgICBkZWZhdWx0Q29yc1ByZWZsaWdodE9wdGlvbnM6IHtcbiAgICAgICAgYWxsb3dPcmlnaW5zOiBhcGlnYXRld2F5LkNvcnMuQUxMX09SSUdJTlMsXG4gICAgICAgIGFsbG93TWV0aG9kczogYXBpZ2F0ZXdheS5Db3JzLkFMTF9NRVRIT0RTLFxuICAgICAgICBhbGxvd0hlYWRlcnM6IFsnQ29udGVudC1UeXBlJywgJ0F1dGhvcml6YXRpb24nXSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBMYW1iZGEgaW50ZWdyYXRpb24gZm9yIHRoZSBxdWV1ZSBtYW5hZ2VyXG4gICAgY29uc3QgcXVldWVNYW5hZ2VySW50ZWdyYXRpb24gPSBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihcbiAgICAgIHF1ZXVlTWFuYWdlckxhbWJkYSxcbiAgICAgIHtcbiAgICAgICAgcmVxdWVzdFRlbXBsYXRlczoge1xuICAgICAgICAgICdhcHBsaWNhdGlvbi9qc29uJzogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgYm9keTogXCIkdXRpbC5lc2NhcGVKYXZhU2NyaXB0KCRpbnB1dC5qc29uKCckJykpXCIsXG4gICAgICAgICAgfSksXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBKV1QgQXV0aG9yaXplclxuICAgIGNvbnN0IGp3dEF1dGhvcml6ZXIgPSBuZXcgYXBpZ2F0ZXdheS5Ub2tlbkF1dGhvcml6ZXIoXG4gICAgICB0aGlzLFxuICAgICAgJ0pXVEF1dGhvcml6ZXInLFxuICAgICAge1xuICAgICAgICBoYW5kbGVyOiBqd3RBdXRob3JpemVyTGFtYmRhLFxuICAgICAgICBpZGVudGl0eVNvdXJjZTogJ21ldGhvZC5yZXF1ZXN0LmhlYWRlci5BdXRob3JpemF0aW9uJyxcbiAgICAgICAgYXV0aG9yaXplck5hbWU6ICdKV1RBdXRob3JpemVyJyxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIExhbWJkYSBpbnRlZ3JhdGlvbiBmb3IgZmV0Y2hpbmcgdmlkZW9zXG4gICAgY29uc3QgZmV0Y2hWaWRlb3NJbnRlZ3JhdGlvbiA9IG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKFxuICAgICAgZmV0Y2hWaWRlb3NMYW1iZGEsXG4gICAgICB7XG4gICAgICAgIHJlcXVlc3RUZW1wbGF0ZXM6IHtcbiAgICAgICAgICAnYXBwbGljYXRpb24vanNvbic6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIGJvZHk6IFwiJHV0aWwuZXNjYXBlSmF2YVNjcmlwdCgkaW5wdXQuanNvbignJCcpKVwiLFxuICAgICAgICAgIH0pLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gQ3JlYXRlIEFQSSByZXNvdXJjZXMgYW5kIG1ldGhvZHMgd2l0aCBKV1QgYXV0aG9yaXphdGlvblxuICAgIGNvbnN0IHZpZGVvUmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZSgnZ2VuZXJhdGUtdmlkZW8nKTtcbiAgICB2aWRlb1Jlc291cmNlLmFkZE1ldGhvZCgnUE9TVCcsIHF1ZXVlTWFuYWdlckludGVncmF0aW9uLCB7XG4gICAgICBhdXRob3JpemVyOiBqd3RBdXRob3JpemVyLFxuICAgIH0pO1xuXG4gICAgY29uc3QgZmV0Y2hWaWRlb3NSZXNvdXJjZSA9IGFwaS5yb290LmFkZFJlc291cmNlKCdmZXRjaC12aWRlb3MnKTtcbiAgICBmZXRjaFZpZGVvc1Jlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgZmV0Y2hWaWRlb3NJbnRlZ3JhdGlvbiwge1xuICAgICAgYXV0aG9yaXplcjogand0QXV0aG9yaXplcixcbiAgICB9KTtcblxuICAgIC8vIENsb3VkV2F0Y2ggTG9nIEdyb3VwIGZvciBMYW1iZGFcbiAgICBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnVmlkZW9HZW5lcmF0aW9uTG9nR3JvdXAnLCB7XG4gICAgICBsb2dHcm91cE5hbWU6IGAvYXdzL2xhbWJkYS8ke3ZpZGVvR2VuZXJhdGlvbkxhbWJkYS5mdW5jdGlvbk5hbWV9YCxcbiAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICB9KTtcblxuICAgIG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdRdWV1ZU1hbmFnZXJMb2dHcm91cCcsIHtcbiAgICAgIGxvZ0dyb3VwTmFtZTogYC9hd3MvbGFtYmRhLyR7cXVldWVNYW5hZ2VyTGFtYmRhLmZ1bmN0aW9uTmFtZX1gLFxuICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgIH0pO1xuXG4gICAgbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ0ZldGNoVmlkZW9zTG9nR3JvdXAnLCB7XG4gICAgICBsb2dHcm91cE5hbWU6IGAvYXdzL2xhbWJkYS8ke2ZldGNoVmlkZW9zTGFtYmRhLmZ1bmN0aW9uTmFtZX1gLFxuICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgIH0pO1xuXG4gICAgbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ0pXVEF1dGhvcml6ZXJMb2dHcm91cCcsIHtcbiAgICAgIGxvZ0dyb3VwTmFtZTogYC9hd3MvbGFtYmRhLyR7and0QXV0aG9yaXplckxhbWJkYS5mdW5jdGlvbk5hbWV9YCxcbiAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICB9KTtcblxuICAgIC8vIE91dHB1dHNcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVmlkZW9CdWNrZXROYW1lJywge1xuICAgICAgdmFsdWU6IHZpZGVvQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ1MzIEJ1Y2tldCBmb3Igc3RvcmluZyB2aWRlb3MnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1ZpZGVvUGFydHNCdWNrZXROYW1lJywge1xuICAgICAgdmFsdWU6IHZpZGVvUGFydHNCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUzMgQnVja2V0IGZvciBzdG9yaW5nIHZpZGVvIHBhcnRzJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdWaWRlb0dlbmVyYXRpb25MYW1iZGFBcm4nLCB7XG4gICAgICB2YWx1ZTogdmlkZW9HZW5lcmF0aW9uTGFtYmRhLmZ1bmN0aW9uQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdMYW1iZGEgZnVuY3Rpb24gQVJOIGZvciB2aWRlbyBnZW5lcmF0aW9uJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdWaWRlb0dlbmVyYXRpb25MYW1iZGFOYW1lJywge1xuICAgICAgdmFsdWU6IHZpZGVvR2VuZXJhdGlvbkxhbWJkYS5mdW5jdGlvbk5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ0xhbWJkYSBmdW5jdGlvbiBuYW1lIGZvciB2aWRlbyBnZW5lcmF0aW9uJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdRdWV1ZU1hbmFnZXJMYW1iZGFBcm4nLCB7XG4gICAgICB2YWx1ZTogcXVldWVNYW5hZ2VyTGFtYmRhLmZ1bmN0aW9uQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdMYW1iZGEgZnVuY3Rpb24gQVJOIGZvciBxdWV1ZSBtYW5hZ2VtZW50JyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdGZXRjaFZpZGVvc0xhbWJkYUFybicsIHtcbiAgICAgIHZhbHVlOiBmZXRjaFZpZGVvc0xhbWJkYS5mdW5jdGlvbkFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnTGFtYmRhIGZ1bmN0aW9uIEFSTiBmb3IgZmV0Y2hpbmcgdmlkZW9zJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdGZXRjaFZpZGVvc0xhbWJkYU5hbWUnLCB7XG4gICAgICB2YWx1ZTogZmV0Y2hWaWRlb3NMYW1iZGEuZnVuY3Rpb25OYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdMYW1iZGEgZnVuY3Rpb24gbmFtZSBmb3IgZmV0Y2hpbmcgdmlkZW9zJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdKV1RBdXRob3JpemVyTGFtYmRhQXJuJywge1xuICAgICAgdmFsdWU6IGp3dEF1dGhvcml6ZXJMYW1iZGEuZnVuY3Rpb25Bcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ0xhbWJkYSBmdW5jdGlvbiBBUk4gZm9yIEpXVCBhdXRob3JpemF0aW9uJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdKV1RBdXRob3JpemVyTGFtYmRhTmFtZScsIHtcbiAgICAgIHZhbHVlOiBqd3RBdXRob3JpemVyTGFtYmRhLmZ1bmN0aW9uTmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnTGFtYmRhIGZ1bmN0aW9uIG5hbWUgZm9yIEpXVCBhdXRob3JpemF0aW9uJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdWaWRlb1F1ZXVlVXJsJywge1xuICAgICAgdmFsdWU6IHZpZGVvUXVldWUucXVldWVVcmwsXG4gICAgICBkZXNjcmlwdGlvbjogJ1NRUyBRdWV1ZSBVUkwgZm9yIHZpZGVvIGdlbmVyYXRpb24nLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FwaUdhdGV3YXlVcmwnLCB7XG4gICAgICB2YWx1ZTogYXBpLnVybCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVBJIEdhdGV3YXkgVVJMIGZvciB2aWRlbyBnZW5lcmF0aW9uJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBcGlHYXRld2F5RW5kcG9pbnQnLCB7XG4gICAgICB2YWx1ZTogYCR7YXBpLnVybH1nZW5lcmF0ZS12aWRlb2AsXG4gICAgICBkZXNjcmlwdGlvbjogJ0FQSSBHYXRld2F5IGVuZHBvaW50IGZvciB2aWRlbyBnZW5lcmF0aW9uJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdGZXRjaFZpZGVvc0VuZHBvaW50Jywge1xuICAgICAgdmFsdWU6IGAke2FwaS51cmx9ZmV0Y2gtdmlkZW9zYCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVBJIEdhdGV3YXkgZW5kcG9pbnQgZm9yIGZldGNoaW5nIHZpZGVvcycsXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==