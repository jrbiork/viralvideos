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
const apigatewayv2 = require("aws-cdk-lib/aws-apigatewayv2");
const apigatewayv2Integrations = require("aws-cdk-lib/aws-apigatewayv2-integrations");
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
        const geminiApiKey = process.env.GEMINI_API_KEY || '';
        const websocketDomainName = process.env.WEBSOCKET_DOMAIN_NAME || '';
        const websocketEnv = process.env.WEBSOCKET_STAGE || '';
        if (!websocketDomainName) {
            console.warn('⚠️  WEBSOCKET_DOMAIN_NAME is not set. WebSocket may fail.');
        }
        if (!websocketEnv) {
            console.warn('⚠️  WEBSOCKET_STAGE is not set. WebSocket may fail.');
        }
        // Validate API keys
        if (!runwayApiKey) {
            console.warn('⚠️  RUNWAY_API_KEY is not set. Video generation may fail.');
        }
        if (!openaiApiKey) {
            console.warn('⚠️  OPENAI_API_KEY is not set. Video generation may fail.');
        }
        if (!geminiApiKey) {
            console.warn('⚠️  GEMINI_API_KEY is not set. Image generation may fail.');
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
                    noncurrentVersionExpiration: cdk.Duration.days(15),
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
                    noncurrentVersionExpiration: cdk.Duration.days(15),
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
        // DynamoDB WebSocket Connections Table
        const websocketConnectionsTable = new dynamodb.Table(this, 'WebSocketConnectionsTable', {
            tableName: 'viral-videos-websocket-connections',
            partitionKey: {
                name: 'connectionId',
                type: dynamodb.AttributeType.STRING,
            },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.DESTROY, // For demo purposes
            timeToLiveAttribute: 'ttl', // Auto-delete expired connections
        });
        // Add GSI for userId lookups
        websocketConnectionsTable.addGlobalSecondaryIndex({
            indexName: 'UserIdIndex',
            partitionKey: {
                name: 'userId',
                type: dynamodb.AttributeType.STRING,
            },
            projectionType: dynamodb.ProjectionType.ALL,
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
        websocketConnectionsTable.grantReadWriteData(lambdaRole);
        // Create FFmpeg Lambda Layer
        const ffmpegLayer = new lambda.LayerVersion(this, 'FFmpegLayer', {
            code: lambda.Code.fromAsset(path.join(__dirname, '../layers/ffmpeg-layer')),
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
            logGroup: new logs.LogGroup(this, 'VideoGenerationLambdaLogGroup', {
                retention: logs.RetentionDays.ONE_WEEK,
            }),
            layers: [ffmpegLayer],
            environment: {
                VIDEO_BUCKET_NAME: videoBucket.bucketName,
                VIDEO_PARTS_BUCKET_NAME: videoPartsBucket.bucketName,
                USERS_TABLE_NAME: usersTable.tableName,
                RUNWAY_API_KEY: runwayApiKey,
                OPENAI_API_KEY: openaiApiKey,
                GEMINI_API_KEY: geminiApiKey,
                VIDEO_QUEUE_URL: videoQueue.queueUrl,
                PATH: '/opt/bin:/usr/local/bin:/usr/bin/:/bin',
                FONTCONFIG_PATH: '/opt/etc/fonts',
                FONTCONFIG_FILE: '/opt/etc/fonts/fonts.conf',
                WEBSOCKET_DOMAIN_NAME: websocketDomainName,
                WEBSOCKET_STAGE: websocketEnv,
                WEBSOCKET_CONNECTIONS_TABLE_NAME: websocketConnectionsTable.tableName,
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
            code: lambda.Code.fromAsset(path.join(__dirname, '../dist/video-queue')),
            role: lambdaRole,
            timeout: cdk.Duration.minutes(1),
            memorySize: 128,
            logGroup: new logs.LogGroup(this, 'FullVideoQueueLambdaLogGroup', {
                retention: logs.RetentionDays.ONE_WEEK,
            }),
            environment: {
                VIDEO_QUEUE_URL: videoQueue.queueUrl,
                USERS_TABLE_NAME: usersTable.tableName,
            },
        });
        // Create a separate role for JWT authorizer to avoid circular dependencies
        const jwtAuthorizerRole = new iam.Role(this, 'JWTAuthorizerRole', {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
            ],
        });
        // Grant DynamoDB permissions to JWT authorizer
        usersTable.grantReadData(jwtAuthorizerRole);
        // Lambda function for JWT authorization
        const jwtAuthorizerLambda = new lambda.Function(this, 'JWTAuthorizerLambda', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../dist/jwt-authorizer')),
            role: jwtAuthorizerRole,
            timeout: cdk.Duration.seconds(30),
            memorySize: 128,
            logGroup: new logs.LogGroup(this, 'JWTAuthorizerLambdaLogGroup', {
                retention: logs.RetentionDays.ONE_WEEK,
            }),
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
            logGroup: new logs.LogGroup(this, 'FetchVideosLambdaLogGroup', {
                retention: logs.RetentionDays.ONE_WEEK,
            }),
            environment: {
                VIDEO_BUCKET_NAME: videoBucket.bucketName,
                VIDEO_PARTS_BUCKET_NAME: videoPartsBucket.bucketName,
                USERS_TABLE_NAME: usersTable.tableName,
            },
        });
        // Lambda function for fetching preview data
        const fetchPreviewLambda = new lambda.Function(this, 'FetchPreviewLambda', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../dist/fetch-preview')),
            role: lambdaRole,
            timeout: cdk.Duration.minutes(1),
            memorySize: 128,
            logGroup: new logs.LogGroup(this, 'FetchPreviewLambdaLogGroup', {
                retention: logs.RetentionDays.ONE_WEEK,
            }),
            environment: {
                VIDEO_BUCKET_NAME: videoBucket.bucketName,
                VIDEO_PARTS_BUCKET_NAME: videoPartsBucket.bucketName,
                URL_TTL_SECONDS: '36000',
                MAX_SCENES: '10',
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
            logGroup: new logs.LogGroup(this, 'GetUserLambdaLogGroup', {
                retention: logs.RetentionDays.ONE_WEEK,
            }),
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
            logGroup: new logs.LogGroup(this, 'UpsertUserLambdaLogGroup', {
                retention: logs.RetentionDays.ONE_WEEK,
            }),
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
            logGroup: new logs.LogGroup(this, 'DeleteVideoLambdaLogGroup', {
                retention: logs.RetentionDays.ONE_WEEK,
            }),
            environment: {
                VIDEO_BUCKET_NAME: videoBucket.bucketName,
                VIDEO_PARTS_BUCKET_NAME: videoPartsBucket.bucketName,
            },
        });
        // Lambda function for generating audio narration
        const generateAudioSubtitleLambda = new lambda.Function(this, 'GenerateAudioSubtitleLambda', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../dist/generate-audio-subtitle')),
            role: lambdaRole,
            timeout: cdk.Duration.minutes(5),
            memorySize: 512,
            logGroup: new logs.LogGroup(this, 'GenerateAudioSubtitleLambdaLogGroup', {
                retention: logs.RetentionDays.ONE_WEEK,
            }),
            environment: {
                OPENAI_API_KEY: openaiApiKey,
                VIDEO_PARTS_BUCKET_NAME: videoPartsBucket.bucketName,
                WEBSOCKET_DOMAIN_NAME: websocketDomainName,
                WEBSOCKET_STAGE: websocketEnv,
                WEBSOCKET_CONNECTIONS_TABLE_NAME: websocketConnectionsTable.tableName,
            },
        });
        // Lambda function for generating images
        const generateImageLambda = new lambda.Function(this, 'GenerateImageLambda', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../dist/generate-image')),
            role: lambdaRole,
            timeout: cdk.Duration.minutes(5),
            memorySize: 512,
            logGroup: new logs.LogGroup(this, 'GenerateImageLambdaLogGroup', {
                retention: logs.RetentionDays.ONE_WEEK,
            }),
            environment: {
                RUNWAY_API_KEY: runwayApiKey,
                GEMINI_API_KEY: geminiApiKey,
                VIDEO_PARTS_BUCKET_NAME: videoPartsBucket.bucketName,
                WEBSOCKET_DOMAIN_NAME: websocketDomainName,
                WEBSOCKET_STAGE: websocketEnv,
                WEBSOCKET_CONNECTIONS_TABLE_NAME: websocketConnectionsTable.tableName,
            },
        });
        // Lambda function for animating an image into video
        const animateImageLambda = new lambda.Function(this, 'AnimateImageLambda', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../dist/animate-image')),
            role: lambdaRole,
            timeout: cdk.Duration.minutes(5),
            memorySize: 512,
            logGroup: new logs.LogGroup(this, 'AnimateImageLambdaLogGroup', {
                retention: logs.RetentionDays.ONE_WEEK,
            }),
            environment: {
                RUNWAY_API_KEY: runwayApiKey,
                GEMINI_API_KEY: geminiApiKey,
                VIDEO_PARTS_BUCKET_NAME: videoPartsBucket.bucketName,
                WEBSOCKET_DOMAIN_NAME: websocketDomainName,
                WEBSOCKET_STAGE: websocketEnv,
                WEBSOCKET_CONNECTIONS_TABLE_NAME: websocketConnectionsTable.tableName,
                VIDEO_QUEUE_URL: videoQueue.queueUrl,
            },
        });
        // Lambda function for saving images
        const saveImageLambda = new lambda.Function(this, 'SaveImageLambda', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../dist/save-image')),
            role: lambdaRole,
            timeout: cdk.Duration.minutes(2),
            memorySize: 512,
            logGroup: new logs.LogGroup(this, 'SaveImageLambdaLogGroup', {
                retention: logs.RetentionDays.ONE_WEEK,
            }),
            environment: {
                VIDEO_PARTS_BUCKET_NAME: videoPartsBucket.bucketName,
                WEBSOCKET_DOMAIN_NAME: websocketDomainName,
                WEBSOCKET_STAGE: websocketEnv,
                WEBSOCKET_CONNECTIONS_TABLE_NAME: websocketConnectionsTable.tableName,
                VIDEO_QUEUE_URL: videoQueue.queueUrl,
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
        // Lambda integration for fetching preview data
        const fetchPreviewIntegration = new apigateway.LambdaIntegration(fetchPreviewLambda, {
            requestTemplates: {
                'application/json': JSON.stringify({
                    queryStringParameters: {
                        timestamp: "$input.params('timestamp')",
                    },
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
        // WebSocket Lambda Functions
        const websocketConnectLambda = new lambda.Function(this, 'WebSocketConnectLambda', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../dist/websocket-connect')),
            role: lambdaRole,
            timeout: cdk.Duration.seconds(30),
            memorySize: 128,
            logGroup: new logs.LogGroup(this, 'WebSocketConnectLambdaLogGroup', {
                retention: logs.RetentionDays.ONE_WEEK,
            }),
            environment: {
                WEBSOCKET_CONNECTIONS_TABLE_NAME: websocketConnectionsTable.tableName,
                USERS_TABLE_NAME: usersTable.tableName,
                COGNITO_USER_POOL_ID: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || '',
                COGNITO_CLIENT_ID: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || '',
                COGNITO_REGION: process.env.NEXT_PUBLIC_COGNITO_REGION || 'us-east-1',
                JWT_AUTHORIZER_LAMBDA_ARN: jwtAuthorizerLambda.functionArn,
            },
        });
        // Grant WebSocket connect lambda permission to invoke JWT authorizer
        // Add permission directly to the lambda role to avoid circular dependency
        lambdaRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['lambda:InvokeFunction'],
            resources: [jwtAuthorizerLambda.functionArn],
        }));
        const websocketDisconnectLambda = new lambda.Function(this, 'WebSocketDisconnectLambda', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../dist/websocket-disconnect')),
            role: lambdaRole,
            timeout: cdk.Duration.seconds(30),
            memorySize: 128,
            logGroup: new logs.LogGroup(this, 'WebSocketDisconnectLambdaLogGroup', {
                retention: logs.RetentionDays.ONE_WEEK,
            }),
            environment: {
                WEBSOCKET_CONNECTIONS_TABLE_NAME: websocketConnectionsTable.tableName,
            },
        });
        const websocketMessageLambda = new lambda.Function(this, 'WebSocketMessageLambda', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../dist/websocket-message')),
            role: lambdaRole,
            timeout: cdk.Duration.seconds(30),
            memorySize: 128,
            logGroup: new logs.LogGroup(this, 'WebSocketMessageLambdaLogGroup', {
                retention: logs.RetentionDays.ONE_WEEK,
            }),
            environment: {
                WEBSOCKET_CONNECTIONS_TABLE_NAME: websocketConnectionsTable.tableName,
                USERS_TABLE_NAME: usersTable.tableName,
            },
        });
        // WebSocket broadcast lambda for broadcasting messages to all connected clients
        const websocketBroadcastLambda = new lambda.Function(this, 'WebSocketBroadcastLambda', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../dist/websocket-broadcast')),
            role: lambdaRole,
            timeout: cdk.Duration.seconds(30),
            memorySize: 128,
            logGroup: new logs.LogGroup(this, 'WebSocketBroadcastLambdaLogGroup', {
                retention: logs.RetentionDays.ONE_WEEK,
            }),
            environment: {
                WEBSOCKET_CONNECTIONS_TABLE_NAME: websocketConnectionsTable.tableName,
            },
        });
        // Lambda for resolving share tokens
        const shareResolveLambda = new lambda.Function(this, 'ShareResolveLambda', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../dist/share-resolve')),
            role: lambdaRole,
            timeout: cdk.Duration.seconds(30),
            memorySize: 128,
            logGroup: new logs.LogGroup(this, 'ShareResolveLambdaLogGroup', {
                retention: logs.RetentionDays.ONE_WEEK,
            }),
            environment: {
                VIDEO_BUCKET_NAME: videoBucket.bucketName,
                VIDEO_PARTS_BUCKET_NAME: videoPartsBucket.bucketName,
            },
        });
        // WebSocket API Gateway v2
        const websocketApi = new apigatewayv2.WebSocketApi(this, 'WebSocketApi', {
            apiName: 'Viral Videos WebSocket API',
            description: 'WebSocket API for real-time video generation updates',
            connectRouteOptions: {
                integration: new apigatewayv2Integrations.WebSocketLambdaIntegration('ConnectHandler', websocketConnectLambda),
            },
            disconnectRouteOptions: {
                integration: new apigatewayv2Integrations.WebSocketLambdaIntegration('DisconnectHandler', websocketDisconnectLambda),
            },
            defaultRouteOptions: {
                integration: new apigatewayv2Integrations.WebSocketLambdaIntegration('MessageHandler', websocketMessageLambda),
            },
        });
        const websocketStage = new apigatewayv2.WebSocketStage(this, 'WebSocketStage', {
            webSocketApi: websocketApi,
            stageName: 'prod',
            autoDeploy: true,
        });
        // Grant WebSocket API permissions to Lambda functions
        lambdaRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['execute-api:ManageConnections'],
            resources: [
                `arn:aws:execute-api:${this.region}:${this.account}:${websocketApi.apiId}/*`,
            ],
        }));
        // Lambda integration for generating audio and subtitles
        const generateAudioSubtitleIntegration = new apigateway.LambdaIntegration(generateAudioSubtitleLambda, {
            requestTemplates: {
                'application/json': JSON.stringify({
                    body: "$util.escapeJavaScript($input.json('$'))",
                }),
            },
        });
        // Lambda integration for generating images
        const generateImageIntegration = new apigateway.LambdaIntegration(generateImageLambda, {
            requestTemplates: {
                'application/json': JSON.stringify({
                    body: "$util.escapeJavaScript($input.json('$'))",
                }),
            },
        });
        // Lambda integration for saving images
        const saveImageIntegration = new apigateway.LambdaIntegration(saveImageLambda, {
            requestTemplates: {
                'application/json': JSON.stringify({
                    body: "$util.escapeJavaScript($input.json('$'))",
                }),
            },
        });
        // Lambda integration for WebSocket broadcasting
        const websocketBroadcastIntegration = new apigateway.LambdaIntegration(websocketBroadcastLambda, {
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
        const fetchPreviewResource = api.root.addResource('fetch-preview');
        fetchPreviewResource.addMethod('GET', fetchPreviewIntegration, {
            authorizer: jwtAuthorizer,
            requestParameters: {
                'method.request.querystring.timestamp': true,
            },
        });
        const generateAudioSubtitleResource = api.root.addResource('generate-audio-subtitle');
        generateAudioSubtitleResource.addMethod('POST', generateAudioSubtitleIntegration, {
            authorizer: jwtAuthorizer,
        });
        const generateImageResource = api.root.addResource('generate-image');
        generateImageResource.addMethod('POST', generateImageIntegration, {
            authorizer: jwtAuthorizer,
        });
        // Lambda integration for animate-image
        const animateImageIntegration = new apigateway.LambdaIntegration(animateImageLambda, {
            requestTemplates: {
                'application/json': JSON.stringify({
                    body: "$util.escapeJavaScript($input.json('$'))",
                    queryString: '$input.params().querystring',
                }),
            },
        });
        const animateImageResource = api.root.addResource('animate-image');
        animateImageResource.addMethod('POST', animateImageIntegration, {
            authorizer: jwtAuthorizer,
            requestParameters: {
                'method.request.querystring.timestamp': true,
            },
        });
        const saveImageResource = api.root.addResource('save-image');
        saveImageResource.addMethod('POST', saveImageIntegration, {
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
        const websocketBroadcastResource = api.root.addResource('websocket-broadcast');
        websocketBroadcastResource.addMethod('POST', websocketBroadcastIntegration, {
            authorizer: jwtAuthorizer,
        });
        // Public share resolve endpoint (no auth)
        const shareResource = api.root.addResource('s');
        const shareTokenResource = shareResource.addResource('{token}');
        const shareResolveIntegration = new apigateway.LambdaIntegration(shareResolveLambda, {
            requestTemplates: {
                'application/json': JSON.stringify({
                    pathParameters: {
                        token: "$input.params('token')",
                    },
                }),
            },
        });
        shareTokenResource.addMethod('GET', shareResolveIntegration, {
        // intentionally unauthenticated
        });
    }
}
exports.ViralVideosStack = ViralVideosStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlyYWwtdmlkZW9zLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidmlyYWwtdmlkZW9zLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG1DQUFtQztBQUVuQyx5Q0FBeUM7QUFDekMsaURBQWlEO0FBQ2pELDJDQUEyQztBQUMzQyw2Q0FBNkM7QUFDN0MsMkNBQTJDO0FBQzNDLDJFQUEyRTtBQUMzRSx5REFBeUQ7QUFDekQsNkRBQTZEO0FBQzdELHNGQUFzRjtBQUN0RixxREFBcUQ7QUFDckQsNkJBQTZCO0FBQzdCLGlDQUFpQztBQUVqQyw0Q0FBNEM7QUFDNUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxTQUFTLENBQUMsRUFBRSxDQUFDLENBQUM7QUFFekQsTUFBYSxnQkFBaUIsU0FBUSxHQUFHLENBQUMsS0FBSztJQUM3QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXNCO1FBQzlELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLDhCQUE4QjtRQUM5QixNQUFNLFlBQVksR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWMsSUFBSSxFQUFFLENBQUM7UUFDdEQsTUFBTSxZQUFZLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLElBQUksRUFBRSxDQUFDO1FBQ3RELE1BQU0sWUFBWSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBYyxJQUFJLEVBQUUsQ0FBQztRQUV0RCxNQUFNLG1CQUFtQixHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMscUJBQXFCLElBQUksRUFBRSxDQUFDO1FBQ3BFLE1BQU0sWUFBWSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZSxJQUFJLEVBQUUsQ0FBQztRQUV2RCxJQUFJLENBQUMsbUJBQW1CLEVBQUUsQ0FBQztZQUN6QixPQUFPLENBQUMsSUFB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ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIGxvZ3MgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxvZ3MnO1xuaW1wb3J0ICogYXMgc3FzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zcXMnO1xuaW1wb3J0ICogYXMgbGFtYmRhRXZlbnRTb3VyY2VzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEtZXZlbnQtc291cmNlcyc7XG5pbXBvcnQgKiBhcyBhcGlnYXRld2F5IGZyb20gJ2F3cy1jZGstbGliL2F3cy1hcGlnYXRld2F5JztcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXl2MiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtYXBpZ2F0ZXdheXYyJztcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXl2MkludGVncmF0aW9ucyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtYXBpZ2F0ZXdheXYyLWludGVncmF0aW9ucyc7XG5pbXBvcnQgKiBhcyBkeW5hbW9kYiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZHluYW1vZGInO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCAqIGFzIGRvdGVudiBmcm9tICdkb3RlbnYnO1xuXG4vLyBMb2FkIGVudmlyb25tZW50IHZhcmlhYmxlcyBmcm9tIC5lbnYgZmlsZVxuZG90ZW52LmNvbmZpZyh7IHBhdGg6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uZW52JykgfSk7XG5cbmV4cG9ydCBjbGFzcyBWaXJhbFZpZGVvc1N0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM/OiBjZGsuU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgLy8gR2V0IEFQSSBrZXlzIHdpdGggZmFsbGJhY2tzXG4gICAgY29uc3QgcnVud2F5QXBpS2V5ID0gcHJvY2Vzcy5lbnYuUlVOV0FZX0FQSV9LRVkgfHwgJyc7XG4gICAgY29uc3Qgb3BlbmFpQXBpS2V5ID0gcHJvY2Vzcy5lbnYuT1BFTkFJX0FQSV9LRVkgfHwgJyc7XG4gICAgY29uc3QgZ2VtaW5pQXBpS2V5ID0gcHJvY2Vzcy5lbnYuR0VNSU5JX0FQSV9LRVkgfHwgJyc7XG5cbiAgICBjb25zdCB3ZWJzb2NrZXREb21haW5OYW1lID0gcHJvY2Vzcy5lbnYuV0VCU09DS0VUX0RPTUFJTl9OQU1FIHx8ICcnO1xuICAgIGNvbnN0IHdlYnNvY2tldEVudiA9IHByb2Nlc3MuZW52LldFQlNPQ0tFVF9TVEFHRSB8fCAnJztcblxuICAgIGlmICghd2Vic29ja2V0RG9tYWluTmFtZSkge1xuICAgICAgY29uc29sZS53YXJuKCfimqDvuI8gIFdFQlNPQ0tFVF9ET01BSU5fTkFNRSBpcyBub3Qgc2V0LiBXZWJTb2NrZXQgbWF5IGZhaWwuJyk7XG4gICAgfVxuICAgIGlmICghd2Vic29ja2V0RW52KSB7XG4gICAgICBjb25zb2xlLndhcm4oJ+KaoO+4jyAgV0VCU09DS0VUX1NUQUdFIGlzIG5vdCBzZXQuIFdlYlNvY2tldCBtYXkgZmFpbC4nKTtcbiAgICB9XG5cbiAgICAvLyBWYWxpZGF0ZSBBUEkga2V5c1xuICAgIGlmICghcnVud2F5QXBpS2V5KSB7XG4gICAgICBjb25zb2xlLndhcm4oJ+KaoO+4jyAgUlVOV0FZX0FQSV9LRVkgaXMgbm90IHNldC4gVmlkZW8gZ2VuZXJhdGlvbiBtYXkgZmFpbC4nKTtcbiAgICB9XG4gICAgaWYgKCFvcGVuYWlBcGlLZXkpIHtcbiAgICAgIGNvbnNvbGUud2Fybign4pqg77iPICBPUEVOQUlfQVBJX0tFWSBpcyBub3Qgc2V0LiBWaWRlbyBnZW5lcmF0aW9uIG1heSBmYWlsLicpO1xuICAgIH1cbiAgICBpZiAoIWdlbWluaUFwaUtleSkge1xuICAgICAgY29uc29sZS53YXJuKCfimqDvuI8gIEdFTUlOSV9BUElfS0VZIGlzIG5vdCBzZXQuIEltYWdlIGdlbmVyYXRpb24gbWF5IGZhaWwuJyk7XG4gICAgfVxuXG4gICAgLy8gUzMgQnVja2V0IGZvciBzdG9yaW5nIHZpZGVvcyBhbmQgYXNzZXRzXG4gICAgY29uc3QgdmlkZW9CdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICdWaWRlb0J1Y2tldCcsIHtcbiAgICAgIGJ1Y2tldE5hbWU6IGB2aXJhbC12aWRlb3MtJHt0aGlzLmFjY291bnR9LSR7dGhpcy5yZWdpb259YCxcbiAgICAgIHZlcnNpb25lZDogdHJ1ZSxcbiAgICAgIGVuY3J5cHRpb246IHMzLkJ1Y2tldEVuY3J5cHRpb24uUzNfTUFOQUdFRCxcbiAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBzMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLCAvLyBGb3IgZGVtbyBwdXJwb3Nlc1xuICAgICAgbGlmZWN5Y2xlUnVsZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGlkOiAnRGVsZXRlT2xkQXNzZXRzJyxcbiAgICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgICAgIG5vbmN1cnJlbnRWZXJzaW9uRXhwaXJhdGlvbjogY2RrLkR1cmF0aW9uLmRheXMoMTUpLFxuICAgICAgICAgIGV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKDMwKSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBTMyBCdWNrZXQgZm9yIHN0b3JpbmcgdmlkZW8gcGFydHNcbiAgICBjb25zdCB2aWRlb1BhcnRzQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCAnVmlkZW9QYXJ0c0J1Y2tldCcsIHtcbiAgICAgIGJ1Y2tldE5hbWU6IGB2aWRlby1wYXJ0cy0ke3RoaXMuYWNjb3VudH0tJHt0aGlzLnJlZ2lvbn1gLFxuICAgICAgdmVyc2lvbmVkOiB0cnVlLFxuICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksIC8vIEZvciBkZW1vIHB1cnBvc2VzXG4gICAgICBsaWZlY3ljbGVSdWxlczogW1xuICAgICAgICB7XG4gICAgICAgICAgaWQ6ICdEZWxldGVPbGRWaWRlb1BhcnRzJyxcbiAgICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgICAgIG5vbmN1cnJlbnRWZXJzaW9uRXhwaXJhdGlvbjogY2RrLkR1cmF0aW9uLmRheXMoMTUpLFxuICAgICAgICAgIGV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKDMwKSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBTUVMgUXVldWUgZm9yIHZpZGVvIGdlbmVyYXRpb24gcmVxdWVzdHNcbiAgICBjb25zdCB2aWRlb1F1ZXVlID0gbmV3IHNxcy5RdWV1ZSh0aGlzLCAnVmlkZW9HZW5lcmF0aW9uUXVldWUnLCB7XG4gICAgICBxdWV1ZU5hbWU6ICd2aWRlby1nZW5lcmF0aW9uLXF1ZXVlJyxcbiAgICAgIHZpc2liaWxpdHlUaW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcygxNSksIC8vIE1hdGNoIGxhbWJkYSB0aW1lb3V0XG4gICAgICByZXRlbnRpb25QZXJpb2Q6IGNkay5EdXJhdGlvbi5kYXlzKDQpLFxuICAgICAgZGVhZExldHRlclF1ZXVlOiB7XG4gICAgICAgIHF1ZXVlOiBuZXcgc3FzLlF1ZXVlKHRoaXMsICdWaWRlb0dlbmVyYXRpb25ETFEnLCB7XG4gICAgICAgICAgcXVldWVOYW1lOiAndmlkZW8tZ2VuZXJhdGlvbi1kbHEnLFxuICAgICAgICAgIHJldGVudGlvblBlcmlvZDogY2RrLkR1cmF0aW9uLmRheXMoMTQpLFxuICAgICAgICB9KSxcbiAgICAgICAgbWF4UmVjZWl2ZUNvdW50OiAzLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIER5bmFtb0RCIFVzZXJzIFRhYmxlXG4gICAgY29uc3QgdXNlcnNUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCAnVXNlcnNUYWJsZScsIHtcbiAgICAgIHRhYmxlTmFtZTogJ3ZpcmFsLXZpZGVvcy11c2VycycsXG4gICAgICBwYXJ0aXRpb25LZXk6IHtcbiAgICAgICAgbmFtZTogJ3VzZXJJZCcsXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxuICAgICAgfSxcbiAgICAgIHNvcnRLZXk6IHtcbiAgICAgICAgbmFtZTogJ3VzZXJuYW1lJyxcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXG4gICAgICB9LFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksIC8vIEZvciBkZW1vIHB1cnBvc2VzXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5OiB0cnVlLFxuICAgIH0pO1xuXG4gICAgLy8gRHluYW1vREIgV2ViU29ja2V0IENvbm5lY3Rpb25zIFRhYmxlXG4gICAgY29uc3Qgd2Vic29ja2V0Q29ubmVjdGlvbnNUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZShcbiAgICAgIHRoaXMsXG4gICAgICAnV2ViU29ja2V0Q29ubmVjdGlvbnNUYWJsZScsXG4gICAgICB7XG4gICAgICAgIHRhYmxlTmFtZTogJ3ZpcmFsLXZpZGVvcy13ZWJzb2NrZXQtY29ubmVjdGlvbnMnLFxuICAgICAgICBwYXJ0aXRpb25LZXk6IHtcbiAgICAgICAgICBuYW1lOiAnY29ubmVjdGlvbklkJyxcbiAgICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcbiAgICAgICAgfSxcbiAgICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcbiAgICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSwgLy8gRm9yIGRlbW8gcHVycG9zZXNcbiAgICAgICAgdGltZVRvTGl2ZUF0dHJpYnV0ZTogJ3R0bCcsIC8vIEF1dG8tZGVsZXRlIGV4cGlyZWQgY29ubmVjdGlvbnNcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIEFkZCBHU0kgZm9yIHVzZXJJZCBsb29rdXBzXG4gICAgd2Vic29ja2V0Q29ubmVjdGlvbnNUYWJsZS5hZGRHbG9iYWxTZWNvbmRhcnlJbmRleCh7XG4gICAgICBpbmRleE5hbWU6ICdVc2VySWRJbmRleCcsXG4gICAgICBwYXJ0aXRpb25LZXk6IHtcbiAgICAgICAgbmFtZTogJ3VzZXJJZCcsXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxuICAgICAgfSxcbiAgICAgIHByb2plY3Rpb25UeXBlOiBkeW5hbW9kYi5Qcm9qZWN0aW9uVHlwZS5BTEwsXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgR1NJIGZvciB1c2VybmFtZSBsb29rdXBzXG4gICAgdXNlcnNUYWJsZS5hZGRHbG9iYWxTZWNvbmRhcnlJbmRleCh7XG4gICAgICBpbmRleE5hbWU6ICdVc2VybmFtZUluZGV4JyxcbiAgICAgIHBhcnRpdGlvbktleToge1xuICAgICAgICBuYW1lOiAndXNlcm5hbWUnLFxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcbiAgICAgIH0sXG4gICAgICBwcm9qZWN0aW9uVHlwZTogZHluYW1vZGIuUHJvamVjdGlvblR5cGUuQUxMLFxuICAgIH0pO1xuXG4gICAgLy8gSUFNIFJvbGUgZm9yIExhbWJkYVxuICAgIGNvbnN0IGxhbWJkYVJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ1ZpZGVvR2VuZXJhdGlvbkxhbWJkYVJvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnbGFtYmRhLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoXG4gICAgICAgICAgJ3NlcnZpY2Utcm9sZS9BV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGUnLFxuICAgICAgICApLFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IFMzIHBlcm1pc3Npb25zIHRvIExhbWJkYVxuICAgIHZpZGVvQnVja2V0LmdyYW50UmVhZFdyaXRlKGxhbWJkYVJvbGUpO1xuICAgIHZpZGVvUGFydHNCdWNrZXQuZ3JhbnRSZWFkV3JpdGUobGFtYmRhUm9sZSk7XG5cbiAgICAvLyBHcmFudCBTUVMgcGVybWlzc2lvbnMgdG8gTGFtYmRhXG4gICAgdmlkZW9RdWV1ZS5ncmFudFNlbmRNZXNzYWdlcyhsYW1iZGFSb2xlKTtcbiAgICB2aWRlb1F1ZXVlLmdyYW50Q29uc3VtZU1lc3NhZ2VzKGxhbWJkYVJvbGUpO1xuXG4gICAgLy8gR3JhbnQgRHluYW1vREIgcGVybWlzc2lvbnMgdG8gTGFtYmRhXG4gICAgdXNlcnNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEobGFtYmRhUm9sZSk7XG4gICAgd2Vic29ja2V0Q29ubmVjdGlvbnNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEobGFtYmRhUm9sZSk7XG5cbiAgICAvLyBDcmVhdGUgRkZtcGVnIExhbWJkYSBMYXllclxuICAgIGNvbnN0IGZmbXBlZ0xheWVyID0gbmV3IGxhbWJkYS5MYXllclZlcnNpb24odGhpcywgJ0ZGbXBlZ0xheWVyJywge1xuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFxuICAgICAgICBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vbGF5ZXJzL2ZmbXBlZy1sYXllcicpLFxuICAgICAgKSxcbiAgICAgIGNvbXBhdGlibGVSdW50aW1lczogW2xhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YXSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRkZtcGVnIGJpbmFyaWVzIGZvciB2aWRlbyBwcm9jZXNzaW5nJyxcbiAgICAgIGxheWVyVmVyc2lvbk5hbWU6ICdmZm1wZWctbGF5ZXInLFxuICAgIH0pO1xuXG4gICAgLy8gTGFtYmRhIGZ1bmN0aW9uIGZvciB2aWRlbyBnZW5lcmF0aW9uIChub3cgdHJpZ2dlcmVkIGJ5IFNRUylcbiAgICBjb25zdCB2aWRlb0dlbmVyYXRpb25MYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKFxuICAgICAgdGhpcyxcbiAgICAgICdWaWRlb0dlbmVyYXRpb25MYW1iZGEnLFxuICAgICAge1xuICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcbiAgICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXG4gICAgICAgICAgcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2Rpc3QvdmlkZW8tZ2VuZXJhdGlvbicpLFxuICAgICAgICApLFxuICAgICAgICByb2xlOiBsYW1iZGFSb2xlLFxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcygxNSksXG4gICAgICAgIG1lbW9yeVNpemU6IDMwMDgsIC8vIEluY3JlYXNlZCBmb3IgdmlkZW8gcHJvY2Vzc2luZ1xuICAgICAgICBsb2dHcm91cDogbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ1ZpZGVvR2VuZXJhdGlvbkxhbWJkYUxvZ0dyb3VwJywge1xuICAgICAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgICB9KSxcbiAgICAgICAgbGF5ZXJzOiBbZmZtcGVnTGF5ZXJdLFxuICAgICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAgIFZJREVPX0JVQ0tFVF9OQU1FOiB2aWRlb0J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgICAgIFZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FOiB2aWRlb1BhcnRzQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICAgICAgVVNFUlNfVEFCTEVfTkFNRTogdXNlcnNUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgICAgUlVOV0FZX0FQSV9LRVk6IHJ1bndheUFwaUtleSxcbiAgICAgICAgICBPUEVOQUlfQVBJX0tFWTogb3BlbmFpQXBpS2V5LFxuICAgICAgICAgIEdFTUlOSV9BUElfS0VZOiBnZW1pbmlBcGlLZXksXG4gICAgICAgICAgVklERU9fUVVFVUVfVVJMOiB2aWRlb1F1ZXVlLnF1ZXVlVXJsLFxuICAgICAgICAgIFBBVEg6ICcvb3B0L2JpbjovdXNyL2xvY2FsL2JpbjovdXNyL2Jpbi86L2JpbicsXG4gICAgICAgICAgRk9OVENPTkZJR19QQVRIOiAnL29wdC9ldGMvZm9udHMnLFxuICAgICAgICAgIEZPTlRDT05GSUdfRklMRTogJy9vcHQvZXRjL2ZvbnRzL2ZvbnRzLmNvbmYnLFxuICAgICAgICAgIFdFQlNPQ0tFVF9ET01BSU5fTkFNRTogd2Vic29ja2V0RG9tYWluTmFtZSxcbiAgICAgICAgICBXRUJTT0NLRVRfU1RBR0U6IHdlYnNvY2tldEVudixcbiAgICAgICAgICBXRUJTT0NLRVRfQ09OTkVDVElPTlNfVEFCTEVfTkFNRTogd2Vic29ja2V0Q29ubmVjdGlvbnNUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBBZGQgU1FTIGV2ZW50IHNvdXJjZSB0byB2aWRlbyBnZW5lcmF0aW9uIGxhbWJkYVxuICAgIHZpZGVvR2VuZXJhdGlvbkxhbWJkYS5hZGRFdmVudFNvdXJjZShcbiAgICAgIG5ldyBsYW1iZGFFdmVudFNvdXJjZXMuU3FzRXZlbnRTb3VyY2UodmlkZW9RdWV1ZSwge1xuICAgICAgICBiYXRjaFNpemU6IDEsIC8vIFByb2Nlc3Mgb25lIG1lc3NhZ2UgYXQgYSB0aW1lXG4gICAgICAgIG1heEJhdGNoaW5nV2luZG93OiBjZGsuRHVyYXRpb24uc2Vjb25kcygwKSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICAvLyBMYW1iZGEgZnVuY3Rpb24gZm9yIHF1ZXVlIG1hbmFnZW1lbnQgKHJlY2VpdmVzIHJlcXVlc3RzIGFuZCBwdXRzIHRoZW0gaW4gU1FTKVxuICAgIGNvbnN0IGZ1bGxWaWRlb1F1ZXVlTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbihcbiAgICAgIHRoaXMsXG4gICAgICAnRnVsbFZpZGVvUXVldWVMYW1iZGEnLFxuICAgICAge1xuICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcbiAgICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXG4gICAgICAgICAgcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2Rpc3QvdmlkZW8tcXVldWUnKSxcbiAgICAgICAgKSxcbiAgICAgICAgcm9sZTogbGFtYmRhUm9sZSxcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMSksXG4gICAgICAgIG1lbW9yeVNpemU6IDEyOCxcbiAgICAgICAgbG9nR3JvdXA6IG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdGdWxsVmlkZW9RdWV1ZUxhbWJkYUxvZ0dyb3VwJywge1xuICAgICAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgICB9KSxcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICBWSURFT19RVUVVRV9VUkw6IHZpZGVvUXVldWUucXVldWVVcmwsXG4gICAgICAgICAgVVNFUlNfVEFCTEVfTkFNRTogdXNlcnNUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBDcmVhdGUgYSBzZXBhcmF0ZSByb2xlIGZvciBKV1QgYXV0aG9yaXplciB0byBhdm9pZCBjaXJjdWxhciBkZXBlbmRlbmNpZXNcbiAgICBjb25zdCBqd3RBdXRob3JpemVyUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnSldUQXV0aG9yaXplclJvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnbGFtYmRhLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoXG4gICAgICAgICAgJ3NlcnZpY2Utcm9sZS9BV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGUnLFxuICAgICAgICApLFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IER5bmFtb0RCIHBlcm1pc3Npb25zIHRvIEpXVCBhdXRob3JpemVyXG4gICAgdXNlcnNUYWJsZS5ncmFudFJlYWREYXRhKGp3dEF1dGhvcml6ZXJSb2xlKTtcblxuICAgIC8vIExhbWJkYSBmdW5jdGlvbiBmb3IgSldUIGF1dGhvcml6YXRpb25cbiAgICBjb25zdCBqd3RBdXRob3JpemVyTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbihcbiAgICAgIHRoaXMsXG4gICAgICAnSldUQXV0aG9yaXplckxhbWJkYScsXG4gICAgICB7XG4gICAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxuICAgICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcbiAgICAgICAgICBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vZGlzdC9qd3QtYXV0aG9yaXplcicpLFxuICAgICAgICApLFxuICAgICAgICByb2xlOiBqd3RBdXRob3JpemVyUm9sZSxcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgICBtZW1vcnlTaXplOiAxMjgsXG4gICAgICAgIGxvZ0dyb3VwOiBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnSldUQXV0aG9yaXplckxhbWJkYUxvZ0dyb3VwJywge1xuICAgICAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgICB9KSxcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICBORVhUX1BVQkxJQ19DT0dOSVRPX1VTRVJfUE9PTF9JRDpcbiAgICAgICAgICAgIHByb2Nlc3MuZW52Lk5FWFRfUFVCTElDX0NPR05JVE9fVVNFUl9QT09MX0lEIHx8ICcnLFxuICAgICAgICAgIE5FWFRfUFVCTElDX0NPR05JVE9fQ0xJRU5UX0lEOlxuICAgICAgICAgICAgcHJvY2Vzcy5lbnYuTkVYVF9QVUJMSUNfQ09HTklUT19DTElFTlRfSUQgfHwgJycsXG4gICAgICAgICAgTkVYVF9QVUJMSUNfQ09HTklUT19SRUdJT046XG4gICAgICAgICAgICBwcm9jZXNzLmVudi5ORVhUX1BVQkxJQ19DT0dOSVRPX1JFR0lPTiB8fCAndXMtZWFzdC0xJyxcbiAgICAgICAgICBVU0VSU19UQUJMRV9OQU1FOiB1c2Vyc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIExhbWJkYSBmdW5jdGlvbiBmb3IgZmV0Y2hpbmcgdmlkZW9zXG4gICAgY29uc3QgZmV0Y2hWaWRlb3NMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdGZXRjaFZpZGVvc0xhbWJkYScsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9kaXN0L2ZldGNoLXZpZGVvcycpKSxcbiAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcygxKSxcbiAgICAgIG1lbW9yeVNpemU6IDEyOCxcbiAgICAgIGxvZ0dyb3VwOiBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnRmV0Y2hWaWRlb3NMYW1iZGFMb2dHcm91cCcsIHtcbiAgICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgICB9KSxcblxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgVklERU9fQlVDS0VUX05BTUU6IHZpZGVvQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICAgIFZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FOiB2aWRlb1BhcnRzQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICAgIFVTRVJTX1RBQkxFX05BTUU6IHVzZXJzVGFibGUudGFibGVOYW1lLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIExhbWJkYSBmdW5jdGlvbiBmb3IgZmV0Y2hpbmcgcHJldmlldyBkYXRhXG4gICAgY29uc3QgZmV0Y2hQcmV2aWV3TGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnRmV0Y2hQcmV2aWV3TGFtYmRhJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXG4gICAgICAgIHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9kaXN0L2ZldGNoLXByZXZpZXcnKSxcbiAgICAgICksXG4gICAgICByb2xlOiBsYW1iZGFSb2xlLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMSksXG4gICAgICBtZW1vcnlTaXplOiAxMjgsXG4gICAgICBsb2dHcm91cDogbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ0ZldGNoUHJldmlld0xhbWJkYUxvZ0dyb3VwJywge1xuICAgICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSyxcbiAgICAgIH0pLFxuXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBWSURFT19CVUNLRVRfTkFNRTogdmlkZW9CdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgICAgVklERU9fUEFSVFNfQlVDS0VUX05BTUU6IHZpZGVvUGFydHNCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgICAgVVJMX1RUTF9TRUNPTkRTOiAnMzYwMDAnLFxuICAgICAgICBNQVhfU0NFTkVTOiAnMTAnLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIExhbWJkYSBmdW5jdGlvbiBmb3IgdXNlciBtYW5hZ2VtZW50XG4gICAgY29uc3QgZ2V0VXNlckxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0dldFVzZXJMYW1iZGEnLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vZGlzdC9nZXQtdXNlcicpKSxcbiAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcygxKSxcbiAgICAgIG1lbW9yeVNpemU6IDEyOCxcbiAgICAgIGxvZ0dyb3VwOiBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnR2V0VXNlckxhbWJkYUxvZ0dyb3VwJywge1xuICAgICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSyxcbiAgICAgIH0pLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgVVNFUlNfVEFCTEVfTkFNRTogdXNlcnNUYWJsZS50YWJsZU5hbWUsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgY29uc3QgdXBzZXJ0VXNlckxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1Vwc2VydFVzZXJMYW1iZGEnLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vZGlzdC91cHNlcnQtdXNlcicpKSxcbiAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcygxKSxcbiAgICAgIG1lbW9yeVNpemU6IDEyOCxcbiAgICAgIGxvZ0dyb3VwOiBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnVXBzZXJ0VXNlckxhbWJkYUxvZ0dyb3VwJywge1xuICAgICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSyxcbiAgICAgIH0pLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgVVNFUlNfVEFCTEVfTkFNRTogdXNlcnNUYWJsZS50YWJsZU5hbWUsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gTGFtYmRhIGZ1bmN0aW9uIGZvciBkZWxldGluZyB2aWRlb3NcbiAgICBjb25zdCBkZWxldGVWaWRlb0xhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0RlbGV0ZVZpZGVvTGFtYmRhJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2Rpc3QvZGVsZXRlLXZpZGVvJykpLFxuICAgICAgcm9sZTogbGFtYmRhUm9sZSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDEpLFxuICAgICAgbWVtb3J5U2l6ZTogMTI4LFxuICAgICAgbG9nR3JvdXA6IG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdEZWxldGVWaWRlb0xhbWJkYUxvZ0dyb3VwJywge1xuICAgICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSyxcbiAgICAgIH0pLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgVklERU9fQlVDS0VUX05BTUU6IHZpZGVvQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICAgIFZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FOiB2aWRlb1BhcnRzQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gTGFtYmRhIGZ1bmN0aW9uIGZvciBnZW5lcmF0aW5nIGF1ZGlvIG5hcnJhdGlvblxuICAgIGNvbnN0IGdlbmVyYXRlQXVkaW9TdWJ0aXRsZUxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24oXG4gICAgICB0aGlzLFxuICAgICAgJ0dlbmVyYXRlQXVkaW9TdWJ0aXRsZUxhbWJkYScsXG4gICAgICB7XG4gICAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxuICAgICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcbiAgICAgICAgICBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vZGlzdC9nZW5lcmF0ZS1hdWRpby1zdWJ0aXRsZScpLFxuICAgICAgICApLFxuICAgICAgICByb2xlOiBsYW1iZGFSb2xlLFxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgICAgbWVtb3J5U2l6ZTogNTEyLFxuICAgICAgICBsb2dHcm91cDogbmV3IGxvZ3MuTG9nR3JvdXAoXG4gICAgICAgICAgdGhpcyxcbiAgICAgICAgICAnR2VuZXJhdGVBdWRpb1N1YnRpdGxlTGFtYmRhTG9nR3JvdXAnLFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgICAgIH0sXG4gICAgICAgICksXG4gICAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgICAgT1BFTkFJX0FQSV9LRVk6IG9wZW5haUFwaUtleSxcbiAgICAgICAgICBWSURFT19QQVJUU19CVUNLRVRfTkFNRTogdmlkZW9QYXJ0c0J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgICAgIFdFQlNPQ0tFVF9ET01BSU5fTkFNRTogd2Vic29ja2V0RG9tYWluTmFtZSxcbiAgICAgICAgICBXRUJTT0NLRVRfU1RBR0U6IHdlYnNvY2tldEVudixcbiAgICAgICAgICBXRUJTT0NLRVRfQ09OTkVDVElPTlNfVEFCTEVfTkFNRTogd2Vic29ja2V0Q29ubmVjdGlvbnNUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBMYW1iZGEgZnVuY3Rpb24gZm9yIGdlbmVyYXRpbmcgaW1hZ2VzXG4gICAgY29uc3QgZ2VuZXJhdGVJbWFnZUxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24oXG4gICAgICB0aGlzLFxuICAgICAgJ0dlbmVyYXRlSW1hZ2VMYW1iZGEnLFxuICAgICAge1xuICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcbiAgICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXG4gICAgICAgICAgcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2Rpc3QvZ2VuZXJhdGUtaW1hZ2UnKSxcbiAgICAgICAgKSxcbiAgICAgICAgcm9sZTogbGFtYmRhUm9sZSxcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICAgIG1lbW9yeVNpemU6IDUxMixcbiAgICAgICAgbG9nR3JvdXA6IG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdHZW5lcmF0ZUltYWdlTGFtYmRhTG9nR3JvdXAnLCB7XG4gICAgICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgICAgIH0pLFxuICAgICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAgIFJVTldBWV9BUElfS0VZOiBydW53YXlBcGlLZXksXG4gICAgICAgICAgR0VNSU5JX0FQSV9LRVk6IGdlbWluaUFwaUtleSxcbiAgICAgICAgICBWSURFT19QQVJUU19CVUNLRVRfTkFNRTogdmlkZW9QYXJ0c0J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgICAgIFdFQlNPQ0tFVF9ET01BSU5fTkFNRTogd2Vic29ja2V0RG9tYWluTmFtZSxcbiAgICAgICAgICBXRUJTT0NLRVRfU1RBR0U6IHdlYnNvY2tldEVudixcbiAgICAgICAgICBXRUJTT0NLRVRfQ09OTkVDVElPTlNfVEFCTEVfTkFNRTogd2Vic29ja2V0Q29ubmVjdGlvbnNUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBMYW1iZGEgZnVuY3Rpb24gZm9yIGFuaW1hdGluZyBhbiBpbWFnZSBpbnRvIHZpZGVvXG4gICAgY29uc3QgYW5pbWF0ZUltYWdlTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnQW5pbWF0ZUltYWdlTGFtYmRhJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXG4gICAgICAgIHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9kaXN0L2FuaW1hdGUtaW1hZ2UnKSxcbiAgICAgICksXG4gICAgICByb2xlOiBsYW1iZGFSb2xlLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICBtZW1vcnlTaXplOiA1MTIsXG4gICAgICBsb2dHcm91cDogbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ0FuaW1hdGVJbWFnZUxhbWJkYUxvZ0dyb3VwJywge1xuICAgICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSyxcbiAgICAgIH0pLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgUlVOV0FZX0FQSV9LRVk6IHJ1bndheUFwaUtleSxcbiAgICAgICAgR0VNSU5JX0FQSV9LRVk6IGdlbWluaUFwaUtleSxcbiAgICAgICAgVklERU9fUEFSVFNfQlVDS0VUX05BTUU6IHZpZGVvUGFydHNCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgICAgV0VCU09DS0VUX0RPTUFJTl9OQU1FOiB3ZWJzb2NrZXREb21haW5OYW1lLFxuICAgICAgICBXRUJTT0NLRVRfU1RBR0U6IHdlYnNvY2tldEVudixcbiAgICAgICAgV0VCU09DS0VUX0NPTk5FQ1RJT05TX1RBQkxFX05BTUU6IHdlYnNvY2tldENvbm5lY3Rpb25zVGFibGUudGFibGVOYW1lLFxuICAgICAgICBWSURFT19RVUVVRV9VUkw6IHZpZGVvUXVldWUucXVldWVVcmwsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gTGFtYmRhIGZ1bmN0aW9uIGZvciBzYXZpbmcgaW1hZ2VzXG4gICAgY29uc3Qgc2F2ZUltYWdlTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnU2F2ZUltYWdlTGFtYmRhJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2Rpc3Qvc2F2ZS1pbWFnZScpKSxcbiAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcygyKSxcbiAgICAgIG1lbW9yeVNpemU6IDUxMixcbiAgICAgIGxvZ0dyb3VwOiBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnU2F2ZUltYWdlTGFtYmRhTG9nR3JvdXAnLCB7XG4gICAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgfSksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBWSURFT19QQVJUU19CVUNLRVRfTkFNRTogdmlkZW9QYXJ0c0J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgICBXRUJTT0NLRVRfRE9NQUlOX05BTUU6IHdlYnNvY2tldERvbWFpbk5hbWUsXG4gICAgICAgIFdFQlNPQ0tFVF9TVEFHRTogd2Vic29ja2V0RW52LFxuICAgICAgICBXRUJTT0NLRVRfQ09OTkVDVElPTlNfVEFCTEVfTkFNRTogd2Vic29ja2V0Q29ubmVjdGlvbnNUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIFZJREVPX1FVRVVFX1VSTDogdmlkZW9RdWV1ZS5xdWV1ZVVybCxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBBUEkgR2F0ZXdheSBSRVNUIEFQSVxuICAgIGNvbnN0IGFwaSA9IG5ldyBhcGlnYXRld2F5LlJlc3RBcGkodGhpcywgJ1ZpZGVvR2VuZXJhdGlvbkFwaScsIHtcbiAgICAgIHJlc3RBcGlOYW1lOiAnVmlkZW8gR2VuZXJhdGlvbiBBUEknLFxuICAgICAgZGVzY3JpcHRpb246ICdBUEkgZm9yIHZpZGVvIGdlbmVyYXRpb24gcmVxdWVzdHMnLFxuICAgICAgZGVmYXVsdENvcnNQcmVmbGlnaHRPcHRpb25zOiB7XG4gICAgICAgIGFsbG93T3JpZ2luczogYXBpZ2F0ZXdheS5Db3JzLkFMTF9PUklHSU5TLFxuICAgICAgICBhbGxvd01ldGhvZHM6IGFwaWdhdGV3YXkuQ29ycy5BTExfTUVUSE9EUyxcbiAgICAgICAgYWxsb3dIZWFkZXJzOiBbJ0NvbnRlbnQtVHlwZScsICdBdXRob3JpemF0aW9uJ10sXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gTGFtYmRhIGludGVncmF0aW9uIGZvciB0aGUgcXVldWUgbWFuYWdlclxuICAgIGNvbnN0IHF1ZXVlTWFuYWdlckludGVncmF0aW9uID0gbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oXG4gICAgICBmdWxsVmlkZW9RdWV1ZUxhbWJkYSxcbiAgICAgIHtcbiAgICAgICAgcmVxdWVzdFRlbXBsYXRlczoge1xuICAgICAgICAgICdhcHBsaWNhdGlvbi9qc29uJzogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgYm9keTogXCIkdXRpbC5lc2NhcGVKYXZhU2NyaXB0KCRpbnB1dC5qc29uKCckJykpXCIsXG4gICAgICAgICAgfSksXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBKV1QgQXV0aG9yaXplclxuICAgIGNvbnN0IGp3dEF1dGhvcml6ZXIgPSBuZXcgYXBpZ2F0ZXdheS5Ub2tlbkF1dGhvcml6ZXIoXG4gICAgICB0aGlzLFxuICAgICAgJ0pXVEF1dGhvcml6ZXInLFxuICAgICAge1xuICAgICAgICBoYW5kbGVyOiBqd3RBdXRob3JpemVyTGFtYmRhLFxuICAgICAgICBpZGVudGl0eVNvdXJjZTogJ21ldGhvZC5yZXF1ZXN0LmhlYWRlci5BdXRob3JpemF0aW9uJyxcbiAgICAgICAgYXV0aG9yaXplck5hbWU6ICdKV1RBdXRob3JpemVyJyxcbiAgICAgICAgLy8gRGlzYWJsZSBjYWNoaW5nIGNvbXBsZXRlbHkgZm9yIGRlYnVnZ2luZ1xuICAgICAgICByZXN1bHRzQ2FjaGVUdGw6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDApLFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gTGFtYmRhIGludGVncmF0aW9uIGZvciBmZXRjaGluZyB2aWRlb3NcbiAgICBjb25zdCBmZXRjaFZpZGVvc0ludGVncmF0aW9uID0gbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oXG4gICAgICBmZXRjaFZpZGVvc0xhbWJkYSxcbiAgICAgIHtcbiAgICAgICAgcmVxdWVzdFRlbXBsYXRlczoge1xuICAgICAgICAgICdhcHBsaWNhdGlvbi9qc29uJzogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgYm9keTogXCIkdXRpbC5lc2NhcGVKYXZhU2NyaXB0KCRpbnB1dC5qc29uKCckJykpXCIsXG4gICAgICAgICAgfSksXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBMYW1iZGEgaW50ZWdyYXRpb24gZm9yIGZldGNoaW5nIHByZXZpZXcgZGF0YVxuICAgIGNvbnN0IGZldGNoUHJldmlld0ludGVncmF0aW9uID0gbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oXG4gICAgICBmZXRjaFByZXZpZXdMYW1iZGEsXG4gICAgICB7XG4gICAgICAgIHJlcXVlc3RUZW1wbGF0ZXM6IHtcbiAgICAgICAgICAnYXBwbGljYXRpb24vanNvbic6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIHF1ZXJ5U3RyaW5nUGFyYW1ldGVyczoge1xuICAgICAgICAgICAgICB0aW1lc3RhbXA6IFwiJGlucHV0LnBhcmFtcygndGltZXN0YW1wJylcIixcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSksXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBMYW1iZGEgaW50ZWdyYXRpb24gZm9yIGdldCB1c2VyXG4gICAgY29uc3QgZ2V0VXNlckludGVncmF0aW9uID0gbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oZ2V0VXNlckxhbWJkYSwge1xuICAgICAgcmVxdWVzdFRlbXBsYXRlczoge1xuICAgICAgICAnYXBwbGljYXRpb24vanNvbic6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBxdWVyeVN0cmluZ1BhcmFtZXRlcnM6IHtcbiAgICAgICAgICAgIHVzZXJJZDogXCIkaW5wdXQucGFyYW1zKCd1c2VySWQnKVwiLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIExhbWJkYSBpbnRlZ3JhdGlvbiBmb3IgdXBzZXJ0IHVzZXJcbiAgICBjb25zdCB1cHNlcnRVc2VySW50ZWdyYXRpb24gPSBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihcbiAgICAgIHVwc2VydFVzZXJMYW1iZGEsXG4gICAgICB7XG4gICAgICAgIHJlcXVlc3RUZW1wbGF0ZXM6IHtcbiAgICAgICAgICAnYXBwbGljYXRpb24vanNvbic6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIGJvZHk6IFwiJHV0aWwuZXNjYXBlSmF2YVNjcmlwdCgkaW5wdXQuanNvbignJCcpKVwiLFxuICAgICAgICAgIH0pLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gTGFtYmRhIGludGVncmF0aW9uIGZvciBkZWxldGluZyB2aWRlb3NcbiAgICBjb25zdCBkZWxldGVWaWRlb0ludGVncmF0aW9uID0gbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oXG4gICAgICBkZWxldGVWaWRlb0xhbWJkYSxcbiAgICAgIHtcbiAgICAgICAgcmVxdWVzdFRlbXBsYXRlczoge1xuICAgICAgICAgICdhcHBsaWNhdGlvbi9qc29uJzogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgcXVlcnlTdHJpbmdQYXJhbWV0ZXJzOiB7XG4gICAgICAgICAgICAgIHRpbWVzdGFtcDogXCIkaW5wdXQucGFyYW1zKCd0aW1lc3RhbXAnKVwiLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIFdlYlNvY2tldCBMYW1iZGEgRnVuY3Rpb25zXG4gICAgY29uc3Qgd2Vic29ja2V0Q29ubmVjdExhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24oXG4gICAgICB0aGlzLFxuICAgICAgJ1dlYlNvY2tldENvbm5lY3RMYW1iZGEnLFxuICAgICAge1xuICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcbiAgICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXG4gICAgICAgICAgcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2Rpc3Qvd2Vic29ja2V0LWNvbm5lY3QnKSxcbiAgICAgICAgKSxcbiAgICAgICAgcm9sZTogbGFtYmRhUm9sZSxcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgICBtZW1vcnlTaXplOiAxMjgsXG4gICAgICAgIGxvZ0dyb3VwOiBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnV2ViU29ja2V0Q29ubmVjdExhbWJkYUxvZ0dyb3VwJywge1xuICAgICAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgICB9KSxcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICBXRUJTT0NLRVRfQ09OTkVDVElPTlNfVEFCTEVfTkFNRTogd2Vic29ja2V0Q29ubmVjdGlvbnNUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgICAgVVNFUlNfVEFCTEVfTkFNRTogdXNlcnNUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgICAgQ09HTklUT19VU0VSX1BPT0xfSUQ6XG4gICAgICAgICAgICBwcm9jZXNzLmVudi5ORVhUX1BVQkxJQ19DT0dOSVRPX1VTRVJfUE9PTF9JRCB8fCAnJyxcbiAgICAgICAgICBDT0dOSVRPX0NMSUVOVF9JRDogcHJvY2Vzcy5lbnYuTkVYVF9QVUJMSUNfQ09HTklUT19DTElFTlRfSUQgfHwgJycsXG4gICAgICAgICAgQ09HTklUT19SRUdJT046IHByb2Nlc3MuZW52Lk5FWFRfUFVCTElDX0NPR05JVE9fUkVHSU9OIHx8ICd1cy1lYXN0LTEnLFxuICAgICAgICAgIEpXVF9BVVRIT1JJWkVSX0xBTUJEQV9BUk46IGp3dEF1dGhvcml6ZXJMYW1iZGEuZnVuY3Rpb25Bcm4sXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBHcmFudCBXZWJTb2NrZXQgY29ubmVjdCBsYW1iZGEgcGVybWlzc2lvbiB0byBpbnZva2UgSldUIGF1dGhvcml6ZXJcbiAgICAvLyBBZGQgcGVybWlzc2lvbiBkaXJlY3RseSB0byB0aGUgbGFtYmRhIHJvbGUgdG8gYXZvaWQgY2lyY3VsYXIgZGVwZW5kZW5jeVxuICAgIGxhbWJkYVJvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogWydsYW1iZGE6SW52b2tlRnVuY3Rpb24nXSxcbiAgICAgICAgcmVzb3VyY2VzOiBband0QXV0aG9yaXplckxhbWJkYS5mdW5jdGlvbkFybl0sXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgY29uc3Qgd2Vic29ja2V0RGlzY29ubmVjdExhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24oXG4gICAgICB0aGlzLFxuICAgICAgJ1dlYlNvY2tldERpc2Nvbm5lY3RMYW1iZGEnLFxuICAgICAge1xuICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcbiAgICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXG4gICAgICAgICAgcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2Rpc3Qvd2Vic29ja2V0LWRpc2Nvbm5lY3QnKSxcbiAgICAgICAgKSxcbiAgICAgICAgcm9sZTogbGFtYmRhUm9sZSxcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgICBtZW1vcnlTaXplOiAxMjgsXG4gICAgICAgIGxvZ0dyb3VwOiBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnV2ViU29ja2V0RGlzY29ubmVjdExhbWJkYUxvZ0dyb3VwJywge1xuICAgICAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgICB9KSxcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICBXRUJTT0NLRVRfQ09OTkVDVElPTlNfVEFCTEVfTkFNRTogd2Vic29ja2V0Q29ubmVjdGlvbnNUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICBjb25zdCB3ZWJzb2NrZXRNZXNzYWdlTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbihcbiAgICAgIHRoaXMsXG4gICAgICAnV2ViU29ja2V0TWVzc2FnZUxhbWJkYScsXG4gICAgICB7XG4gICAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxuICAgICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcbiAgICAgICAgICBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vZGlzdC93ZWJzb2NrZXQtbWVzc2FnZScpLFxuICAgICAgICApLFxuICAgICAgICByb2xlOiBsYW1iZGFSb2xlLFxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICAgIG1lbW9yeVNpemU6IDEyOCxcbiAgICAgICAgbG9nR3JvdXA6IG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdXZWJTb2NrZXRNZXNzYWdlTGFtYmRhTG9nR3JvdXAnLCB7XG4gICAgICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgICAgIH0pLFxuICAgICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAgIFdFQlNPQ0tFVF9DT05ORUNUSU9OU19UQUJMRV9OQU1FOiB3ZWJzb2NrZXRDb25uZWN0aW9uc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgICBVU0VSU19UQUJMRV9OQU1FOiB1c2Vyc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIFdlYlNvY2tldCBicm9hZGNhc3QgbGFtYmRhIGZvciBicm9hZGNhc3RpbmcgbWVzc2FnZXMgdG8gYWxsIGNvbm5lY3RlZCBjbGllbnRzXG4gICAgY29uc3Qgd2Vic29ja2V0QnJvYWRjYXN0TGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbihcbiAgICAgIHRoaXMsXG4gICAgICAnV2ViU29ja2V0QnJvYWRjYXN0TGFtYmRhJyxcbiAgICAgIHtcbiAgICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXG4gICAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFxuICAgICAgICAgIHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9kaXN0L3dlYnNvY2tldC1icm9hZGNhc3QnKSxcbiAgICAgICAgKSxcbiAgICAgICAgcm9sZTogbGFtYmRhUm9sZSxcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgICBtZW1vcnlTaXplOiAxMjgsXG4gICAgICAgIGxvZ0dyb3VwOiBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnV2ViU29ja2V0QnJvYWRjYXN0TGFtYmRhTG9nR3JvdXAnLCB7XG4gICAgICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgICAgIH0pLFxuICAgICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAgIFdFQlNPQ0tFVF9DT05ORUNUSU9OU19UQUJMRV9OQU1FOiB3ZWJzb2NrZXRDb25uZWN0aW9uc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIExhbWJkYSBmb3IgcmVzb2x2aW5nIHNoYXJlIHRva2Vuc1xuICAgIGNvbnN0IHNoYXJlUmVzb2x2ZUxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1NoYXJlUmVzb2x2ZUxhbWJkYScsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFxuICAgICAgICBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vZGlzdC9zaGFyZS1yZXNvbHZlJyksXG4gICAgICApLFxuICAgICAgcm9sZTogbGFtYmRhUm9sZSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgIG1lbW9yeVNpemU6IDEyOCxcbiAgICAgIGxvZ0dyb3VwOiBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnU2hhcmVSZXNvbHZlTGFtYmRhTG9nR3JvdXAnLCB7XG4gICAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgfSksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBWSURFT19CVUNLRVRfTkFNRTogdmlkZW9CdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgICAgVklERU9fUEFSVFNfQlVDS0VUX05BTUU6IHZpZGVvUGFydHNCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBXZWJTb2NrZXQgQVBJIEdhdGV3YXkgdjJcbiAgICBjb25zdCB3ZWJzb2NrZXRBcGkgPSBuZXcgYXBpZ2F0ZXdheXYyLldlYlNvY2tldEFwaSh0aGlzLCAnV2ViU29ja2V0QXBpJywge1xuICAgICAgYXBpTmFtZTogJ1ZpcmFsIFZpZGVvcyBXZWJTb2NrZXQgQVBJJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnV2ViU29ja2V0IEFQSSBmb3IgcmVhbC10aW1lIHZpZGVvIGdlbmVyYXRpb24gdXBkYXRlcycsXG4gICAgICBjb25uZWN0Um91dGVPcHRpb25zOiB7XG4gICAgICAgIGludGVncmF0aW9uOiBuZXcgYXBpZ2F0ZXdheXYySW50ZWdyYXRpb25zLldlYlNvY2tldExhbWJkYUludGVncmF0aW9uKFxuICAgICAgICAgICdDb25uZWN0SGFuZGxlcicsXG4gICAgICAgICAgd2Vic29ja2V0Q29ubmVjdExhbWJkYSxcbiAgICAgICAgKSxcbiAgICAgIH0sXG4gICAgICBkaXNjb25uZWN0Um91dGVPcHRpb25zOiB7XG4gICAgICAgIGludGVncmF0aW9uOiBuZXcgYXBpZ2F0ZXdheXYySW50ZWdyYXRpb25zLldlYlNvY2tldExhbWJkYUludGVncmF0aW9uKFxuICAgICAgICAgICdEaXNjb25uZWN0SGFuZGxlcicsXG4gICAgICAgICAgd2Vic29ja2V0RGlzY29ubmVjdExhbWJkYSxcbiAgICAgICAgKSxcbiAgICAgIH0sXG4gICAgICBkZWZhdWx0Um91dGVPcHRpb25zOiB7XG4gICAgICAgIGludGVncmF0aW9uOiBuZXcgYXBpZ2F0ZXdheXYySW50ZWdyYXRpb25zLldlYlNvY2tldExhbWJkYUludGVncmF0aW9uKFxuICAgICAgICAgICdNZXNzYWdlSGFuZGxlcicsXG4gICAgICAgICAgd2Vic29ja2V0TWVzc2FnZUxhbWJkYSxcbiAgICAgICAgKSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBjb25zdCB3ZWJzb2NrZXRTdGFnZSA9IG5ldyBhcGlnYXRld2F5djIuV2ViU29ja2V0U3RhZ2UoXG4gICAgICB0aGlzLFxuICAgICAgJ1dlYlNvY2tldFN0YWdlJyxcbiAgICAgIHtcbiAgICAgICAgd2ViU29ja2V0QXBpOiB3ZWJzb2NrZXRBcGksXG4gICAgICAgIHN0YWdlTmFtZTogJ3Byb2QnLFxuICAgICAgICBhdXRvRGVwbG95OiB0cnVlLFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gR3JhbnQgV2ViU29ja2V0IEFQSSBwZXJtaXNzaW9ucyB0byBMYW1iZGEgZnVuY3Rpb25zXG4gICAgbGFtYmRhUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbJ2V4ZWN1dGUtYXBpOk1hbmFnZUNvbm5lY3Rpb25zJ10sXG4gICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgIGBhcm46YXdzOmV4ZWN1dGUtYXBpOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fToke3dlYnNvY2tldEFwaS5hcGlJZH0vKmAsXG4gICAgICAgIF0sXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgLy8gTGFtYmRhIGludGVncmF0aW9uIGZvciBnZW5lcmF0aW5nIGF1ZGlvIGFuZCBzdWJ0aXRsZXNcbiAgICBjb25zdCBnZW5lcmF0ZUF1ZGlvU3VidGl0bGVJbnRlZ3JhdGlvbiA9IG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKFxuICAgICAgZ2VuZXJhdGVBdWRpb1N1YnRpdGxlTGFtYmRhLFxuICAgICAge1xuICAgICAgICByZXF1ZXN0VGVtcGxhdGVzOiB7XG4gICAgICAgICAgJ2FwcGxpY2F0aW9uL2pzb24nOiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBib2R5OiBcIiR1dGlsLmVzY2FwZUphdmFTY3JpcHQoJGlucHV0Lmpzb24oJyQnKSlcIixcbiAgICAgICAgICB9KSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIExhbWJkYSBpbnRlZ3JhdGlvbiBmb3IgZ2VuZXJhdGluZyBpbWFnZXNcbiAgICBjb25zdCBnZW5lcmF0ZUltYWdlSW50ZWdyYXRpb24gPSBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihcbiAgICAgIGdlbmVyYXRlSW1hZ2VMYW1iZGEsXG4gICAgICB7XG4gICAgICAgIHJlcXVlc3RUZW1wbGF0ZXM6IHtcbiAgICAgICAgICAnYXBwbGljYXRpb24vanNvbic6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIGJvZHk6IFwiJHV0aWwuZXNjYXBlSmF2YVNjcmlwdCgkaW5wdXQuanNvbignJCcpKVwiLFxuICAgICAgICAgIH0pLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gTGFtYmRhIGludGVncmF0aW9uIGZvciBzYXZpbmcgaW1hZ2VzXG4gICAgY29uc3Qgc2F2ZUltYWdlSW50ZWdyYXRpb24gPSBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihcbiAgICAgIHNhdmVJbWFnZUxhbWJkYSxcbiAgICAgIHtcbiAgICAgICAgcmVxdWVzdFRlbXBsYXRlczoge1xuICAgICAgICAgICdhcHBsaWNhdGlvbi9qc29uJzogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgYm9keTogXCIkdXRpbC5lc2NhcGVKYXZhU2NyaXB0KCRpbnB1dC5qc29uKCckJykpXCIsXG4gICAgICAgICAgfSksXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBMYW1iZGEgaW50ZWdyYXRpb24gZm9yIFdlYlNvY2tldCBicm9hZGNhc3RpbmdcbiAgICBjb25zdCB3ZWJzb2NrZXRCcm9hZGNhc3RJbnRlZ3JhdGlvbiA9IG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKFxuICAgICAgd2Vic29ja2V0QnJvYWRjYXN0TGFtYmRhLFxuICAgICAge1xuICAgICAgICByZXF1ZXN0VGVtcGxhdGVzOiB7XG4gICAgICAgICAgJ2FwcGxpY2F0aW9uL2pzb24nOiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBib2R5OiBcIiR1dGlsLmVzY2FwZUphdmFTY3JpcHQoJGlucHV0Lmpzb24oJyQnKSlcIixcbiAgICAgICAgICB9KSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIENyZWF0ZSBBUEkgcmVzb3VyY2VzIGFuZCBtZXRob2RzIHdpdGggSldUIGF1dGhvcml6YXRpb25cbiAgICBjb25zdCB2aWRlb1Jlc291cmNlID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ2dlbmVyYXRlLXZpZGVvJyk7XG4gICAgdmlkZW9SZXNvdXJjZS5hZGRNZXRob2QoJ1BPU1QnLCBxdWV1ZU1hbmFnZXJJbnRlZ3JhdGlvbiwge1xuICAgICAgYXV0aG9yaXplcjogand0QXV0aG9yaXplcixcbiAgICB9KTtcblxuICAgIGNvbnN0IGZldGNoVmlkZW9zUmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZSgnZmV0Y2gtdmlkZW9zJyk7XG4gICAgZmV0Y2hWaWRlb3NSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIGZldGNoVmlkZW9zSW50ZWdyYXRpb24sIHtcbiAgICAgIGF1dGhvcml6ZXI6IGp3dEF1dGhvcml6ZXIsXG4gICAgfSk7XG5cbiAgICBjb25zdCBmZXRjaFByZXZpZXdSZXNvdXJjZSA9IGFwaS5yb290LmFkZFJlc291cmNlKCdmZXRjaC1wcmV2aWV3Jyk7XG4gICAgZmV0Y2hQcmV2aWV3UmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBmZXRjaFByZXZpZXdJbnRlZ3JhdGlvbiwge1xuICAgICAgYXV0aG9yaXplcjogand0QXV0aG9yaXplcixcbiAgICAgIHJlcXVlc3RQYXJhbWV0ZXJzOiB7XG4gICAgICAgICdtZXRob2QucmVxdWVzdC5xdWVyeXN0cmluZy50aW1lc3RhbXAnOiB0cnVlLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGNvbnN0IGdlbmVyYXRlQXVkaW9TdWJ0aXRsZVJlc291cmNlID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoXG4gICAgICAnZ2VuZXJhdGUtYXVkaW8tc3VidGl0bGUnLFxuICAgICk7XG4gICAgZ2VuZXJhdGVBdWRpb1N1YnRpdGxlUmVzb3VyY2UuYWRkTWV0aG9kKFxuICAgICAgJ1BPU1QnLFxuICAgICAgZ2VuZXJhdGVBdWRpb1N1YnRpdGxlSW50ZWdyYXRpb24sXG4gICAgICB7XG4gICAgICAgIGF1dGhvcml6ZXI6IGp3dEF1dGhvcml6ZXIsXG4gICAgICB9LFxuICAgICk7XG5cbiAgICBjb25zdCBnZW5lcmF0ZUltYWdlUmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZSgnZ2VuZXJhdGUtaW1hZ2UnKTtcbiAgICBnZW5lcmF0ZUltYWdlUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgZ2VuZXJhdGVJbWFnZUludGVncmF0aW9uLCB7XG4gICAgICBhdXRob3JpemVyOiBqd3RBdXRob3JpemVyLFxuICAgIH0pO1xuXG4gICAgLy8gTGFtYmRhIGludGVncmF0aW9uIGZvciBhbmltYXRlLWltYWdlXG4gICAgY29uc3QgYW5pbWF0ZUltYWdlSW50ZWdyYXRpb24gPSBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihcbiAgICAgIGFuaW1hdGVJbWFnZUxhbWJkYSxcbiAgICAgIHtcbiAgICAgICAgcmVxdWVzdFRlbXBsYXRlczoge1xuICAgICAgICAgICdhcHBsaWNhdGlvbi9qc29uJzogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgYm9keTogXCIkdXRpbC5lc2NhcGVKYXZhU2NyaXB0KCRpbnB1dC5qc29uKCckJykpXCIsXG4gICAgICAgICAgICBxdWVyeVN0cmluZzogJyRpbnB1dC5wYXJhbXMoKS5xdWVyeXN0cmluZycsXG4gICAgICAgICAgfSksXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICBjb25zdCBhbmltYXRlSW1hZ2VSZXNvdXJjZSA9IGFwaS5yb290LmFkZFJlc291cmNlKCdhbmltYXRlLWltYWdlJyk7XG4gICAgYW5pbWF0ZUltYWdlUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgYW5pbWF0ZUltYWdlSW50ZWdyYXRpb24sIHtcbiAgICAgIGF1dGhvcml6ZXI6IGp3dEF1dGhvcml6ZXIsXG4gICAgICByZXF1ZXN0UGFyYW1ldGVyczoge1xuICAgICAgICAnbWV0aG9kLnJlcXVlc3QucXVlcnlzdHJpbmcudGltZXN0YW1wJzogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBjb25zdCBzYXZlSW1hZ2VSZXNvdXJjZSA9IGFwaS5yb290LmFkZFJlc291cmNlKCdzYXZlLWltYWdlJyk7XG4gICAgc2F2ZUltYWdlUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgc2F2ZUltYWdlSW50ZWdyYXRpb24sIHtcbiAgICAgIGF1dGhvcml6ZXI6IGp3dEF1dGhvcml6ZXIsXG4gICAgfSk7XG5cbiAgICBjb25zdCB1c2VyTWFuYWdlbWVudFJlc291cmNlID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ3VzZXInKTtcbiAgICB1c2VyTWFuYWdlbWVudFJlc291cmNlLmFkZE1ldGhvZCgnUE9TVCcsIHVwc2VydFVzZXJJbnRlZ3JhdGlvbiwge1xuICAgICAgYXV0aG9yaXplcjogand0QXV0aG9yaXplcixcbiAgICB9KTtcblxuICAgIC8vIEFkZCBHRVQgbWV0aG9kIHdpdGggcXVlcnkgcGFyYW1ldGVyc1xuICAgIHVzZXJNYW5hZ2VtZW50UmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBnZXRVc2VySW50ZWdyYXRpb24sIHtcbiAgICAgIGF1dGhvcml6ZXI6IGp3dEF1dGhvcml6ZXIsXG4gICAgICByZXF1ZXN0UGFyYW1ldGVyczoge1xuICAgICAgICAnbWV0aG9kLnJlcXVlc3QucXVlcnlzdHJpbmcudXNlcklkJzogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBjb25zdCBkZWxldGVWaWRlb1Jlc291cmNlID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ2RlbGV0ZS12aWRlbycpO1xuICAgIGRlbGV0ZVZpZGVvUmVzb3VyY2UuYWRkTWV0aG9kKCdERUxFVEUnLCBkZWxldGVWaWRlb0ludGVncmF0aW9uLCB7XG4gICAgICBhdXRob3JpemVyOiBqd3RBdXRob3JpemVyLFxuICAgICAgcmVxdWVzdFBhcmFtZXRlcnM6IHtcbiAgICAgICAgJ21ldGhvZC5yZXF1ZXN0LnF1ZXJ5c3RyaW5nLnRpbWVzdGFtcCc6IHRydWUsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgY29uc3Qgd2Vic29ja2V0QnJvYWRjYXN0UmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZShcbiAgICAgICd3ZWJzb2NrZXQtYnJvYWRjYXN0JyxcbiAgICApO1xuICAgIHdlYnNvY2tldEJyb2FkY2FzdFJlc291cmNlLmFkZE1ldGhvZChcbiAgICAgICdQT1NUJyxcbiAgICAgIHdlYnNvY2tldEJyb2FkY2FzdEludGVncmF0aW9uLFxuICAgICAge1xuICAgICAgICBhdXRob3JpemVyOiBqd3RBdXRob3JpemVyLFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gUHVibGljIHNoYXJlIHJlc29sdmUgZW5kcG9pbnQgKG5vIGF1dGgpXG4gICAgY29uc3Qgc2hhcmVSZXNvdXJjZSA9IGFwaS5yb290LmFkZFJlc291cmNlKCdzJyk7XG4gICAgY29uc3Qgc2hhcmVUb2tlblJlc291cmNlID0gc2hhcmVSZXNvdXJjZS5hZGRSZXNvdXJjZSgne3Rva2VufScpO1xuICAgIGNvbnN0IHNoYXJlUmVzb2x2ZUludGVncmF0aW9uID0gbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oXG4gICAgICBzaGFyZVJlc29sdmVMYW1iZGEsXG4gICAgICB7XG4gICAgICAgIHJlcXVlc3RUZW1wbGF0ZXM6IHtcbiAgICAgICAgICAnYXBwbGljYXRpb24vanNvbic6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIHBhdGhQYXJhbWV0ZXJzOiB7XG4gICAgICAgICAgICAgIHRva2VuOiBcIiRpbnB1dC5wYXJhbXMoJ3Rva2VuJylcIixcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSksXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICk7XG4gICAgc2hhcmVUb2tlblJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgc2hhcmVSZXNvbHZlSW50ZWdyYXRpb24sIHtcbiAgICAgIC8vIGludGVudGlvbmFsbHkgdW5hdXRoZW50aWNhdGVkXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==