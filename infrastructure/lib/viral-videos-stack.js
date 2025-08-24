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
const dynamodb = require("aws-cdk-lib/aws-dynamodb");
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
        // DynamoDB Users Table
        const usersTable = new dynamodb.Table(this, 'UsersTable', {
            tableName: 'viral-videos-users',
            partitionKey: {
                name: 'userId',
                type: dynamodb.AttributeType.STRING,
            },
            sortKey: {
                name: 'username',
                type: dynamodb.AttributeType.STRING,
            },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.DESTROY, // For demo purposes
            pointInTimeRecovery: true,
        });
        // Add GSI for username lookups
        usersTable.addGlobalSecondaryIndex({
            indexName: 'UsernameIndex',
            partitionKey: {
                name: 'username',
                type: dynamodb.AttributeType.STRING,
            },
            projectionType: dynamodb.ProjectionType.ALL,
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
        // Grant DynamoDB permissions to Lambda
        usersTable.grantReadWriteData(lambdaRole);
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
                USERS_TABLE_NAME: usersTable.tableName,
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
        const fullVideoQueueLambda = new lambda.Function(this, 'FullVideoQueueLambda', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../dist/full-video-queue')),
            role: lambdaRole,
            timeout: cdk.Duration.minutes(1),
            memorySize: 128,
            environment: {
                VIDEO_QUEUE_URL: videoQueue.queueUrl,
                USERS_TABLE_NAME: usersTable.tableName,
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
                USERS_TABLE_NAME: usersTable.tableName,
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
                VIDEO_PARTS_BUCKET_NAME: videoPartsBucket.bucketName,
                USERS_TABLE_NAME: usersTable.tableName,
            },
        });
        // Lambda function for fetching data preview
        const fetchDataPreviewLambda = new lambda.Function(this, 'FetchDataPreviewLambda', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../dist/fetch-data-preview')),
            role: lambdaRole,
            timeout: cdk.Duration.minutes(1),
            memorySize: 128,
            environment: {
                VIDEO_PARTS_BUCKET_NAME: videoPartsBucket.bucketName,
                USERS_TABLE_NAME: usersTable.tableName,
            },
        });
        // Lambda function for user management
        const getUserLambda = new lambda.Function(this, 'GetUserLambda', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../dist/get-user')),
            role: lambdaRole,
            timeout: cdk.Duration.minutes(1),
            memorySize: 128,
            environment: {
                USERS_TABLE_NAME: usersTable.tableName,
            },
        });
        const upsertUserLambda = new lambda.Function(this, 'UpsertUserLambda', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../dist/upsert-user')),
            role: lambdaRole,
            timeout: cdk.Duration.minutes(1),
            memorySize: 128,
            environment: {
                USERS_TABLE_NAME: usersTable.tableName,
            },
        });
        // Lambda function for deleting videos
        const deleteVideoLambda = new lambda.Function(this, 'DeleteVideoLambda', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../dist/delete-video')),
            role: lambdaRole,
            timeout: cdk.Duration.minutes(1),
            memorySize: 128,
            environment: {
                VIDEO_BUCKET_NAME: videoBucket.bucketName,
            },
        });
        // Lambda function for generating story breakdowns
        const generateStoryBreakdownLambda = new lambda.Function(this, 'GenerateStoryBreakdownLambda', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../dist/generate-story-breakdown')),
            role: lambdaRole,
            timeout: cdk.Duration.minutes(2),
            memorySize: 256,
            environment: {
                OPENAI_API_KEY: openaiApiKey,
            },
        });
        // Lambda function for generating audio narration
        const generateAudioLambda = new lambda.Function(this, 'GenerateAudioLambda', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../dist/generate-audio')),
            role: lambdaRole,
            timeout: cdk.Duration.minutes(5),
            memorySize: 512,
            environment: {
                OPENAI_API_KEY: openaiApiKey,
                VIDEO_PARTS_BUCKET_NAME: videoPartsBucket.bucketName,
            },
        });
        // Lambda function for generating images
        const generateImagesLambda = new lambda.Function(this, 'GenerateImagesLambda', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../dist/generate-images')),
            role: lambdaRole,
            timeout: cdk.Duration.minutes(10),
            memorySize: 1024,
            environment: {
                RUNWAY_API_KEY: runwayApiKey,
                VIDEO_PARTS_BUCKET_NAME: videoPartsBucket.bucketName,
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
        const queueManagerIntegration = new apigateway.LambdaIntegration(fullVideoQueueLambda, {
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
            // Disable caching completely for debugging
            resultsCacheTtl: cdk.Duration.seconds(0),
        });
        // Lambda integration for fetching videos
        const fetchVideosIntegration = new apigateway.LambdaIntegration(fetchVideosLambda, {
            requestTemplates: {
                'application/json': JSON.stringify({
                    body: "$util.escapeJavaScript($input.json('$'))",
                }),
            },
        });
        // Lambda integration for fetching scripts
        const fetchDataPreviewIntegration = new apigateway.LambdaIntegration(fetchDataPreviewLambda, {
            requestTemplates: {
                'application/json': JSON.stringify({
                    body: "$util.escapeJavaScript($input.json('$'))",
                }),
            },
        });
        // Lambda integration for get user
        const getUserIntegration = new apigateway.LambdaIntegration(getUserLambda, {
            requestTemplates: {
                'application/json': JSON.stringify({
                    queryStringParameters: {
                        userId: "$input.params('userId')",
                    },
                }),
            },
        });
        // Lambda integration for upsert user
        const upsertUserIntegration = new apigateway.LambdaIntegration(upsertUserLambda, {
            requestTemplates: {
                'application/json': JSON.stringify({
                    body: "$util.escapeJavaScript($input.json('$'))",
                }),
            },
        });
        // Lambda integration for deleting videos
        const deleteVideoIntegration = new apigateway.LambdaIntegration(deleteVideoLambda, {
            requestTemplates: {
                'application/json': JSON.stringify({
                    queryStringParameters: {
                        timestamp: "$input.params('timestamp')",
                    },
                }),
            },
        });
        // Lambda integration for generating story breakdowns
        const generateStoryBreakdownIntegration = new apigateway.LambdaIntegration(generateStoryBreakdownLambda, {
            requestTemplates: {
                'application/json': JSON.stringify({
                    body: "$util.escapeJavaScript($input.json('$'))",
                }),
            },
        });
        // Lambda integration for generating audio narration
        const generateAudioIntegration = new apigateway.LambdaIntegration(generateAudioLambda, {
            requestTemplates: {
                'application/json': JSON.stringify({
                    body: "$util.escapeJavaScript($input.json('$'))",
                }),
            },
        });
        // Lambda integration for generating images
        const generateImagesIntegration = new apigateway.LambdaIntegration(generateImagesLambda, {
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
        const fetchDataPreviewResource = api.root.addResource('fetch-data-preview');
        fetchDataPreviewResource.addMethod('GET', fetchDataPreviewIntegration, {
            authorizer: jwtAuthorizer,
        });
        const generateStoryBreakdownResource = api.root.addResource('generate-story-breakdown');
        generateStoryBreakdownResource.addMethod('POST', generateStoryBreakdownIntegration, {
            authorizer: jwtAuthorizer,
        });
        const generateAudioResource = api.root.addResource('generate-audio');
        generateAudioResource.addMethod('POST', generateAudioIntegration, {
            authorizer: jwtAuthorizer,
        });
        const generateImagesResource = api.root.addResource('generate-images');
        generateImagesResource.addMethod('POST', generateImagesIntegration, {
            authorizer: jwtAuthorizer,
        });
        const userManagementResource = api.root.addResource('user');
        userManagementResource.addMethod('POST', upsertUserIntegration, {
            authorizer: jwtAuthorizer,
        });
        // Add GET method with query parameters
        userManagementResource.addMethod('GET', getUserIntegration, {
            authorizer: jwtAuthorizer,
            requestParameters: {
                'method.request.querystring.userId': true,
            },
        });
        const deleteVideoResource = api.root.addResource('delete-video');
        deleteVideoResource.addMethod('DELETE', deleteVideoIntegration, {
            authorizer: jwtAuthorizer,
            requestParameters: {
                'method.request.querystring.timestamp': true,
            },
        });
        // CloudWatch Log Group for Lambda
        new logs.LogGroup(this, 'VideoGenerationLogGroup', {
            logGroupName: `/aws/lambda/${videoGenerationLambda.functionName}`,
            retention: logs.RetentionDays.ONE_WEEK,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
        new logs.LogGroup(this, 'FullVideoQueueLogGroup', {
            logGroupName: `/aws/lambda/${fullVideoQueueLambda.functionName}`,
            retention: logs.RetentionDays.ONE_WEEK,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
        new logs.LogGroup(this, 'FetchVideosLogGroup', {
            logGroupName: `/aws/lambda/${fetchVideosLambda.functionName}`,
            retention: logs.RetentionDays.ONE_WEEK,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
        new logs.LogGroup(this, 'FetchDataPreviewLogGroup', {
            logGroupName: `/aws/lambda/${fetchDataPreviewLambda.functionName}`,
            retention: logs.RetentionDays.ONE_WEEK,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
        new logs.LogGroup(this, 'GetUserLogGroup', {
            logGroupName: `/aws/lambda/${getUserLambda.functionName}`,
            retention: logs.RetentionDays.ONE_WEEK,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
        new logs.LogGroup(this, 'UpsertUserLogGroup', {
            logGroupName: `/aws/lambda/${upsertUserLambda.functionName}`,
            retention: logs.RetentionDays.ONE_WEEK,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
        new logs.LogGroup(this, 'DeleteVideoLogGroup', {
            logGroupName: `/aws/lambda/${deleteVideoLambda.functionName}`,
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
        new cdk.CfnOutput(this, 'FullVideoQueueLambdaArn', {
            value: fullVideoQueueLambda.functionArn,
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
        new cdk.CfnOutput(this, 'GetUserLambdaArn', {
            value: getUserLambda.functionArn,
            description: 'Lambda function ARN for get user',
        });
        new cdk.CfnOutput(this, 'GetUserLambdaName', {
            value: getUserLambda.functionName,
            description: 'Lambda function name for get user',
        });
        new cdk.CfnOutput(this, 'UpsertUserLambdaArn', {
            value: upsertUserLambda.functionArn,
            description: 'Lambda function ARN for upsert user',
        });
        new cdk.CfnOutput(this, 'UpsertUserLambdaName', {
            value: upsertUserLambda.functionName,
            description: 'Lambda function name for upsert user',
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
        new cdk.CfnOutput(this, 'UserManagementEndpoint', {
            value: `${api.url}user`,
            description: 'API Gateway endpoint for user management',
        });
        new cdk.CfnOutput(this, 'UsersTableName', {
            value: usersTable.tableName,
            description: 'DynamoDB table name for users',
        });
        new cdk.CfnOutput(this, 'UsersTableArn', {
            value: usersTable.tableArn,
            description: 'DynamoDB table ARN for users',
        });
    }
}
exports.ViralVideosStack = ViralVideosStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlyYWwtdmlkZW9zLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidmlyYWwtdmlkZW9zLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG1DQUFtQztBQUVuQyx5Q0FBeUM7QUFDekMsaURBQWlEO0FBQ2pELDJDQUEyQztBQUMzQyw2Q0FBNkM7QUFDN0MsMkNBQTJDO0FBQzNDLDJFQUEyRTtBQUMzRSx5REFBeUQ7QUFDekQscURBQXFEO0FBQ3JELDZCQUE2QjtBQUM3QixpQ0FBaUM7QUFFakMsNENBQTRDO0FBQzVDLE1BQU0sQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsU0FBUyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBRXpELE1BQWEsZ0JBQWlCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDN0MsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFzQjtRQUM5RCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4Qiw4QkFBOEI7UUFDOUIsTUFBTSxZQUFZLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLElBQUksRUFBRSxDQUFDO1FBQ3RELE1BQU0sWUFBWSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBYyxJQUFJLEVBQUUsQ0FBQztRQUV0RCxvQkFBb0I7UUFDcEIsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO1lBQ2xCLE9BQU8sQ0FBQyxJQUFJLENBQUMsMkRBQTJELENBQUMsQ0FBQztRQUM1RSxDQUFDO1FBQ0QsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO1lBQ2xCLE9BQU8sQ0FBQyxJQUFJLENBQUMsMkRBQTJELENBQUMsQ0FBQztRQUM1RSxDQUFDO1FBRUQsMENBQTBDO1FBQzFDLE1BQU0sV0FBVyxHQUFHLElBQUksRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsYUFBYSxFQUFFO1lBQ3JE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LEVBQUUsR0FBRyxHQUFHLENBQUMsR0FBRyxjQUFjO1lBQy9CLFdBQVcsRUFBRSwwQ0FBMEM7U0FDeEQsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSx3QkFBd0IsRUFBRTtZQUNoRCxLQUFLLEVBQUUsR0FBRyxHQUFHLENBQUMsR0FBRyxNQUFNO1lBQ3ZCLFdBQVcsRUFBRSwwQ0FBMEM7U0FDeEQsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZQUN4QyxLQUFLLEVBQUUsVUFBVSxDQUFDLFNBQVM7WUFDM0IsV0FBVyxFQUFFLCtCQUErQjtTQUM3QyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGVBQWUsRUFBRTtZQUN2QyxLQUFLLEVBQUUsVUFBVSxDQUFDLFFBQVE7WUFDMUIsV0FBVyxFQUFFLDhCQUE4QjtTQUM1QyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUFucUJELDRDQW1xQkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0ICogYXMgbG9ncyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbG9ncyc7XG5pbXBvcnQgKiBhcyBzcXMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNxcyc7XG5pbXBvcnQgKiBhcyBsYW1iZGFFdmVudFNvdXJjZXMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYS1ldmVudC1zb3VyY2VzJztcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXkgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXknO1xuaW1wb3J0ICogYXMgZHluYW1vZGIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWR5bmFtb2RiJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgKiBhcyBkb3RlbnYgZnJvbSAnZG90ZW52JztcblxuLy8gTG9hZCBlbnZpcm9ubWVudCB2YXJpYWJsZXMgZnJvbSAuZW52IGZpbGVcbmRvdGVudi5jb25maWcoeyBwYXRoOiBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLmVudicpIH0pO1xuXG5leHBvcnQgY2xhc3MgVmlyYWxWaWRlb3NTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzPzogY2RrLlN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIC8vIEdldCBBUEkga2V5cyB3aXRoIGZhbGxiYWNrc1xuICAgIGNvbnN0IHJ1bndheUFwaUtleSA9IHByb2Nlc3MuZW52LlJVTldBWV9BUElfS0VZIHx8ICcnO1xuICAgIGNvbnN0IG9wZW5haUFwaUtleSA9IHByb2Nlc3MuZW52Lk9QRU5BSV9BUElfS0VZIHx8ICcnO1xuXG4gICAgLy8gVmFsaWRhdGUgQVBJIGtleXNcbiAgICBpZiAoIXJ1bndheUFwaUtleSkge1xuICAgICAgY29uc29sZS53YXJuKCfimqDvuI8gIFJVTldBWV9BUElfS0VZIGlzIG5vdCBzZXQuIFZpZGVvIGdlbmVyYXRpb24gbWF5IGZhaWwuJyk7XG4gICAgfVxuICAgIGlmICghb3BlbmFpQXBpS2V5KSB7XG4gICAgICBjb25zb2xlLndhcm4oJ+KaoO+4jyAgT1BFTkFJX0FQSV9LRVkgaXMgbm90IHNldC4gVmlkZW8gZ2VuZXJhdGlvbiBtYXkgZmFpbC4nKTtcbiAgICB9XG5cbiAgICAvLyBTMyBCdWNrZXQgZm9yIHN0b3JpbmcgdmlkZW9zIGFuZCBhc3NldHNcbiAgICBjb25zdCB2aWRlb0J1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ1ZpZGVvQnVja2V0Jywge1xuICAgICAgYnVja2V0TmFtZTogYHZpcmFsLXZpZGVvcy0ke3RoaXMuYWNjb3VudH0tJHt0aGlzLnJlZ2lvbn1gLFxuICAgICAgdmVyc2lvbmVkOiB0cnVlLFxuICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksIC8vIEZvciBkZW1vIHB1cnBvc2VzXG4gICAgICBsaWZlY3ljbGVSdWxlczogW1xuICAgICAgICB7XG4gICAgICAgICAgaWQ6ICdEZWxldGVPbGRBc3NldHMnLFxuICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgbm9uY3VycmVudFZlcnNpb25FeHBpcmF0aW9uOiBjZGsuRHVyYXRpb24uZGF5cyg3KSxcbiAgICAgICAgICBleHBpcmF0aW9uOiBjZGsuRHVyYXRpb24uZGF5cygzMCksXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gUzMgQnVja2V0IGZvciBzdG9yaW5nIHZpZGVvIHBhcnRzXG4gICAgY29uc3QgdmlkZW9QYXJ0c0J1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ1ZpZGVvUGFydHNCdWNrZXQnLCB7XG4gICAgICBidWNrZXROYW1lOiBgdmlkZW8tcGFydHMtJHt0aGlzLmFjY291bnR9LSR7dGhpcy5yZWdpb259YCxcbiAgICAgIHZlcnNpb25lZDogdHJ1ZSxcbiAgICAgIGVuY3J5cHRpb246IHMzLkJ1Y2tldEVuY3J5cHRpb24uUzNfTUFOQUdFRCxcbiAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBzMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLCAvLyBGb3IgZGVtbyBwdXJwb3Nlc1xuICAgICAgbGlmZWN5Y2xlUnVsZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGlkOiAnRGVsZXRlT2xkVmlkZW9QYXJ0cycsXG4gICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBub25jdXJyZW50VmVyc2lvbkV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKDcpLFxuICAgICAgICAgIGV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKDMwKSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBTUVMgUXVldWUgZm9yIHZpZGVvIGdlbmVyYXRpb24gcmVxdWVzdHNcbiAgICBjb25zdCB2aWRlb1F1ZXVlID0gbmV3IHNxcy5RdWV1ZSh0aGlzLCAnVmlkZW9HZW5lcmF0aW9uUXVldWUnLCB7XG4gICAgICBxdWV1ZU5hbWU6ICd2aWRlby1nZW5lcmF0aW9uLXF1ZXVlJyxcbiAgICAgIHZpc2liaWxpdHlUaW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcygxNSksIC8vIE1hdGNoIGxhbWJkYSB0aW1lb3V0XG4gICAgICByZXRlbnRpb25QZXJpb2Q6IGNkay5EdXJhdGlvbi5kYXlzKDQpLFxuICAgICAgZGVhZExldHRlclF1ZXVlOiB7XG4gICAgICAgIHF1ZXVlOiBuZXcgc3FzLlF1ZXVlKHRoaXMsICdWaWRlb0dlbmVyYXRpb25ETFEnLCB7XG4gICAgICAgICAgcXVldWVOYW1lOiAndmlkZW8tZ2VuZXJhdGlvbi1kbHEnLFxuICAgICAgICAgIHJldGVudGlvblBlcmlvZDogY2RrLkR1cmF0aW9uLmRheXMoMTQpLFxuICAgICAgICB9KSxcbiAgICAgICAgbWF4UmVjZWl2ZUNvdW50OiAzLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIER5bmFtb0RCIFVzZXJzIFRhYmxlXG4gICAgY29uc3QgdXNlcnNUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCAnVXNlcnNUYWJsZScsIHtcbiAgICAgIHRhYmxlTmFtZTogJ3ZpcmFsLXZpZGVvcy11c2VycycsXG4gICAgICBwYXJ0aXRpb25LZXk6IHtcbiAgICAgICAgbmFtZTogJ3VzZXJJZCcsXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxuICAgICAgfSxcbiAgICAgIHNvcnRLZXk6IHtcbiAgICAgICAgbmFtZTogJ3VzZXJuYW1lJyxcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXG4gICAgICB9LFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksIC8vIEZvciBkZW1vIHB1cnBvc2VzXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5OiB0cnVlLFxuICAgIH0pO1xuXG4gICAgLy8gQWRkIEdTSSBmb3IgdXNlcm5hbWUgbG9va3Vwc1xuICAgIHVzZXJzVGFibGUuYWRkR2xvYmFsU2Vjb25kYXJ5SW5kZXgoe1xuICAgICAgaW5kZXhOYW1lOiAnVXNlcm5hbWVJbmRleCcsXG4gICAgICBwYXJ0aXRpb25LZXk6IHtcbiAgICAgICAgbmFtZTogJ3VzZXJuYW1lJyxcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXG4gICAgICB9LFxuICAgICAgcHJvamVjdGlvblR5cGU6IGR5bmFtb2RiLlByb2plY3Rpb25UeXBlLkFMTCxcbiAgICB9KTtcblxuICAgIC8vIElBTSBSb2xlIGZvciBMYW1iZGFcbiAgICBjb25zdCBsYW1iZGFSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdWaWRlb0dlbmVyYXRpb25MYW1iZGFSb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2xhbWJkYS5hbWF6b25hd3MuY29tJyksXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKFxuICAgICAgICAgICdzZXJ2aWNlLXJvbGUvQVdTTGFtYmRhQmFzaWNFeGVjdXRpb25Sb2xlJyxcbiAgICAgICAgKSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCBTMyBwZXJtaXNzaW9ucyB0byBMYW1iZGFcbiAgICB2aWRlb0J1Y2tldC5ncmFudFJlYWRXcml0ZShsYW1iZGFSb2xlKTtcbiAgICB2aWRlb1BhcnRzQnVja2V0LmdyYW50UmVhZFdyaXRlKGxhbWJkYVJvbGUpO1xuXG4gICAgLy8gR3JhbnQgU1FTIHBlcm1pc3Npb25zIHRvIExhbWJkYVxuICAgIHZpZGVvUXVldWUuZ3JhbnRTZW5kTWVzc2FnZXMobGFtYmRhUm9sZSk7XG4gICAgdmlkZW9RdWV1ZS5ncmFudENvbnN1bWVNZXNzYWdlcyhsYW1iZGFSb2xlKTtcblxuICAgIC8vIEdyYW50IER5bmFtb0RCIHBlcm1pc3Npb25zIHRvIExhbWJkYVxuICAgIHVzZXJzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGxhbWJkYVJvbGUpO1xuXG4gICAgLy8gQ3JlYXRlIEZGbXBlZyBMYW1iZGEgTGF5ZXJcbiAgICBjb25zdCBmZm1wZWdMYXllciA9IG5ldyBsYW1iZGEuTGF5ZXJWZXJzaW9uKHRoaXMsICdGRm1wZWdMYXllcicsIHtcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcbiAgICAgICAgcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2xhbWJkYS9mZm1wZWctbGF5ZXInKSxcbiAgICAgICksXG4gICAgICBjb21wYXRpYmxlUnVudGltZXM6IFtsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWF0sXG4gICAgICBkZXNjcmlwdGlvbjogJ0ZGbXBlZyBiaW5hcmllcyBmb3IgdmlkZW8gcHJvY2Vzc2luZycsXG4gICAgICBsYXllclZlcnNpb25OYW1lOiAnZmZtcGVnLWxheWVyJyxcbiAgICB9KTtcblxuICAgIC8vIExhbWJkYSBmdW5jdGlvbiBmb3IgdmlkZW8gZ2VuZXJhdGlvbiAobm93IHRyaWdnZXJlZCBieSBTUVMpXG4gICAgY29uc3QgdmlkZW9HZW5lcmF0aW9uTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbihcbiAgICAgIHRoaXMsXG4gICAgICAnVmlkZW9HZW5lcmF0aW9uTGFtYmRhJyxcbiAgICAgIHtcbiAgICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXG4gICAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFxuICAgICAgICAgIHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9kaXN0L3ZpZGVvLWdlbmVyYXRpb24nKSxcbiAgICAgICAgKSxcbiAgICAgICAgcm9sZTogbGFtYmRhUm9sZSxcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMTUpLFxuICAgICAgICBtZW1vcnlTaXplOiAzMDA4LCAvLyBJbmNyZWFzZWQgZm9yIHZpZGVvIHByb2Nlc3NpbmdcbiAgICAgICAgbGF5ZXJzOiBbZmZtcGVnTGF5ZXJdLFxuICAgICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAgIFZJREVPX0JVQ0tFVF9OQU1FOiB2aWRlb0J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgICAgIFZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FOiB2aWRlb1BhcnRzQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICAgICAgVVNFUlNfVEFCTEVfTkFNRTogdXNlcnNUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgICAgUlVOV0FZX0FQSV9LRVk6IHJ1bndheUFwaUtleSxcbiAgICAgICAgICBPUEVOQUlfQVBJX0tFWTogb3BlbmFpQXBpS2V5LFxuICAgICAgICAgIFZJREVPX1FVRVVFX1VSTDogdmlkZW9RdWV1ZS5xdWV1ZVVybCxcbiAgICAgICAgICBQQVRIOiAnL29wdC9iaW46L3Vzci9sb2NhbC9iaW46L3Vzci9iaW4vOi9iaW4nLFxuICAgICAgICAgIEZPTlRDT05GSUdfUEFUSDogJy9vcHQvZXRjL2ZvbnRzJyxcbiAgICAgICAgICBGT05UQ09ORklHX0ZJTEU6ICcvb3B0L2V0Yy9mb250cy9mb250cy5jb25mJyxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIEFkZCBTUVMgZXZlbnQgc291cmNlIHRvIHZpZGVvIGdlbmVyYXRpb24gbGFtYmRhXG4gICAgdmlkZW9HZW5lcmF0aW9uTGFtYmRhLmFkZEV2ZW50U291cmNlKFxuICAgICAgbmV3IGxhbWJkYUV2ZW50U291cmNlcy5TcXNFdmVudFNvdXJjZSh2aWRlb1F1ZXVlLCB7XG4gICAgICAgIGJhdGNoU2l6ZTogMSwgLy8gUHJvY2VzcyBvbmUgbWVzc2FnZSBhdCBhIHRpbWVcbiAgICAgICAgbWF4QmF0Y2hpbmdXaW5kb3c6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDApLFxuICAgICAgfSksXG4gICAgKTtcblxuICAgIC8vIExhbWJkYSBmdW5jdGlvbiBmb3IgcXVldWUgbWFuYWdlbWVudCAocmVjZWl2ZXMgcmVxdWVzdHMgYW5kIHB1dHMgdGhlbSBpbiBTUVMpXG4gICAgY29uc3QgZnVsbFZpZGVvUXVldWVMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKFxuICAgICAgdGhpcyxcbiAgICAgICdGdWxsVmlkZW9RdWV1ZUxhbWJkYScsXG4gICAgICB7XG4gICAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxuICAgICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcbiAgICAgICAgICBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vZGlzdC9mdWxsLXZpZGVvLXF1ZXVlJyksXG4gICAgICAgICksXG4gICAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDEpLFxuICAgICAgICBtZW1vcnlTaXplOiAxMjgsXG4gICAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgICAgVklERU9fUVVFVUVfVVJMOiB2aWRlb1F1ZXVlLnF1ZXVlVXJsLFxuICAgICAgICAgIFVTRVJTX1RBQkxFX05BTUU6IHVzZXJzVGFibGUudGFibGVOYW1lLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gTGFtYmRhIGZ1bmN0aW9uIGZvciBKV1QgYXV0aG9yaXphdGlvblxuICAgIGNvbnN0IGp3dEF1dGhvcml6ZXJMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKFxuICAgICAgdGhpcyxcbiAgICAgICdKV1RBdXRob3JpemVyTGFtYmRhJyxcbiAgICAgIHtcbiAgICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXG4gICAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFxuICAgICAgICAgIHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9kaXN0L2p3dC1hdXRob3JpemVyJyksXG4gICAgICAgICksXG4gICAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgICAgbWVtb3J5U2l6ZTogMTI4LFxuICAgICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAgIE5FWFRfUFVCTElDX0NPR05JVE9fVVNFUl9QT09MX0lEOlxuICAgICAgICAgICAgcHJvY2Vzcy5lbnYuTkVYVF9QVUJMSUNfQ09HTklUT19VU0VSX1BPT0xfSUQgfHwgJycsXG4gICAgICAgICAgTkVYVF9QVUJMSUNfQ09HTklUT19DTElFTlRfSUQ6XG4gICAgICAgICAgICBwcm9jZXNzLmVudi5ORVhUX1BVQkxJQ19DT0dOSVRPX0NMSUVOVF9JRCB8fCAnJyxcbiAgICAgICAgICBORVhUX1BVQkxJQ19DT0dOSVRPX1JFR0lPTjpcbiAgICAgICAgICAgIHByb2Nlc3MuZW52Lk5FWFRfUFVCTElDX0NPR05JVE9fUkVHSU9OIHx8ICd1cy1lYXN0LTEnLFxuICAgICAgICAgIFVTRVJTX1RBQkxFX05BTUU6IHVzZXJzVGFibGUudGFibGVOYW1lLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gTGFtYmRhIGZ1bmN0aW9uIGZvciBmZXRjaGluZyB2aWRlb3NcbiAgICBjb25zdCBmZXRjaFZpZGVvc0xhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0ZldGNoVmlkZW9zTGFtYmRhJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2Rpc3QvZmV0Y2gtdmlkZW9zJykpLFxuICAgICAgcm9sZTogbGFtYmRhUm9sZSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDEpLFxuICAgICAgbWVtb3J5U2l6ZTogMTI4LFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgVklERU9fQlVDS0VUX05BTUU6IHZpZGVvQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICAgIFZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FOiB2aWRlb1BhcnRzQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICAgIFVTRVJTX1RBQkxFX05BTUU6IHVzZXJzVGFibGUudGFibGVOYW1lLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIExhbWJkYSBmdW5jdGlvbiBmb3IgZmV0Y2hpbmcgZGF0YSBwcmV2aWV3XG4gICAgY29uc3QgZmV0Y2hEYXRhUHJldmlld0xhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24oXG4gICAgICB0aGlzLFxuICAgICAgJ0ZldGNoRGF0YVByZXZpZXdMYW1iZGEnLFxuICAgICAge1xuICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcbiAgICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXG4gICAgICAgICAgcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2Rpc3QvZmV0Y2gtZGF0YS1wcmV2aWV3JyksXG4gICAgICAgICksXG4gICAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDEpLFxuICAgICAgICBtZW1vcnlTaXplOiAxMjgsXG4gICAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgICAgVklERU9fUEFSVFNfQlVDS0VUX05BTUU6IHZpZGVvUGFydHNCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgICAgICBVU0VSU19UQUJMRV9OQU1FOiB1c2Vyc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIExhbWJkYSBmdW5jdGlvbiBmb3IgdXNlciBtYW5hZ2VtZW50XG4gICAgY29uc3QgZ2V0VXNlckxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0dldFVzZXJMYW1iZGEnLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vZGlzdC9nZXQtdXNlcicpKSxcbiAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcygxKSxcbiAgICAgIG1lbW9yeVNpemU6IDEyOCxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFVTRVJTX1RBQkxFX05BTUU6IHVzZXJzVGFibGUudGFibGVOYW1lLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGNvbnN0IHVwc2VydFVzZXJMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdVcHNlcnRVc2VyTGFtYmRhJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2Rpc3QvdXBzZXJ0LXVzZXInKSksXG4gICAgICByb2xlOiBsYW1iZGFSb2xlLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMSksXG4gICAgICBtZW1vcnlTaXplOiAxMjgsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBVU0VSU19UQUJMRV9OQU1FOiB1c2Vyc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBMYW1iZGEgZnVuY3Rpb24gZm9yIGRlbGV0aW5nIHZpZGVvc1xuICAgIGNvbnN0IGRlbGV0ZVZpZGVvTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnRGVsZXRlVmlkZW9MYW1iZGEnLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vZGlzdC9kZWxldGUtdmlkZW8nKSksXG4gICAgICByb2xlOiBsYW1iZGFSb2xlLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMSksXG4gICAgICBtZW1vcnlTaXplOiAxMjgsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBWSURFT19CVUNLRVRfTkFNRTogdmlkZW9CdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBMYW1iZGEgZnVuY3Rpb24gZm9yIGdlbmVyYXRpbmcgc3RvcnkgYnJlYWtkb3duc1xuICAgIGNvbnN0IGdlbmVyYXRlU3RvcnlCcmVha2Rvd25MYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKFxuICAgICAgdGhpcyxcbiAgICAgICdHZW5lcmF0ZVN0b3J5QnJlYWtkb3duTGFtYmRhJyxcbiAgICAgIHtcbiAgICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXG4gICAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFxuICAgICAgICAgIHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9kaXN0L2dlbmVyYXRlLXN0b3J5LWJyZWFrZG93bicpLFxuICAgICAgICApLFxuICAgICAgICByb2xlOiBsYW1iZGFSb2xlLFxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcygyKSxcbiAgICAgICAgbWVtb3J5U2l6ZTogMjU2LFxuICAgICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAgIE9QRU5BSV9BUElfS0VZOiBvcGVuYWlBcGlLZXksXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBMYW1iZGEgZnVuY3Rpb24gZm9yIGdlbmVyYXRpbmcgYXVkaW8gbmFycmF0aW9uXG4gICAgY29uc3QgZ2VuZXJhdGVBdWRpb0xhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24oXG4gICAgICB0aGlzLFxuICAgICAgJ0dlbmVyYXRlQXVkaW9MYW1iZGEnLFxuICAgICAge1xuICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcbiAgICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXG4gICAgICAgICAgcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2Rpc3QvZ2VuZXJhdGUtYXVkaW8nKSxcbiAgICAgICAgKSxcbiAgICAgICAgcm9sZTogbGFtYmRhUm9sZSxcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICAgIG1lbW9yeVNpemU6IDUxMixcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICBPUEVOQUlfQVBJX0tFWTogb3BlbmFpQXBpS2V5LFxuICAgICAgICAgIFZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FOiB2aWRlb1BhcnRzQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBMYW1iZGEgZnVuY3Rpb24gZm9yIGdlbmVyYXRpbmcgaW1hZ2VzXG4gICAgY29uc3QgZ2VuZXJhdGVJbWFnZXNMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKFxuICAgICAgdGhpcyxcbiAgICAgICdHZW5lcmF0ZUltYWdlc0xhbWJkYScsXG4gICAgICB7XG4gICAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxuICAgICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcbiAgICAgICAgICBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vZGlzdC9nZW5lcmF0ZS1pbWFnZXMnKSxcbiAgICAgICAgKSxcbiAgICAgICAgcm9sZTogbGFtYmRhUm9sZSxcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMTApLFxuICAgICAgICBtZW1vcnlTaXplOiAxMDI0LFxuICAgICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAgIFJVTldBWV9BUElfS0VZOiBydW53YXlBcGlLZXksXG4gICAgICAgICAgVklERU9fUEFSVFNfQlVDS0VUX05BTUU6IHZpZGVvUGFydHNCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIEFQSSBHYXRld2F5IFJFU1QgQVBJXG4gICAgY29uc3QgYXBpID0gbmV3IGFwaWdhdGV3YXkuUmVzdEFwaSh0aGlzLCAnVmlkZW9HZW5lcmF0aW9uQXBpJywge1xuICAgICAgcmVzdEFwaU5hbWU6ICdWaWRlbyBHZW5lcmF0aW9uIEFQSScsXG4gICAgICBkZXNjcmlwdGlvbjogJ0FQSSBmb3IgdmlkZW8gZ2VuZXJhdGlvbiByZXF1ZXN0cycsXG4gICAgICBkZWZhdWx0Q29yc1ByZWZsaWdodE9wdGlvbnM6IHtcbiAgICAgICAgYWxsb3dPcmlnaW5zOiBhcGlnYXRld2F5LkNvcnMuQUxMX09SSUdJTlMsXG4gICAgICAgIGFsbG93TWV0aG9kczogYXBpZ2F0ZXdheS5Db3JzLkFMTF9NRVRIT0RTLFxuICAgICAgICBhbGxvd0hlYWRlcnM6IFsnQ29udGVudC1UeXBlJywgJ0F1dGhvcml6YXRpb24nXSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBMYW1iZGEgaW50ZWdyYXRpb24gZm9yIHRoZSBxdWV1ZSBtYW5hZ2VyXG4gICAgY29uc3QgcXVldWVNYW5hZ2VySW50ZWdyYXRpb24gPSBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihcbiAgICAgIGZ1bGxWaWRlb1F1ZXVlTGFtYmRhLFxuICAgICAge1xuICAgICAgICByZXF1ZXN0VGVtcGxhdGVzOiB7XG4gICAgICAgICAgJ2FwcGxpY2F0aW9uL2pzb24nOiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBib2R5OiBcIiR1dGlsLmVzY2FwZUphdmFTY3JpcHQoJGlucHV0Lmpzb24oJyQnKSlcIixcbiAgICAgICAgICB9KSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIEpXVCBBdXRob3JpemVyXG4gICAgY29uc3Qgand0QXV0aG9yaXplciA9IG5ldyBhcGlnYXRld2F5LlRva2VuQXV0aG9yaXplcihcbiAgICAgIHRoaXMsXG4gICAgICAnSldUQXV0aG9yaXplcicsXG4gICAgICB7XG4gICAgICAgIGhhbmRsZXI6IGp3dEF1dGhvcml6ZXJMYW1iZGEsXG4gICAgICAgIGlkZW50aXR5U291cmNlOiAnbWV0aG9kLnJlcXVlc3QuaGVhZGVyLkF1dGhvcml6YXRpb24nLFxuICAgICAgICBhdXRob3JpemVyTmFtZTogJ0pXVEF1dGhvcml6ZXInLFxuICAgICAgICAvLyBEaXNhYmxlIGNhY2hpbmcgY29tcGxldGVseSBmb3IgZGVidWdnaW5nXG4gICAgICAgIHJlc3VsdHNDYWNoZVR0bDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMCksXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBMYW1iZGEgaW50ZWdyYXRpb24gZm9yIGZldGNoaW5nIHZpZGVvc1xuICAgIGNvbnN0IGZldGNoVmlkZW9zSW50ZWdyYXRpb24gPSBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihcbiAgICAgIGZldGNoVmlkZW9zTGFtYmRhLFxuICAgICAge1xuICAgICAgICByZXF1ZXN0VGVtcGxhdGVzOiB7XG4gICAgICAgICAgJ2FwcGxpY2F0aW9uL2pzb24nOiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBib2R5OiBcIiR1dGlsLmVzY2FwZUphdmFTY3JpcHQoJGlucHV0Lmpzb24oJyQnKSlcIixcbiAgICAgICAgICB9KSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIExhbWJkYSBpbnRlZ3JhdGlvbiBmb3IgZmV0Y2hpbmcgc2NyaXB0c1xuICAgIGNvbnN0IGZldGNoRGF0YVByZXZpZXdJbnRlZ3JhdGlvbiA9IG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKFxuICAgICAgZmV0Y2hEYXRhUHJldmlld0xhbWJkYSxcbiAgICAgIHtcbiAgICAgICAgcmVxdWVzdFRlbXBsYXRlczoge1xuICAgICAgICAgICdhcHBsaWNhdGlvbi9qc29uJzogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgYm9keTogXCIkdXRpbC5lc2NhcGVKYXZhU2NyaXB0KCRpbnB1dC5qc29uKCckJykpXCIsXG4gICAgICAgICAgfSksXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBMYW1iZGEgaW50ZWdyYXRpb24gZm9yIGdldCB1c2VyXG4gICAgY29uc3QgZ2V0VXNlckludGVncmF0aW9uID0gbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oZ2V0VXNlckxhbWJkYSwge1xuICAgICAgcmVxdWVzdFRlbXBsYXRlczoge1xuICAgICAgICAnYXBwbGljYXRpb24vanNvbic6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBxdWVyeVN0cmluZ1BhcmFtZXRlcnM6IHtcbiAgICAgICAgICAgIHVzZXJJZDogXCIkaW5wdXQucGFyYW1zKCd1c2VySWQnKVwiLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIExhbWJkYSBpbnRlZ3JhdGlvbiBmb3IgdXBzZXJ0IHVzZXJcbiAgICBjb25zdCB1cHNlcnRVc2VySW50ZWdyYXRpb24gPSBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihcbiAgICAgIHVwc2VydFVzZXJMYW1iZGEsXG4gICAgICB7XG4gICAgICAgIHJlcXVlc3RUZW1wbGF0ZXM6IHtcbiAgICAgICAgICAnYXBwbGljYXRpb24vanNvbic6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIGJvZHk6IFwiJHV0aWwuZXNjYXBlSmF2YVNjcmlwdCgkaW5wdXQuanNvbignJCcpKVwiLFxuICAgICAgICAgIH0pLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gTGFtYmRhIGludGVncmF0aW9uIGZvciBkZWxldGluZyB2aWRlb3NcbiAgICBjb25zdCBkZWxldGVWaWRlb0ludGVncmF0aW9uID0gbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oXG4gICAgICBkZWxldGVWaWRlb0xhbWJkYSxcbiAgICAgIHtcbiAgICAgICAgcmVxdWVzdFRlbXBsYXRlczoge1xuICAgICAgICAgICdhcHBsaWNhdGlvbi9qc29uJzogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgcXVlcnlTdHJpbmdQYXJhbWV0ZXJzOiB7XG4gICAgICAgICAgICAgIHRpbWVzdGFtcDogXCIkaW5wdXQucGFyYW1zKCd0aW1lc3RhbXAnKVwiLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIExhbWJkYSBpbnRlZ3JhdGlvbiBmb3IgZ2VuZXJhdGluZyBzdG9yeSBicmVha2Rvd25zXG4gICAgY29uc3QgZ2VuZXJhdGVTdG9yeUJyZWFrZG93bkludGVncmF0aW9uID0gbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oXG4gICAgICBnZW5lcmF0ZVN0b3J5QnJlYWtkb3duTGFtYmRhLFxuICAgICAge1xuICAgICAgICByZXF1ZXN0VGVtcGxhdGVzOiB7XG4gICAgICAgICAgJ2FwcGxpY2F0aW9uL2pzb24nOiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBib2R5OiBcIiR1dGlsLmVzY2FwZUphdmFTY3JpcHQoJGlucHV0Lmpzb24oJyQnKSlcIixcbiAgICAgICAgICB9KSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIExhbWJkYSBpbnRlZ3JhdGlvbiBmb3IgZ2VuZXJhdGluZyBhdWRpbyBuYXJyYXRpb25cbiAgICBjb25zdCBnZW5lcmF0ZUF1ZGlvSW50ZWdyYXRpb24gPSBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihcbiAgICAgIGdlbmVyYXRlQXVkaW9MYW1iZGEsXG4gICAgICB7XG4gICAgICAgIHJlcXVlc3RUZW1wbGF0ZXM6IHtcbiAgICAgICAgICAnYXBwbGljYXRpb24vanNvbic6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIGJvZHk6IFwiJHV0aWwuZXNjYXBlSmF2YVNjcmlwdCgkaW5wdXQuanNvbignJCcpKVwiLFxuICAgICAgICAgIH0pLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gTGFtYmRhIGludGVncmF0aW9uIGZvciBnZW5lcmF0aW5nIGltYWdlc1xuICAgIGNvbnN0IGdlbmVyYXRlSW1hZ2VzSW50ZWdyYXRpb24gPSBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihcbiAgICAgIGdlbmVyYXRlSW1hZ2VzTGFtYmRhLFxuICAgICAge1xuICAgICAgICByZXF1ZXN0VGVtcGxhdGVzOiB7XG4gICAgICAgICAgJ2FwcGxpY2F0aW9uL2pzb24nOiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBib2R5OiBcIiR1dGlsLmVzY2FwZUphdmFTY3JpcHQoJGlucHV0Lmpzb24oJyQnKSlcIixcbiAgICAgICAgICB9KSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIENyZWF0ZSBBUEkgcmVzb3VyY2VzIGFuZCBtZXRob2RzIHdpdGggSldUIGF1dGhvcml6YXRpb25cbiAgICBjb25zdCB2aWRlb1Jlc291cmNlID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ2dlbmVyYXRlLXZpZGVvJyk7XG4gICAgdmlkZW9SZXNvdXJjZS5hZGRNZXRob2QoJ1BPU1QnLCBxdWV1ZU1hbmFnZXJJbnRlZ3JhdGlvbiwge1xuICAgICAgYXV0aG9yaXplcjogand0QXV0aG9yaXplcixcbiAgICB9KTtcblxuICAgIGNvbnN0IGZldGNoVmlkZW9zUmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZSgnZmV0Y2gtdmlkZW9zJyk7XG4gICAgZmV0Y2hWaWRlb3NSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIGZldGNoVmlkZW9zSW50ZWdyYXRpb24sIHtcbiAgICAgIGF1dGhvcml6ZXI6IGp3dEF1dGhvcml6ZXIsXG4gICAgfSk7XG5cbiAgICBjb25zdCBmZXRjaERhdGFQcmV2aWV3UmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZSgnZmV0Y2gtZGF0YS1wcmV2aWV3Jyk7XG4gICAgZmV0Y2hEYXRhUHJldmlld1Jlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgZmV0Y2hEYXRhUHJldmlld0ludGVncmF0aW9uLCB7XG4gICAgICBhdXRob3JpemVyOiBqd3RBdXRob3JpemVyLFxuICAgIH0pO1xuXG4gICAgY29uc3QgZ2VuZXJhdGVTdG9yeUJyZWFrZG93blJlc291cmNlID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoXG4gICAgICAnZ2VuZXJhdGUtc3RvcnktYnJlYWtkb3duJyxcbiAgICApO1xuICAgIGdlbmVyYXRlU3RvcnlCcmVha2Rvd25SZXNvdXJjZS5hZGRNZXRob2QoXG4gICAgICAnUE9TVCcsXG4gICAgICBnZW5lcmF0ZVN0b3J5QnJlYWtkb3duSW50ZWdyYXRpb24sXG4gICAgICB7XG4gICAgICAgIGF1dGhvcml6ZXI6IGp3dEF1dGhvcml6ZXIsXG4gICAgICB9LFxuICAgICk7XG5cbiAgICBjb25zdCBnZW5lcmF0ZUF1ZGlvUmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZSgnZ2VuZXJhdGUtYXVkaW8nKTtcbiAgICBnZW5lcmF0ZUF1ZGlvUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgZ2VuZXJhdGVBdWRpb0ludGVncmF0aW9uLCB7XG4gICAgICBhdXRob3JpemVyOiBqd3RBdXRob3JpemVyLFxuICAgIH0pO1xuXG4gICAgY29uc3QgZ2VuZXJhdGVJbWFnZXNSZXNvdXJjZSA9IGFwaS5yb290LmFkZFJlc291cmNlKCdnZW5lcmF0ZS1pbWFnZXMnKTtcbiAgICBnZW5lcmF0ZUltYWdlc1Jlc291cmNlLmFkZE1ldGhvZCgnUE9TVCcsIGdlbmVyYXRlSW1hZ2VzSW50ZWdyYXRpb24sIHtcbiAgICAgIGF1dGhvcml6ZXI6IGp3dEF1dGhvcml6ZXIsXG4gICAgfSk7XG5cbiAgICBjb25zdCB1c2VyTWFuYWdlbWVudFJlc291cmNlID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ3VzZXInKTtcbiAgICB1c2VyTWFuYWdlbWVudFJlc291cmNlLmFkZE1ldGhvZCgnUE9TVCcsIHVwc2VydFVzZXJJbnRlZ3JhdGlvbiwge1xuICAgICAgYXV0aG9yaXplcjogand0QXV0aG9yaXplcixcbiAgICB9KTtcblxuICAgIC8vIEFkZCBHRVQgbWV0aG9kIHdpdGggcXVlcnkgcGFyYW1ldGVyc1xuICAgIHVzZXJNYW5hZ2VtZW50UmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBnZXRVc2VySW50ZWdyYXRpb24sIHtcbiAgICAgIGF1dGhvcml6ZXI6IGp3dEF1dGhvcml6ZXIsXG4gICAgICByZXF1ZXN0UGFyYW1ldGVyczoge1xuICAgICAgICAnbWV0aG9kLnJlcXVlc3QucXVlcnlzdHJpbmcudXNlcklkJzogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBjb25zdCBkZWxldGVWaWRlb1Jlc291cmNlID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ2RlbGV0ZS12aWRlbycpO1xuICAgIGRlbGV0ZVZpZGVvUmVzb3VyY2UuYWRkTWV0aG9kKCdERUxFVEUnLCBkZWxldGVWaWRlb0ludGVncmF0aW9uLCB7XG4gICAgICBhdXRob3JpemVyOiBqd3RBdXRob3JpemVyLFxuICAgICAgcmVxdWVzdFBhcmFtZXRlcnM6IHtcbiAgICAgICAgJ21ldGhvZC5yZXF1ZXN0LnF1ZXJ5c3RyaW5nLnRpbWVzdGFtcCc6IHRydWUsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQ2xvdWRXYXRjaCBMb2cgR3JvdXAgZm9yIExhbWJkYVxuICAgIG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdWaWRlb0dlbmVyYXRpb25Mb2dHcm91cCcsIHtcbiAgICAgIGxvZ0dyb3VwTmFtZTogYC9hd3MvbGFtYmRhLyR7dmlkZW9HZW5lcmF0aW9uTGFtYmRhLmZ1bmN0aW9uTmFtZX1gLFxuICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgIH0pO1xuXG4gICAgbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ0Z1bGxWaWRlb1F1ZXVlTG9nR3JvdXAnLCB7XG4gICAgICBsb2dHcm91cE5hbWU6IGAvYXdzL2xhbWJkYS8ke2Z1bGxWaWRlb1F1ZXVlTGFtYmRhLmZ1bmN0aW9uTmFtZX1gLFxuICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgIH0pO1xuXG4gICAgbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ0ZldGNoVmlkZW9zTG9nR3JvdXAnLCB7XG4gICAgICBsb2dHcm91cE5hbWU6IGAvYXdzL2xhbWJkYS8ke2ZldGNoVmlkZW9zTGFtYmRhLmZ1bmN0aW9uTmFtZX1gLFxuICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgIH0pO1xuXG4gICAgbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ0ZldGNoRGF0YVByZXZpZXdMb2dHcm91cCcsIHtcbiAgICAgIGxvZ0dyb3VwTmFtZTogYC9hd3MvbGFtYmRhLyR7ZmV0Y2hEYXRhUHJldmlld0xhbWJkYS5mdW5jdGlvbk5hbWV9YCxcbiAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICB9KTtcblxuICAgIG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdHZXRVc2VyTG9nR3JvdXAnLCB7XG4gICAgICBsb2dHcm91cE5hbWU6IGAvYXdzL2xhbWJkYS8ke2dldFVzZXJMYW1iZGEuZnVuY3Rpb25OYW1lfWAsXG4gICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSyxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgfSk7XG5cbiAgICBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnVXBzZXJ0VXNlckxvZ0dyb3VwJywge1xuICAgICAgbG9nR3JvdXBOYW1lOiBgL2F3cy9sYW1iZGEvJHt1cHNlcnRVc2VyTGFtYmRhLmZ1bmN0aW9uTmFtZX1gLFxuICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgIH0pO1xuXG4gICAgbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ0RlbGV0ZVZpZGVvTG9nR3JvdXAnLCB7XG4gICAgICBsb2dHcm91cE5hbWU6IGAvYXdzL2xhbWJkYS8ke2RlbGV0ZVZpZGVvTGFtYmRhLmZ1bmN0aW9uTmFtZX1gLFxuICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgIH0pO1xuXG4gICAgbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ0pXVEF1dGhvcml6ZXJMb2dHcm91cCcsIHtcbiAgICAgIGxvZ0dyb3VwTmFtZTogYC9hd3MvbGFtYmRhLyR7and0QXV0aG9yaXplckxhbWJkYS5mdW5jdGlvbk5hbWV9YCxcbiAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICB9KTtcblxuICAgIC8vIE91dHB1dHNcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVmlkZW9CdWNrZXROYW1lJywge1xuICAgICAgdmFsdWU6IHZpZGVvQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ1MzIEJ1Y2tldCBmb3Igc3RvcmluZyB2aWRlb3MnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1ZpZGVvUGFydHNCdWNrZXROYW1lJywge1xuICAgICAgdmFsdWU6IHZpZGVvUGFydHNCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUzMgQnVja2V0IGZvciBzdG9yaW5nIHZpZGVvIHBhcnRzJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdWaWRlb0dlbmVyYXRpb25MYW1iZGFBcm4nLCB7XG4gICAgICB2YWx1ZTogdmlkZW9HZW5lcmF0aW9uTGFtYmRhLmZ1bmN0aW9uQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdMYW1iZGEgZnVuY3Rpb24gQVJOIGZvciB2aWRlbyBnZW5lcmF0aW9uJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdWaWRlb0dlbmVyYXRpb25MYW1iZGFOYW1lJywge1xuICAgICAgdmFsdWU6IHZpZGVvR2VuZXJhdGlvbkxhbWJkYS5mdW5jdGlvbk5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ0xhbWJkYSBmdW5jdGlvbiBuYW1lIGZvciB2aWRlbyBnZW5lcmF0aW9uJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdGdWxsVmlkZW9RdWV1ZUxhbWJkYUFybicsIHtcbiAgICAgIHZhbHVlOiBmdWxsVmlkZW9RdWV1ZUxhbWJkYS5mdW5jdGlvbkFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnTGFtYmRhIGZ1bmN0aW9uIEFSTiBmb3IgcXVldWUgbWFuYWdlbWVudCcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRmV0Y2hWaWRlb3NMYW1iZGFBcm4nLCB7XG4gICAgICB2YWx1ZTogZmV0Y2hWaWRlb3NMYW1iZGEuZnVuY3Rpb25Bcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ0xhbWJkYSBmdW5jdGlvbiBBUk4gZm9yIGZldGNoaW5nIHZpZGVvcycsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRmV0Y2hWaWRlb3NMYW1iZGFOYW1lJywge1xuICAgICAgdmFsdWU6IGZldGNoVmlkZW9zTGFtYmRhLmZ1bmN0aW9uTmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnTGFtYmRhIGZ1bmN0aW9uIG5hbWUgZm9yIGZldGNoaW5nIHZpZGVvcycsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnR2V0VXNlckxhbWJkYUFybicsIHtcbiAgICAgIHZhbHVlOiBnZXRVc2VyTGFtYmRhLmZ1bmN0aW9uQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdMYW1iZGEgZnVuY3Rpb24gQVJOIGZvciBnZXQgdXNlcicsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnR2V0VXNlckxhbWJkYU5hbWUnLCB7XG4gICAgICB2YWx1ZTogZ2V0VXNlckxhbWJkYS5mdW5jdGlvbk5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ0xhbWJkYSBmdW5jdGlvbiBuYW1lIGZvciBnZXQgdXNlcicsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVXBzZXJ0VXNlckxhbWJkYUFybicsIHtcbiAgICAgIHZhbHVlOiB1cHNlcnRVc2VyTGFtYmRhLmZ1bmN0aW9uQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdMYW1iZGEgZnVuY3Rpb24gQVJOIGZvciB1cHNlcnQgdXNlcicsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVXBzZXJ0VXNlckxhbWJkYU5hbWUnLCB7XG4gICAgICB2YWx1ZTogdXBzZXJ0VXNlckxhbWJkYS5mdW5jdGlvbk5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ0xhbWJkYSBmdW5jdGlvbiBuYW1lIGZvciB1cHNlcnQgdXNlcicsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnSldUQXV0aG9yaXplckxhbWJkYUFybicsIHtcbiAgICAgIHZhbHVlOiBqd3RBdXRob3JpemVyTGFtYmRhLmZ1bmN0aW9uQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdMYW1iZGEgZnVuY3Rpb24gQVJOIGZvciBKV1QgYXV0aG9yaXphdGlvbicsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnSldUQXV0aG9yaXplckxhbWJkYU5hbWUnLCB7XG4gICAgICB2YWx1ZTogand0QXV0aG9yaXplckxhbWJkYS5mdW5jdGlvbk5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ0xhbWJkYSBmdW5jdGlvbiBuYW1lIGZvciBKV1QgYXV0aG9yaXphdGlvbicsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVmlkZW9RdWV1ZVVybCcsIHtcbiAgICAgIHZhbHVlOiB2aWRlb1F1ZXVlLnF1ZXVlVXJsLFxuICAgICAgZGVzY3JpcHRpb246ICdTUVMgUXVldWUgVVJMIGZvciB2aWRlbyBnZW5lcmF0aW9uJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBcGlHYXRld2F5VXJsJywge1xuICAgICAgdmFsdWU6IGFwaS51cmwsXG4gICAgICBkZXNjcmlwdGlvbjogJ0FQSSBHYXRld2F5IFVSTCBmb3IgdmlkZW8gZ2VuZXJhdGlvbicsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQXBpR2F0ZXdheUVuZHBvaW50Jywge1xuICAgICAgdmFsdWU6IGAke2FwaS51cmx9Z2VuZXJhdGUtdmlkZW9gLFxuICAgICAgZGVzY3JpcHRpb246ICdBUEkgR2F0ZXdheSBlbmRwb2ludCBmb3IgdmlkZW8gZ2VuZXJhdGlvbicsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRmV0Y2hWaWRlb3NFbmRwb2ludCcsIHtcbiAgICAgIHZhbHVlOiBgJHthcGkudXJsfWZldGNoLXZpZGVvc2AsXG4gICAgICBkZXNjcmlwdGlvbjogJ0FQSSBHYXRld2F5IGVuZHBvaW50IGZvciBmZXRjaGluZyB2aWRlb3MnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1VzZXJNYW5hZ2VtZW50RW5kcG9pbnQnLCB7XG4gICAgICB2YWx1ZTogYCR7YXBpLnVybH11c2VyYCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVBJIEdhdGV3YXkgZW5kcG9pbnQgZm9yIHVzZXIgbWFuYWdlbWVudCcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVXNlcnNUYWJsZU5hbWUnLCB7XG4gICAgICB2YWx1ZTogdXNlcnNUYWJsZS50YWJsZU5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ0R5bmFtb0RCIHRhYmxlIG5hbWUgZm9yIHVzZXJzJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdVc2Vyc1RhYmxlQXJuJywge1xuICAgICAgdmFsdWU6IHVzZXJzVGFibGUudGFibGVBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ0R5bmFtb0RCIHRhYmxlIEFSTiBmb3IgdXNlcnMnLFxuICAgIH0pO1xuICB9XG59XG4iXX0=