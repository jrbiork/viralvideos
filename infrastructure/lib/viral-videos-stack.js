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
    }
}
exports.ViralVideosStack = ViralVideosStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlyYWwtdmlkZW9zLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidmlyYWwtdmlkZW9zLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG1DQUFtQztBQUVuQyx5Q0FBeUM7QUFDekMsaURBQWlEO0FBQ2pELDJDQUEyQztBQUMzQyw2Q0FBNkM7QUFDN0MsMkNBQTJDO0FBQzNDLDJFQUEyRTtBQUMzRSx5REFBeUQ7QUFDekQsNkRBQTZEO0FBQzdELHNGQUFzRjtBQUN0RixxREFBcUQ7QUFDckQsNkJBQTZCO0FBQzdCLGlDQUFpQztBQUVqQyw0Q0FBNEM7QUFDNUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxTQUFTLENBQUMsRUFBRSxDQUFDLENBQUM7QUFFekQsTUFBYSxnQkFBaUIsU0FBUSxHQUFHLENBQUMsS0FBSztJQUM3QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXNCO1FBQzlELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLDhCQUE4QjtRQUM5QixNQUFNLFlBQVksR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWMsSUFBSSxFQUFFLENBQUM7UUFDdEQsTUFBTSxZQUFZLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLElBQUksRUFBRSxDQUFDO1FBQ3RELE1BQU0sWUFBWSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBYyxJQUFJLEVBQUUsQ0FBQztRQUV0RCxNQUFNLG1CQUFtQixHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMscUJBQXFCLElBQUksRUFBRSxDQUFDO1FBQ3BFLE1BQU0sWUFBWSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZSxJQUFJLEVBQUUsQ0FBQztRQUV2RCxJQUFJLENBQUMsbUJBQW1CLEVBQUUsQ0FBQztZQUN6QixPQUFPLENBQUMsSUFB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Q0FBQyxXQUFXLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDN0QsaUJBQWlCLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRSxvQkFBb0IsRUFBRTtZQUN4RCxVQUFVLEVBQUUsYUFBYTtTQUMxQixDQUFDLENBQUM7UUFFSCxNQUFNLHNCQUFzQixHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzVELHNCQUFzQixDQUFDLFNBQVMsQ0FBQyxNQUFNLEVBQUUscUJBQXFCLEVBQUU7WUFDOUQsVUFBVSxFQUFFLGFBQWE7U0FDMUIsQ0FBQyxDQUFDO1FBRUgsdUNBQXVDO1FBQ3ZDLHNCQUFzQixDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUUsa0JBQWtCLEVBQUU7WUFDMUQsVUFBVSxFQUFFLGFBQWE7WUFDekIsaUJBQWlCLEVBQUU7Z0JBQ2pCLG1DQUFtQyxFQUFFLElBQUk7YUFDMUM7U0FDRixDQUFDLENBQUM7UUFFSCxNQUFNLG1CQUFtQixHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQ2pFLG1CQUFtQixDQUFDLFNBQVMsQ0FBQyxRQUFRLEVBQUUsc0JBQXNCLEVBQUU7WUFDOUQsVUFBVSxFQUFFLGFBQWE7WUFDekIsaUJBQWlCLEVBQUU7Z0JBQ2pCLHNDQUFzQyxFQUFFLElBQUk7YUFDN0M7U0FDRixDQUFDLENBQUM7UUFFSCxNQUFNLDBCQUEwQixHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUNyRCxxQkFBcUIsQ0FDdEIsQ0FBQztRQUNGLDBCQUEwQixDQUFDLFNBQVMsQ0FDbEMsTUFBTSxFQUNOLDZCQUE2QixFQUM3QjtZQUNFLFVBQVUsRUFBRSxhQUFhO1NBQzFCLENBQ0YsQ0FBQztJQUNKLENBQUM7Q0FDRjtBQS8wQkQsNENBKzBCQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBsb2dzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sb2dzJztcbmltcG9ydCAqIGFzIHNxcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc3FzJztcbmltcG9ydCAqIGFzIGxhbWJkYUV2ZW50U291cmNlcyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhLWV2ZW50LXNvdXJjZXMnO1xuaW1wb3J0ICogYXMgYXBpZ2F0ZXdheSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtYXBpZ2F0ZXdheSc7XG5pbXBvcnQgKiBhcyBhcGlnYXRld2F5djIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXl2Mic7XG5pbXBvcnQgKiBhcyBhcGlnYXRld2F5djJJbnRlZ3JhdGlvbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXl2Mi1pbnRlZ3JhdGlvbnMnO1xuaW1wb3J0ICogYXMgZHluYW1vZGIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWR5bmFtb2RiJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgKiBhcyBkb3RlbnYgZnJvbSAnZG90ZW52JztcblxuLy8gTG9hZCBlbnZpcm9ubWVudCB2YXJpYWJsZXMgZnJvbSAuZW52IGZpbGVcbmRvdGVudi5jb25maWcoeyBwYXRoOiBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLmVudicpIH0pO1xuXG5leHBvcnQgY2xhc3MgVmlyYWxWaWRlb3NTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzPzogY2RrLlN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIC8vIEdldCBBUEkga2V5cyB3aXRoIGZhbGxiYWNrc1xuICAgIGNvbnN0IHJ1bndheUFwaUtleSA9IHByb2Nlc3MuZW52LlJVTldBWV9BUElfS0VZIHx8ICcnO1xuICAgIGNvbnN0IG9wZW5haUFwaUtleSA9IHByb2Nlc3MuZW52Lk9QRU5BSV9BUElfS0VZIHx8ICcnO1xuICAgIGNvbnN0IGdlbWluaUFwaUtleSA9IHByb2Nlc3MuZW52LkdFTUlOSV9BUElfS0VZIHx8ICcnO1xuXG4gICAgY29uc3Qgd2Vic29ja2V0RG9tYWluTmFtZSA9IHByb2Nlc3MuZW52LldFQlNPQ0tFVF9ET01BSU5fTkFNRSB8fCAnJztcbiAgICBjb25zdCB3ZWJzb2NrZXRFbnYgPSBwcm9jZXNzLmVudi5XRUJTT0NLRVRfU1RBR0UgfHwgJyc7XG5cbiAgICBpZiAoIXdlYnNvY2tldERvbWFpbk5hbWUpIHtcbiAgICAgIGNvbnNvbGUud2Fybign4pqg77iPICBXRUJTT0NLRVRfRE9NQUlOX05BTUUgaXMgbm90IHNldC4gV2ViU29ja2V0IG1heSBmYWlsLicpO1xuICAgIH1cbiAgICBpZiAoIXdlYnNvY2tldEVudikge1xuICAgICAgY29uc29sZS53YXJuKCfimqDvuI8gIFdFQlNPQ0tFVF9TVEFHRSBpcyBub3Qgc2V0LiBXZWJTb2NrZXQgbWF5IGZhaWwuJyk7XG4gICAgfVxuXG4gICAgLy8gVmFsaWRhdGUgQVBJIGtleXNcbiAgICBpZiAoIXJ1bndheUFwaUtleSkge1xuICAgICAgY29uc29sZS53YXJuKCfimqDvuI8gIFJVTldBWV9BUElfS0VZIGlzIG5vdCBzZXQuIFZpZGVvIGdlbmVyYXRpb24gbWF5IGZhaWwuJyk7XG4gICAgfVxuICAgIGlmICghb3BlbmFpQXBpS2V5KSB7XG4gICAgICBjb25zb2xlLndhcm4oJ+KaoO+4jyAgT1BFTkFJX0FQSV9LRVkgaXMgbm90IHNldC4gVmlkZW8gZ2VuZXJhdGlvbiBtYXkgZmFpbC4nKTtcbiAgICB9XG4gICAgaWYgKCFnZW1pbmlBcGlLZXkpIHtcbiAgICAgIGNvbnNvbGUud2Fybign4pqg77iPICBHRU1JTklfQVBJX0tFWSBpcyBub3Qgc2V0LiBJbWFnZSBnZW5lcmF0aW9uIG1heSBmYWlsLicpO1xuICAgIH1cblxuICAgIC8vIFMzIEJ1Y2tldCBmb3Igc3RvcmluZyB2aWRlb3MgYW5kIGFzc2V0c1xuICAgIGNvbnN0IHZpZGVvQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCAnVmlkZW9CdWNrZXQnLCB7XG4gICAgICBidWNrZXROYW1lOiBgdmlyYWwtdmlkZW9zLSR7dGhpcy5hY2NvdW50fS0ke3RoaXMucmVnaW9ufWAsXG4gICAgICB2ZXJzaW9uZWQ6IHRydWUsXG4gICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsXG4gICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSwgLy8gRm9yIGRlbW8gcHVycG9zZXNcbiAgICAgIGxpZmVjeWNsZVJ1bGVzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogJ0RlbGV0ZU9sZEFzc2V0cycsXG4gICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBub25jdXJyZW50VmVyc2lvbkV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKDE1KSxcbiAgICAgICAgICBleHBpcmF0aW9uOiBjZGsuRHVyYXRpb24uZGF5cygzMCksXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gUzMgQnVja2V0IGZvciBzdG9yaW5nIHZpZGVvIHBhcnRzXG4gICAgY29uc3QgdmlkZW9QYXJ0c0J1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ1ZpZGVvUGFydHNCdWNrZXQnLCB7XG4gICAgICBidWNrZXROYW1lOiBgdmlkZW8tcGFydHMtJHt0aGlzLmFjY291bnR9LSR7dGhpcy5yZWdpb259YCxcbiAgICAgIHZlcnNpb25lZDogdHJ1ZSxcbiAgICAgIGVuY3J5cHRpb246IHMzLkJ1Y2tldEVuY3J5cHRpb24uUzNfTUFOQUdFRCxcbiAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBzMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLCAvLyBGb3IgZGVtbyBwdXJwb3Nlc1xuICAgICAgbGlmZWN5Y2xlUnVsZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGlkOiAnRGVsZXRlT2xkVmlkZW9QYXJ0cycsXG4gICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBub25jdXJyZW50VmVyc2lvbkV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKDE1KSxcbiAgICAgICAgICBleHBpcmF0aW9uOiBjZGsuRHVyYXRpb24uZGF5cygzMCksXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gU1FTIFF1ZXVlIGZvciB2aWRlbyBnZW5lcmF0aW9uIHJlcXVlc3RzXG4gICAgY29uc3QgdmlkZW9RdWV1ZSA9IG5ldyBzcXMuUXVldWUodGhpcywgJ1ZpZGVvR2VuZXJhdGlvblF1ZXVlJywge1xuICAgICAgcXVldWVOYW1lOiAndmlkZW8tZ2VuZXJhdGlvbi1xdWV1ZScsXG4gICAgICB2aXNpYmlsaXR5VGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMTUpLCAvLyBNYXRjaCBsYW1iZGEgdGltZW91dFxuICAgICAgcmV0ZW50aW9uUGVyaW9kOiBjZGsuRHVyYXRpb24uZGF5cyg0KSxcbiAgICAgIGRlYWRMZXR0ZXJRdWV1ZToge1xuICAgICAgICBxdWV1ZTogbmV3IHNxcy5RdWV1ZSh0aGlzLCAnVmlkZW9HZW5lcmF0aW9uRExRJywge1xuICAgICAgICAgIHF1ZXVlTmFtZTogJ3ZpZGVvLWdlbmVyYXRpb24tZGxxJyxcbiAgICAgICAgICByZXRlbnRpb25QZXJpb2Q6IGNkay5EdXJhdGlvbi5kYXlzKDE0KSxcbiAgICAgICAgfSksXG4gICAgICAgIG1heFJlY2VpdmVDb3VudDogMyxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBEeW5hbW9EQiBVc2VycyBUYWJsZVxuICAgIGNvbnN0IHVzZXJzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ1VzZXJzVGFibGUnLCB7XG4gICAgICB0YWJsZU5hbWU6ICd2aXJhbC12aWRlb3MtdXNlcnMnLFxuICAgICAgcGFydGl0aW9uS2V5OiB7XG4gICAgICAgIG5hbWU6ICd1c2VySWQnLFxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcbiAgICAgIH0sXG4gICAgICBzb3J0S2V5OiB7XG4gICAgICAgIG5hbWU6ICd1c2VybmFtZScsXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxuICAgICAgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLCAvLyBGb3IgZGVtbyBwdXJwb3Nlc1xuICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeTogdHJ1ZSxcbiAgICB9KTtcblxuICAgIC8vIER5bmFtb0RCIFdlYlNvY2tldCBDb25uZWN0aW9ucyBUYWJsZVxuICAgIGNvbnN0IHdlYnNvY2tldENvbm5lY3Rpb25zVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUoXG4gICAgICB0aGlzLFxuICAgICAgJ1dlYlNvY2tldENvbm5lY3Rpb25zVGFibGUnLFxuICAgICAge1xuICAgICAgICB0YWJsZU5hbWU6ICd2aXJhbC12aWRlb3Mtd2Vic29ja2V0LWNvbm5lY3Rpb25zJyxcbiAgICAgICAgcGFydGl0aW9uS2V5OiB7XG4gICAgICAgICAgbmFtZTogJ2Nvbm5lY3Rpb25JZCcsXG4gICAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXG4gICAgICAgIH0sXG4gICAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksIC8vIEZvciBkZW1vIHB1cnBvc2VzXG4gICAgICAgIHRpbWVUb0xpdmVBdHRyaWJ1dGU6ICd0dGwnLCAvLyBBdXRvLWRlbGV0ZSBleHBpcmVkIGNvbm5lY3Rpb25zXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBBZGQgR1NJIGZvciB1c2VySWQgbG9va3Vwc1xuICAgIHdlYnNvY2tldENvbm5lY3Rpb25zVGFibGUuYWRkR2xvYmFsU2Vjb25kYXJ5SW5kZXgoe1xuICAgICAgaW5kZXhOYW1lOiAnVXNlcklkSW5kZXgnLFxuICAgICAgcGFydGl0aW9uS2V5OiB7XG4gICAgICAgIG5hbWU6ICd1c2VySWQnLFxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcbiAgICAgIH0sXG4gICAgICBwcm9qZWN0aW9uVHlwZTogZHluYW1vZGIuUHJvamVjdGlvblR5cGUuQUxMLFxuICAgIH0pO1xuXG4gICAgLy8gQWRkIEdTSSBmb3IgdXNlcm5hbWUgbG9va3Vwc1xuICAgIHVzZXJzVGFibGUuYWRkR2xvYmFsU2Vjb25kYXJ5SW5kZXgoe1xuICAgICAgaW5kZXhOYW1lOiAnVXNlcm5hbWVJbmRleCcsXG4gICAgICBwYXJ0aXRpb25LZXk6IHtcbiAgICAgICAgbmFtZTogJ3VzZXJuYW1lJyxcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXG4gICAgICB9LFxuICAgICAgcHJvamVjdGlvblR5cGU6IGR5bmFtb2RiLlByb2plY3Rpb25UeXBlLkFMTCxcbiAgICB9KTtcblxuICAgIC8vIElBTSBSb2xlIGZvciBMYW1iZGFcbiAgICBjb25zdCBsYW1iZGFSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdWaWRlb0dlbmVyYXRpb25MYW1iZGFSb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2xhbWJkYS5hbWF6b25hd3MuY29tJyksXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKFxuICAgICAgICAgICdzZXJ2aWNlLXJvbGUvQVdTTGFtYmRhQmFzaWNFeGVjdXRpb25Sb2xlJyxcbiAgICAgICAgKSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCBTMyBwZXJtaXNzaW9ucyB0byBMYW1iZGFcbiAgICB2aWRlb0J1Y2tldC5ncmFudFJlYWRXcml0ZShsYW1iZGFSb2xlKTtcbiAgICB2aWRlb1BhcnRzQnVja2V0LmdyYW50UmVhZFdyaXRlKGxhbWJkYVJvbGUpO1xuXG4gICAgLy8gR3JhbnQgU1FTIHBlcm1pc3Npb25zIHRvIExhbWJkYVxuICAgIHZpZGVvUXVldWUuZ3JhbnRTZW5kTWVzc2FnZXMobGFtYmRhUm9sZSk7XG4gICAgdmlkZW9RdWV1ZS5ncmFudENvbnN1bWVNZXNzYWdlcyhsYW1iZGFSb2xlKTtcblxuICAgIC8vIEdyYW50IER5bmFtb0RCIHBlcm1pc3Npb25zIHRvIExhbWJkYVxuICAgIHVzZXJzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGxhbWJkYVJvbGUpO1xuICAgIHdlYnNvY2tldENvbm5lY3Rpb25zVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGxhbWJkYVJvbGUpO1xuXG4gICAgLy8gQ3JlYXRlIEZGbXBlZyBMYW1iZGEgTGF5ZXJcbiAgICBjb25zdCBmZm1wZWdMYXllciA9IG5ldyBsYW1iZGEuTGF5ZXJWZXJzaW9uKHRoaXMsICdGRm1wZWdMYXllcicsIHtcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcbiAgICAgICAgcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2xheWVycy9mZm1wZWctbGF5ZXInKSxcbiAgICAgICksXG4gICAgICBjb21wYXRpYmxlUnVudGltZXM6IFtsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWF0sXG4gICAgICBkZXNjcmlwdGlvbjogJ0ZGbXBlZyBiaW5hcmllcyBmb3IgdmlkZW8gcHJvY2Vzc2luZycsXG4gICAgICBsYXllclZlcnNpb25OYW1lOiAnZmZtcGVnLWxheWVyJyxcbiAgICB9KTtcblxuICAgIC8vIExhbWJkYSBmdW5jdGlvbiBmb3IgdmlkZW8gZ2VuZXJhdGlvbiAobm93IHRyaWdnZXJlZCBieSBTUVMpXG4gICAgY29uc3QgdmlkZW9HZW5lcmF0aW9uTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbihcbiAgICAgIHRoaXMsXG4gICAgICAnVmlkZW9HZW5lcmF0aW9uTGFtYmRhJyxcbiAgICAgIHtcbiAgICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXG4gICAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFxuICAgICAgICAgIHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9kaXN0L3ZpZGVvLWdlbmVyYXRpb24nKSxcbiAgICAgICAgKSxcbiAgICAgICAgcm9sZTogbGFtYmRhUm9sZSxcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMTUpLFxuICAgICAgICBtZW1vcnlTaXplOiAzMDA4LCAvLyBJbmNyZWFzZWQgZm9yIHZpZGVvIHByb2Nlc3NpbmdcbiAgICAgICAgbG9nR3JvdXA6IG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdWaWRlb0dlbmVyYXRpb25MYW1iZGFMb2dHcm91cCcsIHtcbiAgICAgICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSyxcbiAgICAgICAgfSksXG4gICAgICAgIGxheWVyczogW2ZmbXBlZ0xheWVyXSxcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICBWSURFT19CVUNLRVRfTkFNRTogdmlkZW9CdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgICAgICBWSURFT19QQVJUU19CVUNLRVRfTkFNRTogdmlkZW9QYXJ0c0J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgICAgIFVTRVJTX1RBQkxFX05BTUU6IHVzZXJzVGFibGUudGFibGVOYW1lLFxuICAgICAgICAgIFJVTldBWV9BUElfS0VZOiBydW53YXlBcGlLZXksXG4gICAgICAgICAgT1BFTkFJX0FQSV9LRVk6IG9wZW5haUFwaUtleSxcbiAgICAgICAgICBHRU1JTklfQVBJX0tFWTogZ2VtaW5pQXBpS2V5LFxuICAgICAgICAgIFZJREVPX1FVRVVFX1VSTDogdmlkZW9RdWV1ZS5xdWV1ZVVybCxcbiAgICAgICAgICBQQVRIOiAnL29wdC9iaW46L3Vzci9sb2NhbC9iaW46L3Vzci9iaW4vOi9iaW4nLFxuICAgICAgICAgIEZPTlRDT05GSUdfUEFUSDogJy9vcHQvZXRjL2ZvbnRzJyxcbiAgICAgICAgICBGT05UQ09ORklHX0ZJTEU6ICcvb3B0L2V0Yy9mb250cy9mb250cy5jb25mJyxcbiAgICAgICAgICBXRUJTT0NLRVRfRE9NQUlOX05BTUU6IHdlYnNvY2tldERvbWFpbk5hbWUsXG4gICAgICAgICAgV0VCU09DS0VUX1NUQUdFOiB3ZWJzb2NrZXRFbnYsXG4gICAgICAgICAgV0VCU09DS0VUX0NPTk5FQ1RJT05TX1RBQkxFX05BTUU6IHdlYnNvY2tldENvbm5lY3Rpb25zVGFibGUudGFibGVOYW1lLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gQWRkIFNRUyBldmVudCBzb3VyY2UgdG8gdmlkZW8gZ2VuZXJhdGlvbiBsYW1iZGFcbiAgICB2aWRlb0dlbmVyYXRpb25MYW1iZGEuYWRkRXZlbnRTb3VyY2UoXG4gICAgICBuZXcgbGFtYmRhRXZlbnRTb3VyY2VzLlNxc0V2ZW50U291cmNlKHZpZGVvUXVldWUsIHtcbiAgICAgICAgYmF0Y2hTaXplOiAxLCAvLyBQcm9jZXNzIG9uZSBtZXNzYWdlIGF0IGEgdGltZVxuICAgICAgICBtYXhCYXRjaGluZ1dpbmRvdzogY2RrLkR1cmF0aW9uLnNlY29uZHMoMCksXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgLy8gTGFtYmRhIGZ1bmN0aW9uIGZvciBxdWV1ZSBtYW5hZ2VtZW50IChyZWNlaXZlcyByZXF1ZXN0cyBhbmQgcHV0cyB0aGVtIGluIFNRUylcbiAgICBjb25zdCBmdWxsVmlkZW9RdWV1ZUxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24oXG4gICAgICB0aGlzLFxuICAgICAgJ0Z1bGxWaWRlb1F1ZXVlTGFtYmRhJyxcbiAgICAgIHtcbiAgICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXG4gICAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFxuICAgICAgICAgIHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9kaXN0L3ZpZGVvLXF1ZXVlJyksXG4gICAgICAgICksXG4gICAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDEpLFxuICAgICAgICBtZW1vcnlTaXplOiAxMjgsXG4gICAgICAgIGxvZ0dyb3VwOiBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnRnVsbFZpZGVvUXVldWVMYW1iZGFMb2dHcm91cCcsIHtcbiAgICAgICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSyxcbiAgICAgICAgfSksXG4gICAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgICAgVklERU9fUVVFVUVfVVJMOiB2aWRlb1F1ZXVlLnF1ZXVlVXJsLFxuICAgICAgICAgIFVTRVJTX1RBQkxFX05BTUU6IHVzZXJzVGFibGUudGFibGVOYW1lLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gQ3JlYXRlIGEgc2VwYXJhdGUgcm9sZSBmb3IgSldUIGF1dGhvcml6ZXIgdG8gYXZvaWQgY2lyY3VsYXIgZGVwZW5kZW5jaWVzXG4gICAgY29uc3Qgand0QXV0aG9yaXplclJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0pXVEF1dGhvcml6ZXJSb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2xhbWJkYS5hbWF6b25hd3MuY29tJyksXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKFxuICAgICAgICAgICdzZXJ2aWNlLXJvbGUvQVdTTGFtYmRhQmFzaWNFeGVjdXRpb25Sb2xlJyxcbiAgICAgICAgKSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCBEeW5hbW9EQiBwZXJtaXNzaW9ucyB0byBKV1QgYXV0aG9yaXplclxuICAgIHVzZXJzVGFibGUuZ3JhbnRSZWFkRGF0YShqd3RBdXRob3JpemVyUm9sZSk7XG5cbiAgICAvLyBMYW1iZGEgZnVuY3Rpb24gZm9yIEpXVCBhdXRob3JpemF0aW9uXG4gICAgY29uc3Qgand0QXV0aG9yaXplckxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24oXG4gICAgICB0aGlzLFxuICAgICAgJ0pXVEF1dGhvcml6ZXJMYW1iZGEnLFxuICAgICAge1xuICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcbiAgICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXG4gICAgICAgICAgcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2Rpc3Qvand0LWF1dGhvcml6ZXInKSxcbiAgICAgICAgKSxcbiAgICAgICAgcm9sZTogand0QXV0aG9yaXplclJvbGUsXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgICAgbWVtb3J5U2l6ZTogMTI4LFxuICAgICAgICBsb2dHcm91cDogbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ0pXVEF1dGhvcml6ZXJMYW1iZGFMb2dHcm91cCcsIHtcbiAgICAgICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSyxcbiAgICAgICAgfSksXG4gICAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgICAgTkVYVF9QVUJMSUNfQ09HTklUT19VU0VSX1BPT0xfSUQ6XG4gICAgICAgICAgICBwcm9jZXNzLmVudi5ORVhUX1BVQkxJQ19DT0dOSVRPX1VTRVJfUE9PTF9JRCB8fCAnJyxcbiAgICAgICAgICBORVhUX1BVQkxJQ19DT0dOSVRPX0NMSUVOVF9JRDpcbiAgICAgICAgICAgIHByb2Nlc3MuZW52Lk5FWFRfUFVCTElDX0NPR05JVE9fQ0xJRU5UX0lEIHx8ICcnLFxuICAgICAgICAgIE5FWFRfUFVCTElDX0NPR05JVE9fUkVHSU9OOlxuICAgICAgICAgICAgcHJvY2Vzcy5lbnYuTkVYVF9QVUJMSUNfQ09HTklUT19SRUdJT04gfHwgJ3VzLWVhc3QtMScsXG4gICAgICAgICAgVVNFUlNfVEFCTEVfTkFNRTogdXNlcnNUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBMYW1iZGEgZnVuY3Rpb24gZm9yIGZldGNoaW5nIHZpZGVvc1xuICAgIGNvbnN0IGZldGNoVmlkZW9zTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnRmV0Y2hWaWRlb3NMYW1iZGEnLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vZGlzdC9mZXRjaC12aWRlb3MnKSksXG4gICAgICByb2xlOiBsYW1iZGFSb2xlLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMSksXG4gICAgICBtZW1vcnlTaXplOiAxMjgsXG4gICAgICBsb2dHcm91cDogbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ0ZldGNoVmlkZW9zTGFtYmRhTG9nR3JvdXAnLCB7XG4gICAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgfSksXG5cbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFZJREVPX0JVQ0tFVF9OQU1FOiB2aWRlb0J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgICBWSURFT19QQVJUU19CVUNLRVRfTkFNRTogdmlkZW9QYXJ0c0J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgICBVU0VSU19UQUJMRV9OQU1FOiB1c2Vyc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBMYW1iZGEgZnVuY3Rpb24gZm9yIGZldGNoaW5nIHByZXZpZXcgZGF0YVxuICAgIGNvbnN0IGZldGNoUHJldmlld0xhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0ZldGNoUHJldmlld0xhbWJkYScsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFxuICAgICAgICBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vZGlzdC9mZXRjaC1wcmV2aWV3JyksXG4gICAgICApLFxuICAgICAgcm9sZTogbGFtYmRhUm9sZSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDEpLFxuICAgICAgbWVtb3J5U2l6ZTogMTI4LFxuICAgICAgbG9nR3JvdXA6IG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdGZXRjaFByZXZpZXdMYW1iZGFMb2dHcm91cCcsIHtcbiAgICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgICB9KSxcblxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgVklERU9fQlVDS0VUX05BTUU6IHZpZGVvQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICAgIFZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FOiB2aWRlb1BhcnRzQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICAgIFVSTF9UVExfU0VDT05EUzogJzM2MDAwJyxcbiAgICAgICAgTUFYX1NDRU5FUzogJzEwJyxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBMYW1iZGEgZnVuY3Rpb24gZm9yIHVzZXIgbWFuYWdlbWVudFxuICAgIGNvbnN0IGdldFVzZXJMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdHZXRVc2VyTGFtYmRhJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2Rpc3QvZ2V0LXVzZXInKSksXG4gICAgICByb2xlOiBsYW1iZGFSb2xlLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMSksXG4gICAgICBtZW1vcnlTaXplOiAxMjgsXG4gICAgICBsb2dHcm91cDogbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ0dldFVzZXJMYW1iZGFMb2dHcm91cCcsIHtcbiAgICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgICB9KSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFVTRVJTX1RBQkxFX05BTUU6IHVzZXJzVGFibGUudGFibGVOYW1lLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGNvbnN0IHVwc2VydFVzZXJMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdVcHNlcnRVc2VyTGFtYmRhJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2Rpc3QvdXBzZXJ0LXVzZXInKSksXG4gICAgICByb2xlOiBsYW1iZGFSb2xlLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMSksXG4gICAgICBtZW1vcnlTaXplOiAxMjgsXG4gICAgICBsb2dHcm91cDogbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ1Vwc2VydFVzZXJMYW1iZGFMb2dHcm91cCcsIHtcbiAgICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgICB9KSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFVTRVJTX1RBQkxFX05BTUU6IHVzZXJzVGFibGUudGFibGVOYW1lLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIExhbWJkYSBmdW5jdGlvbiBmb3IgZGVsZXRpbmcgdmlkZW9zXG4gICAgY29uc3QgZGVsZXRlVmlkZW9MYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdEZWxldGVWaWRlb0xhbWJkYScsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9kaXN0L2RlbGV0ZS12aWRlbycpKSxcbiAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcygxKSxcbiAgICAgIG1lbW9yeVNpemU6IDEyOCxcbiAgICAgIGxvZ0dyb3VwOiBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnRGVsZXRlVmlkZW9MYW1iZGFMb2dHcm91cCcsIHtcbiAgICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgICB9KSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFZJREVPX0JVQ0tFVF9OQU1FOiB2aWRlb0J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgICBWSURFT19QQVJUU19CVUNLRVRfTkFNRTogdmlkZW9QYXJ0c0J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIExhbWJkYSBmdW5jdGlvbiBmb3IgZ2VuZXJhdGluZyBhdWRpbyBuYXJyYXRpb25cbiAgICBjb25zdCBnZW5lcmF0ZUF1ZGlvU3VidGl0bGVMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKFxuICAgICAgdGhpcyxcbiAgICAgICdHZW5lcmF0ZUF1ZGlvU3VidGl0bGVMYW1iZGEnLFxuICAgICAge1xuICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcbiAgICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXG4gICAgICAgICAgcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2Rpc3QvZ2VuZXJhdGUtYXVkaW8tc3VidGl0bGUnKSxcbiAgICAgICAgKSxcbiAgICAgICAgcm9sZTogbGFtYmRhUm9sZSxcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICAgIG1lbW9yeVNpemU6IDUxMixcbiAgICAgICAgbG9nR3JvdXA6IG5ldyBsb2dzLkxvZ0dyb3VwKFxuICAgICAgICAgIHRoaXMsXG4gICAgICAgICAgJ0dlbmVyYXRlQXVkaW9TdWJ0aXRsZUxhbWJkYUxvZ0dyb3VwJyxcbiAgICAgICAgICB7XG4gICAgICAgICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSyxcbiAgICAgICAgICB9LFxuICAgICAgICApLFxuICAgICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAgIE9QRU5BSV9BUElfS0VZOiBvcGVuYWlBcGlLZXksXG4gICAgICAgICAgVklERU9fUEFSVFNfQlVDS0VUX05BTUU6IHZpZGVvUGFydHNCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgICAgICBXRUJTT0NLRVRfRE9NQUlOX05BTUU6IHdlYnNvY2tldERvbWFpbk5hbWUsXG4gICAgICAgICAgV0VCU09DS0VUX1NUQUdFOiB3ZWJzb2NrZXRFbnYsXG4gICAgICAgICAgV0VCU09DS0VUX0NPTk5FQ1RJT05TX1RBQkxFX05BTUU6IHdlYnNvY2tldENvbm5lY3Rpb25zVGFibGUudGFibGVOYW1lLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gTGFtYmRhIGZ1bmN0aW9uIGZvciBnZW5lcmF0aW5nIGltYWdlc1xuICAgIGNvbnN0IGdlbmVyYXRlSW1hZ2VMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKFxuICAgICAgdGhpcyxcbiAgICAgICdHZW5lcmF0ZUltYWdlTGFtYmRhJyxcbiAgICAgIHtcbiAgICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXG4gICAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFxuICAgICAgICAgIHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9kaXN0L2dlbmVyYXRlLWltYWdlJyksXG4gICAgICAgICksXG4gICAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgICBtZW1vcnlTaXplOiA1MTIsXG4gICAgICAgIGxvZ0dyb3VwOiBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnR2VuZXJhdGVJbWFnZUxhbWJkYUxvZ0dyb3VwJywge1xuICAgICAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgICB9KSxcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICBSVU5XQVlfQVBJX0tFWTogcnVud2F5QXBpS2V5LFxuICAgICAgICAgIEdFTUlOSV9BUElfS0VZOiBnZW1pbmlBcGlLZXksXG4gICAgICAgICAgVklERU9fUEFSVFNfQlVDS0VUX05BTUU6IHZpZGVvUGFydHNCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgICAgICBXRUJTT0NLRVRfRE9NQUlOX05BTUU6IHdlYnNvY2tldERvbWFpbk5hbWUsXG4gICAgICAgICAgV0VCU09DS0VUX1NUQUdFOiB3ZWJzb2NrZXRFbnYsXG4gICAgICAgICAgV0VCU09DS0VUX0NPTk5FQ1RJT05TX1RBQkxFX05BTUU6IHdlYnNvY2tldENvbm5lY3Rpb25zVGFibGUudGFibGVOYW1lLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gTGFtYmRhIGZ1bmN0aW9uIGZvciBhbmltYXRpbmcgYW4gaW1hZ2UgaW50byB2aWRlb1xuICAgIGNvbnN0IGFuaW1hdGVJbWFnZUxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0FuaW1hdGVJbWFnZUxhbWJkYScsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFxuICAgICAgICBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vZGlzdC9hbmltYXRlLWltYWdlJyksXG4gICAgICApLFxuICAgICAgcm9sZTogbGFtYmRhUm9sZSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgbWVtb3J5U2l6ZTogNTEyLFxuICAgICAgbG9nR3JvdXA6IG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdBbmltYXRlSW1hZ2VMYW1iZGFMb2dHcm91cCcsIHtcbiAgICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgICB9KSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFJVTldBWV9BUElfS0VZOiBydW53YXlBcGlLZXksXG4gICAgICAgIEdFTUlOSV9BUElfS0VZOiBnZW1pbmlBcGlLZXksXG4gICAgICAgIFZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FOiB2aWRlb1BhcnRzQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICAgIFdFQlNPQ0tFVF9ET01BSU5fTkFNRTogd2Vic29ja2V0RG9tYWluTmFtZSxcbiAgICAgICAgV0VCU09DS0VUX1NUQUdFOiB3ZWJzb2NrZXRFbnYsXG4gICAgICAgIFdFQlNPQ0tFVF9DT05ORUNUSU9OU19UQUJMRV9OQU1FOiB3ZWJzb2NrZXRDb25uZWN0aW9uc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgVklERU9fUVVFVUVfVVJMOiB2aWRlb1F1ZXVlLnF1ZXVlVXJsLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIExhbWJkYSBmdW5jdGlvbiBmb3Igc2F2aW5nIGltYWdlc1xuICAgIGNvbnN0IHNhdmVJbWFnZUxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1NhdmVJbWFnZUxhbWJkYScsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9kaXN0L3NhdmUtaW1hZ2UnKSksXG4gICAgICByb2xlOiBsYW1iZGFSb2xlLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMiksXG4gICAgICBtZW1vcnlTaXplOiA1MTIsXG4gICAgICBsb2dHcm91cDogbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ1NhdmVJbWFnZUxhbWJkYUxvZ0dyb3VwJywge1xuICAgICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSyxcbiAgICAgIH0pLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgVklERU9fUEFSVFNfQlVDS0VUX05BTUU6IHZpZGVvUGFydHNCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgICAgV0VCU09DS0VUX0RPTUFJTl9OQU1FOiB3ZWJzb2NrZXREb21haW5OYW1lLFxuICAgICAgICBXRUJTT0NLRVRfU1RBR0U6IHdlYnNvY2tldEVudixcbiAgICAgICAgV0VCU09DS0VUX0NPTk5FQ1RJT05TX1RBQkxFX05BTUU6IHdlYnNvY2tldENvbm5lY3Rpb25zVGFibGUudGFibGVOYW1lLFxuICAgICAgICBWSURFT19RVUVVRV9VUkw6IHZpZGVvUXVldWUucXVldWVVcmwsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQVBJIEdhdGV3YXkgUkVTVCBBUElcbiAgICBjb25zdCBhcGkgPSBuZXcgYXBpZ2F0ZXdheS5SZXN0QXBpKHRoaXMsICdWaWRlb0dlbmVyYXRpb25BcGknLCB7XG4gICAgICByZXN0QXBpTmFtZTogJ1ZpZGVvIEdlbmVyYXRpb24gQVBJJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVBJIGZvciB2aWRlbyBnZW5lcmF0aW9uIHJlcXVlc3RzJyxcbiAgICAgIGRlZmF1bHRDb3JzUHJlZmxpZ2h0T3B0aW9uczoge1xuICAgICAgICBhbGxvd09yaWdpbnM6IGFwaWdhdGV3YXkuQ29ycy5BTExfT1JJR0lOUyxcbiAgICAgICAgYWxsb3dNZXRob2RzOiBhcGlnYXRld2F5LkNvcnMuQUxMX01FVEhPRFMsXG4gICAgICAgIGFsbG93SGVhZGVyczogWydDb250ZW50LVR5cGUnLCAnQXV0aG9yaXphdGlvbiddLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIExhbWJkYSBpbnRlZ3JhdGlvbiBmb3IgdGhlIHF1ZXVlIG1hbmFnZXJcbiAgICBjb25zdCBxdWV1ZU1hbmFnZXJJbnRlZ3JhdGlvbiA9IG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKFxuICAgICAgZnVsbFZpZGVvUXVldWVMYW1iZGEsXG4gICAgICB7XG4gICAgICAgIHJlcXVlc3RUZW1wbGF0ZXM6IHtcbiAgICAgICAgICAnYXBwbGljYXRpb24vanNvbic6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIGJvZHk6IFwiJHV0aWwuZXNjYXBlSmF2YVNjcmlwdCgkaW5wdXQuanNvbignJCcpKVwiLFxuICAgICAgICAgIH0pLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gSldUIEF1dGhvcml6ZXJcbiAgICBjb25zdCBqd3RBdXRob3JpemVyID0gbmV3IGFwaWdhdGV3YXkuVG9rZW5BdXRob3JpemVyKFxuICAgICAgdGhpcyxcbiAgICAgICdKV1RBdXRob3JpemVyJyxcbiAgICAgIHtcbiAgICAgICAgaGFuZGxlcjogand0QXV0aG9yaXplckxhbWJkYSxcbiAgICAgICAgaWRlbnRpdHlTb3VyY2U6ICdtZXRob2QucmVxdWVzdC5oZWFkZXIuQXV0aG9yaXphdGlvbicsXG4gICAgICAgIGF1dGhvcml6ZXJOYW1lOiAnSldUQXV0aG9yaXplcicsXG4gICAgICAgIC8vIERpc2FibGUgY2FjaGluZyBjb21wbGV0ZWx5IGZvciBkZWJ1Z2dpbmdcbiAgICAgICAgcmVzdWx0c0NhY2hlVHRsOiBjZGsuRHVyYXRpb24uc2Vjb25kcygwKSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIExhbWJkYSBpbnRlZ3JhdGlvbiBmb3IgZmV0Y2hpbmcgdmlkZW9zXG4gICAgY29uc3QgZmV0Y2hWaWRlb3NJbnRlZ3JhdGlvbiA9IG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKFxuICAgICAgZmV0Y2hWaWRlb3NMYW1iZGEsXG4gICAgICB7XG4gICAgICAgIHJlcXVlc3RUZW1wbGF0ZXM6IHtcbiAgICAgICAgICAnYXBwbGljYXRpb24vanNvbic6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIGJvZHk6IFwiJHV0aWwuZXNjYXBlSmF2YVNjcmlwdCgkaW5wdXQuanNvbignJCcpKVwiLFxuICAgICAgICAgIH0pLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gTGFtYmRhIGludGVncmF0aW9uIGZvciBmZXRjaGluZyBwcmV2aWV3IGRhdGFcbiAgICBjb25zdCBmZXRjaFByZXZpZXdJbnRlZ3JhdGlvbiA9IG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKFxuICAgICAgZmV0Y2hQcmV2aWV3TGFtYmRhLFxuICAgICAge1xuICAgICAgICByZXF1ZXN0VGVtcGxhdGVzOiB7XG4gICAgICAgICAgJ2FwcGxpY2F0aW9uL2pzb24nOiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBxdWVyeVN0cmluZ1BhcmFtZXRlcnM6IHtcbiAgICAgICAgICAgICAgdGltZXN0YW1wOiBcIiRpbnB1dC5wYXJhbXMoJ3RpbWVzdGFtcCcpXCIsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0pLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gTGFtYmRhIGludGVncmF0aW9uIGZvciBnZXQgdXNlclxuICAgIGNvbnN0IGdldFVzZXJJbnRlZ3JhdGlvbiA9IG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGdldFVzZXJMYW1iZGEsIHtcbiAgICAgIHJlcXVlc3RUZW1wbGF0ZXM6IHtcbiAgICAgICAgJ2FwcGxpY2F0aW9uL2pzb24nOiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgcXVlcnlTdHJpbmdQYXJhbWV0ZXJzOiB7XG4gICAgICAgICAgICB1c2VySWQ6IFwiJGlucHV0LnBhcmFtcygndXNlcklkJylcIixcbiAgICAgICAgICB9LFxuICAgICAgICB9KSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBMYW1iZGEgaW50ZWdyYXRpb24gZm9yIHVwc2VydCB1c2VyXG4gICAgY29uc3QgdXBzZXJ0VXNlckludGVncmF0aW9uID0gbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oXG4gICAgICB1cHNlcnRVc2VyTGFtYmRhLFxuICAgICAge1xuICAgICAgICByZXF1ZXN0VGVtcGxhdGVzOiB7XG4gICAgICAgICAgJ2FwcGxpY2F0aW9uL2pzb24nOiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBib2R5OiBcIiR1dGlsLmVzY2FwZUphdmFTY3JpcHQoJGlucHV0Lmpzb24oJyQnKSlcIixcbiAgICAgICAgICB9KSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIExhbWJkYSBpbnRlZ3JhdGlvbiBmb3IgZGVsZXRpbmcgdmlkZW9zXG4gICAgY29uc3QgZGVsZXRlVmlkZW9JbnRlZ3JhdGlvbiA9IG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKFxuICAgICAgZGVsZXRlVmlkZW9MYW1iZGEsXG4gICAgICB7XG4gICAgICAgIHJlcXVlc3RUZW1wbGF0ZXM6IHtcbiAgICAgICAgICAnYXBwbGljYXRpb24vanNvbic6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIHF1ZXJ5U3RyaW5nUGFyYW1ldGVyczoge1xuICAgICAgICAgICAgICB0aW1lc3RhbXA6IFwiJGlucHV0LnBhcmFtcygndGltZXN0YW1wJylcIixcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSksXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBXZWJTb2NrZXQgTGFtYmRhIEZ1bmN0aW9uc1xuICAgIGNvbnN0IHdlYnNvY2tldENvbm5lY3RMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKFxuICAgICAgdGhpcyxcbiAgICAgICdXZWJTb2NrZXRDb25uZWN0TGFtYmRhJyxcbiAgICAgIHtcbiAgICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXG4gICAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFxuICAgICAgICAgIHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9kaXN0L3dlYnNvY2tldC1jb25uZWN0JyksXG4gICAgICAgICksXG4gICAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgICAgbWVtb3J5U2l6ZTogMTI4LFxuICAgICAgICBsb2dHcm91cDogbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ1dlYlNvY2tldENvbm5lY3RMYW1iZGFMb2dHcm91cCcsIHtcbiAgICAgICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSyxcbiAgICAgICAgfSksXG4gICAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgICAgV0VCU09DS0VUX0NPTk5FQ1RJT05TX1RBQkxFX05BTUU6IHdlYnNvY2tldENvbm5lY3Rpb25zVGFibGUudGFibGVOYW1lLFxuICAgICAgICAgIFVTRVJTX1RBQkxFX05BTUU6IHVzZXJzVGFibGUudGFibGVOYW1lLFxuICAgICAgICAgIENPR05JVE9fVVNFUl9QT09MX0lEOlxuICAgICAgICAgICAgcHJvY2Vzcy5lbnYuTkVYVF9QVUJMSUNfQ09HTklUT19VU0VSX1BPT0xfSUQgfHwgJycsXG4gICAgICAgICAgQ09HTklUT19DTElFTlRfSUQ6IHByb2Nlc3MuZW52Lk5FWFRfUFVCTElDX0NPR05JVE9fQ0xJRU5UX0lEIHx8ICcnLFxuICAgICAgICAgIENPR05JVE9fUkVHSU9OOiBwcm9jZXNzLmVudi5ORVhUX1BVQkxJQ19DT0dOSVRPX1JFR0lPTiB8fCAndXMtZWFzdC0xJyxcbiAgICAgICAgICBKV1RfQVVUSE9SSVpFUl9MQU1CREFfQVJOOiBqd3RBdXRob3JpemVyTGFtYmRhLmZ1bmN0aW9uQXJuLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gR3JhbnQgV2ViU29ja2V0IGNvbm5lY3QgbGFtYmRhIHBlcm1pc3Npb24gdG8gaW52b2tlIEpXVCBhdXRob3JpemVyXG4gICAgLy8gQWRkIHBlcm1pc3Npb24gZGlyZWN0bHkgdG8gdGhlIGxhbWJkYSByb2xlIHRvIGF2b2lkIGNpcmN1bGFyIGRlcGVuZGVuY3lcbiAgICBsYW1iZGFSb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFsnbGFtYmRhOkludm9rZUZ1bmN0aW9uJ10sXG4gICAgICAgIHJlc291cmNlczogW2p3dEF1dGhvcml6ZXJMYW1iZGEuZnVuY3Rpb25Bcm5dLFxuICAgICAgfSksXG4gICAgKTtcblxuICAgIGNvbnN0IHdlYnNvY2tldERpc2Nvbm5lY3RMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKFxuICAgICAgdGhpcyxcbiAgICAgICdXZWJTb2NrZXREaXNjb25uZWN0TGFtYmRhJyxcbiAgICAgIHtcbiAgICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXG4gICAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFxuICAgICAgICAgIHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9kaXN0L3dlYnNvY2tldC1kaXNjb25uZWN0JyksXG4gICAgICAgICksXG4gICAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgICAgbWVtb3J5U2l6ZTogMTI4LFxuICAgICAgICBsb2dHcm91cDogbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ1dlYlNvY2tldERpc2Nvbm5lY3RMYW1iZGFMb2dHcm91cCcsIHtcbiAgICAgICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSyxcbiAgICAgICAgfSksXG4gICAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgICAgV0VCU09DS0VUX0NPTk5FQ1RJT05TX1RBQkxFX05BTUU6IHdlYnNvY2tldENvbm5lY3Rpb25zVGFibGUudGFibGVOYW1lLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgY29uc3Qgd2Vic29ja2V0TWVzc2FnZUxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24oXG4gICAgICB0aGlzLFxuICAgICAgJ1dlYlNvY2tldE1lc3NhZ2VMYW1iZGEnLFxuICAgICAge1xuICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcbiAgICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXG4gICAgICAgICAgcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2Rpc3Qvd2Vic29ja2V0LW1lc3NhZ2UnKSxcbiAgICAgICAgKSxcbiAgICAgICAgcm9sZTogbGFtYmRhUm9sZSxcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgICBtZW1vcnlTaXplOiAxMjgsXG4gICAgICAgIGxvZ0dyb3VwOiBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnV2ViU29ja2V0TWVzc2FnZUxhbWJkYUxvZ0dyb3VwJywge1xuICAgICAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgICB9KSxcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICBXRUJTT0NLRVRfQ09OTkVDVElPTlNfVEFCTEVfTkFNRTogd2Vic29ja2V0Q29ubmVjdGlvbnNUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgICAgVVNFUlNfVEFCTEVfTkFNRTogdXNlcnNUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBXZWJTb2NrZXQgYnJvYWRjYXN0IGxhbWJkYSBmb3IgYnJvYWRjYXN0aW5nIG1lc3NhZ2VzIHRvIGFsbCBjb25uZWN0ZWQgY2xpZW50c1xuICAgIGNvbnN0IHdlYnNvY2tldEJyb2FkY2FzdExhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24oXG4gICAgICB0aGlzLFxuICAgICAgJ1dlYlNvY2tldEJyb2FkY2FzdExhbWJkYScsXG4gICAgICB7XG4gICAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxuICAgICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcbiAgICAgICAgICBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vZGlzdC93ZWJzb2NrZXQtYnJvYWRjYXN0JyksXG4gICAgICAgICksXG4gICAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgICAgbWVtb3J5U2l6ZTogMTI4LFxuICAgICAgICBsb2dHcm91cDogbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ1dlYlNvY2tldEJyb2FkY2FzdExhbWJkYUxvZ0dyb3VwJywge1xuICAgICAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgICB9KSxcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICBXRUJTT0NLRVRfQ09OTkVDVElPTlNfVEFCTEVfTkFNRTogd2Vic29ja2V0Q29ubmVjdGlvbnNUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBXZWJTb2NrZXQgQVBJIEdhdGV3YXkgdjJcbiAgICBjb25zdCB3ZWJzb2NrZXRBcGkgPSBuZXcgYXBpZ2F0ZXdheXYyLldlYlNvY2tldEFwaSh0aGlzLCAnV2ViU29ja2V0QXBpJywge1xuICAgICAgYXBpTmFtZTogJ1ZpcmFsIFZpZGVvcyBXZWJTb2NrZXQgQVBJJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnV2ViU29ja2V0IEFQSSBmb3IgcmVhbC10aW1lIHZpZGVvIGdlbmVyYXRpb24gdXBkYXRlcycsXG4gICAgICBjb25uZWN0Um91dGVPcHRpb25zOiB7XG4gICAgICAgIGludGVncmF0aW9uOiBuZXcgYXBpZ2F0ZXdheXYySW50ZWdyYXRpb25zLldlYlNvY2tldExhbWJkYUludGVncmF0aW9uKFxuICAgICAgICAgICdDb25uZWN0SGFuZGxlcicsXG4gICAgICAgICAgd2Vic29ja2V0Q29ubmVjdExhbWJkYSxcbiAgICAgICAgKSxcbiAgICAgIH0sXG4gICAgICBkaXNjb25uZWN0Um91dGVPcHRpb25zOiB7XG4gICAgICAgIGludGVncmF0aW9uOiBuZXcgYXBpZ2F0ZXdheXYySW50ZWdyYXRpb25zLldlYlNvY2tldExhbWJkYUludGVncmF0aW9uKFxuICAgICAgICAgICdEaXNjb25uZWN0SGFuZGxlcicsXG4gICAgICAgICAgd2Vic29ja2V0RGlzY29ubmVjdExhbWJkYSxcbiAgICAgICAgKSxcbiAgICAgIH0sXG4gICAgICBkZWZhdWx0Um91dGVPcHRpb25zOiB7XG4gICAgICAgIGludGVncmF0aW9uOiBuZXcgYXBpZ2F0ZXdheXYySW50ZWdyYXRpb25zLldlYlNvY2tldExhbWJkYUludGVncmF0aW9uKFxuICAgICAgICAgICdNZXNzYWdlSGFuZGxlcicsXG4gICAgICAgICAgd2Vic29ja2V0TWVzc2FnZUxhbWJkYSxcbiAgICAgICAgKSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBjb25zdCB3ZWJzb2NrZXRTdGFnZSA9IG5ldyBhcGlnYXRld2F5djIuV2ViU29ja2V0U3RhZ2UoXG4gICAgICB0aGlzLFxuICAgICAgJ1dlYlNvY2tldFN0YWdlJyxcbiAgICAgIHtcbiAgICAgICAgd2ViU29ja2V0QXBpOiB3ZWJzb2NrZXRBcGksXG4gICAgICAgIHN0YWdlTmFtZTogJ3Byb2QnLFxuICAgICAgICBhdXRvRGVwbG95OiB0cnVlLFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gR3JhbnQgV2ViU29ja2V0IEFQSSBwZXJtaXNzaW9ucyB0byBMYW1iZGEgZnVuY3Rpb25zXG4gICAgbGFtYmRhUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbJ2V4ZWN1dGUtYXBpOk1hbmFnZUNvbm5lY3Rpb25zJ10sXG4gICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgIGBhcm46YXdzOmV4ZWN1dGUtYXBpOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fToke3dlYnNvY2tldEFwaS5hcGlJZH0vKmAsXG4gICAgICAgIF0sXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgLy8gTGFtYmRhIGludGVncmF0aW9uIGZvciBnZW5lcmF0aW5nIGF1ZGlvIGFuZCBzdWJ0aXRsZXNcbiAgICBjb25zdCBnZW5lcmF0ZUF1ZGlvU3VidGl0bGVJbnRlZ3JhdGlvbiA9IG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKFxuICAgICAgZ2VuZXJhdGVBdWRpb1N1YnRpdGxlTGFtYmRhLFxuICAgICAge1xuICAgICAgICByZXF1ZXN0VGVtcGxhdGVzOiB7XG4gICAgICAgICAgJ2FwcGxpY2F0aW9uL2pzb24nOiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBib2R5OiBcIiR1dGlsLmVzY2FwZUphdmFTY3JpcHQoJGlucHV0Lmpzb24oJyQnKSlcIixcbiAgICAgICAgICB9KSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIExhbWJkYSBpbnRlZ3JhdGlvbiBmb3IgZ2VuZXJhdGluZyBpbWFnZXNcbiAgICBjb25zdCBnZW5lcmF0ZUltYWdlSW50ZWdyYXRpb24gPSBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihcbiAgICAgIGdlbmVyYXRlSW1hZ2VMYW1iZGEsXG4gICAgICB7XG4gICAgICAgIHJlcXVlc3RUZW1wbGF0ZXM6IHtcbiAgICAgICAgICAnYXBwbGljYXRpb24vanNvbic6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIGJvZHk6IFwiJHV0aWwuZXNjYXBlSmF2YVNjcmlwdCgkaW5wdXQuanNvbignJCcpKVwiLFxuICAgICAgICAgIH0pLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gTGFtYmRhIGludGVncmF0aW9uIGZvciBzYXZpbmcgaW1hZ2VzXG4gICAgY29uc3Qgc2F2ZUltYWdlSW50ZWdyYXRpb24gPSBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihcbiAgICAgIHNhdmVJbWFnZUxhbWJkYSxcbiAgICAgIHtcbiAgICAgICAgcmVxdWVzdFRlbXBsYXRlczoge1xuICAgICAgICAgICdhcHBsaWNhdGlvbi9qc29uJzogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgYm9keTogXCIkdXRpbC5lc2NhcGVKYXZhU2NyaXB0KCRpbnB1dC5qc29uKCckJykpXCIsXG4gICAgICAgICAgfSksXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBMYW1iZGEgaW50ZWdyYXRpb24gZm9yIFdlYlNvY2tldCBicm9hZGNhc3RpbmdcbiAgICBjb25zdCB3ZWJzb2NrZXRCcm9hZGNhc3RJbnRlZ3JhdGlvbiA9IG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKFxuICAgICAgd2Vic29ja2V0QnJvYWRjYXN0TGFtYmRhLFxuICAgICAge1xuICAgICAgICByZXF1ZXN0VGVtcGxhdGVzOiB7XG4gICAgICAgICAgJ2FwcGxpY2F0aW9uL2pzb24nOiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBib2R5OiBcIiR1dGlsLmVzY2FwZUphdmFTY3JpcHQoJGlucHV0Lmpzb24oJyQnKSlcIixcbiAgICAgICAgICB9KSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIENyZWF0ZSBBUEkgcmVzb3VyY2VzIGFuZCBtZXRob2RzIHdpdGggSldUIGF1dGhvcml6YXRpb25cbiAgICBjb25zdCB2aWRlb1Jlc291cmNlID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ2dlbmVyYXRlLXZpZGVvJyk7XG4gICAgdmlkZW9SZXNvdXJjZS5hZGRNZXRob2QoJ1BPU1QnLCBxdWV1ZU1hbmFnZXJJbnRlZ3JhdGlvbiwge1xuICAgICAgYXV0aG9yaXplcjogand0QXV0aG9yaXplcixcbiAgICB9KTtcblxuICAgIGNvbnN0IGZldGNoVmlkZW9zUmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZSgnZmV0Y2gtdmlkZW9zJyk7XG4gICAgZmV0Y2hWaWRlb3NSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIGZldGNoVmlkZW9zSW50ZWdyYXRpb24sIHtcbiAgICAgIGF1dGhvcml6ZXI6IGp3dEF1dGhvcml6ZXIsXG4gICAgfSk7XG5cbiAgICBjb25zdCBmZXRjaFByZXZpZXdSZXNvdXJjZSA9IGFwaS5yb290LmFkZFJlc291cmNlKCdmZXRjaC1wcmV2aWV3Jyk7XG4gICAgZmV0Y2hQcmV2aWV3UmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBmZXRjaFByZXZpZXdJbnRlZ3JhdGlvbiwge1xuICAgICAgYXV0aG9yaXplcjogand0QXV0aG9yaXplcixcbiAgICAgIHJlcXVlc3RQYXJhbWV0ZXJzOiB7XG4gICAgICAgICdtZXRob2QucmVxdWVzdC5xdWVyeXN0cmluZy50aW1lc3RhbXAnOiB0cnVlLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGNvbnN0IGdlbmVyYXRlQXVkaW9TdWJ0aXRsZVJlc291cmNlID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoXG4gICAgICAnZ2VuZXJhdGUtYXVkaW8tc3VidGl0bGUnLFxuICAgICk7XG4gICAgZ2VuZXJhdGVBdWRpb1N1YnRpdGxlUmVzb3VyY2UuYWRkTWV0aG9kKFxuICAgICAgJ1BPU1QnLFxuICAgICAgZ2VuZXJhdGVBdWRpb1N1YnRpdGxlSW50ZWdyYXRpb24sXG4gICAgICB7XG4gICAgICAgIGF1dGhvcml6ZXI6IGp3dEF1dGhvcml6ZXIsXG4gICAgICB9LFxuICAgICk7XG5cbiAgICBjb25zdCBnZW5lcmF0ZUltYWdlUmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZSgnZ2VuZXJhdGUtaW1hZ2UnKTtcbiAgICBnZW5lcmF0ZUltYWdlUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgZ2VuZXJhdGVJbWFnZUludGVncmF0aW9uLCB7XG4gICAgICBhdXRob3JpemVyOiBqd3RBdXRob3JpemVyLFxuICAgIH0pO1xuXG4gICAgLy8gTGFtYmRhIGludGVncmF0aW9uIGZvciBhbmltYXRlLWltYWdlXG4gICAgY29uc3QgYW5pbWF0ZUltYWdlSW50ZWdyYXRpb24gPSBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihcbiAgICAgIGFuaW1hdGVJbWFnZUxhbWJkYSxcbiAgICAgIHtcbiAgICAgICAgcmVxdWVzdFRlbXBsYXRlczoge1xuICAgICAgICAgICdhcHBsaWNhdGlvbi9qc29uJzogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgYm9keTogXCIkdXRpbC5lc2NhcGVKYXZhU2NyaXB0KCRpbnB1dC5qc29uKCckJykpXCIsXG4gICAgICAgICAgICBxdWVyeVN0cmluZzogJyRpbnB1dC5wYXJhbXMoKS5xdWVyeXN0cmluZycsXG4gICAgICAgICAgfSksXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICBjb25zdCBhbmltYXRlSW1hZ2VSZXNvdXJjZSA9IGFwaS5yb290LmFkZFJlc291cmNlKCdhbmltYXRlLWltYWdlJyk7XG4gICAgYW5pbWF0ZUltYWdlUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgYW5pbWF0ZUltYWdlSW50ZWdyYXRpb24sIHtcbiAgICAgIGF1dGhvcml6ZXI6IGp3dEF1dGhvcml6ZXIsXG4gICAgICByZXF1ZXN0UGFyYW1ldGVyczoge1xuICAgICAgICAnbWV0aG9kLnJlcXVlc3QucXVlcnlzdHJpbmcudGltZXN0YW1wJzogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBjb25zdCBzYXZlSW1hZ2VSZXNvdXJjZSA9IGFwaS5yb290LmFkZFJlc291cmNlKCdzYXZlLWltYWdlJyk7XG4gICAgc2F2ZUltYWdlUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgc2F2ZUltYWdlSW50ZWdyYXRpb24sIHtcbiAgICAgIGF1dGhvcml6ZXI6IGp3dEF1dGhvcml6ZXIsXG4gICAgfSk7XG5cbiAgICBjb25zdCB1c2VyTWFuYWdlbWVudFJlc291cmNlID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ3VzZXInKTtcbiAgICB1c2VyTWFuYWdlbWVudFJlc291cmNlLmFkZE1ldGhvZCgnUE9TVCcsIHVwc2VydFVzZXJJbnRlZ3JhdGlvbiwge1xuICAgICAgYXV0aG9yaXplcjogand0QXV0aG9yaXplcixcbiAgICB9KTtcblxuICAgIC8vIEFkZCBHRVQgbWV0aG9kIHdpdGggcXVlcnkgcGFyYW1ldGVyc1xuICAgIHVzZXJNYW5hZ2VtZW50UmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBnZXRVc2VySW50ZWdyYXRpb24sIHtcbiAgICAgIGF1dGhvcml6ZXI6IGp3dEF1dGhvcml6ZXIsXG4gICAgICByZXF1ZXN0UGFyYW1ldGVyczoge1xuICAgICAgICAnbWV0aG9kLnJlcXVlc3QucXVlcnlzdHJpbmcudXNlcklkJzogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBjb25zdCBkZWxldGVWaWRlb1Jlc291cmNlID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ2RlbGV0ZS12aWRlbycpO1xuICAgIGRlbGV0ZVZpZGVvUmVzb3VyY2UuYWRkTWV0aG9kKCdERUxFVEUnLCBkZWxldGVWaWRlb0ludGVncmF0aW9uLCB7XG4gICAgICBhdXRob3JpemVyOiBqd3RBdXRob3JpemVyLFxuICAgICAgcmVxdWVzdFBhcmFtZXRlcnM6IHtcbiAgICAgICAgJ21ldGhvZC5yZXF1ZXN0LnF1ZXJ5c3RyaW5nLnRpbWVzdGFtcCc6IHRydWUsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgY29uc3Qgd2Vic29ja2V0QnJvYWRjYXN0UmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZShcbiAgICAgICd3ZWJzb2NrZXQtYnJvYWRjYXN0JyxcbiAgICApO1xuICAgIHdlYnNvY2tldEJyb2FkY2FzdFJlc291cmNlLmFkZE1ldGhvZChcbiAgICAgICdQT1NUJyxcbiAgICAgIHdlYnNvY2tldEJyb2FkY2FzdEludGVncmF0aW9uLFxuICAgICAge1xuICAgICAgICBhdXRob3JpemVyOiBqd3RBdXRob3JpemVyLFxuICAgICAgfSxcbiAgICApO1xuICB9XG59XG4iXX0=