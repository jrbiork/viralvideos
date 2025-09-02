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
                S3_BUCKET_NAME: videoPartsBucket.bucketName,
                VIDEO_PARTS_BUCKET_NAME: videoPartsBucket.bucketName,
                URL_TTL_SECONDS: '3600',
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
                VIDEO_PARTS_BUCKET_NAME: videoPartsBucket.bucketName,
                WEBSOCKET_DOMAIN_NAME: websocketDomainName,
                WEBSOCKET_STAGE: websocketEnv,
                WEBSOCKET_CONNECTIONS_TABLE_NAME: websocketConnectionsTable.tableName,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlyYWwtdmlkZW9zLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidmlyYWwtdmlkZW9zLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG1DQUFtQztBQUVuQyx5Q0FBeUM7QUFDekMsaURBQWlEO0FBQ2pELDJDQUEyQztBQUMzQyw2Q0FBNkM7QUFDN0MsMkNBQTJDO0FBQzNDLDJFQUEyRTtBQUMzRSx5REFBeUQ7QUFDekQsNkRBQTZEO0FBQzdELHNGQUFzRjtBQUN0RixxREFBcUQ7QUFDckQsNkJBQTZCO0FBQzdCLGlDQUFpQztBQUVqQyw0Q0FBNEM7QUFDNUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxTQUFTLENBQUMsRUFBRSxDQUFDLENBQUM7QUFFekQsTUFBYSxnQkFBaUIsU0FBUSxHQUFHLENBQUMsS0FBSztJQUM3QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXNCO1FBQzlELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLDhCQUE4QjtRQUM5QixNQUFNLFlBQVksR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWMsSUFBSSxFQUFFLENBQUM7UUFDdEQsTUFBTSxZQUFZLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLElBQUksRUFBRSxDQUFDO1FBRXRELE1BQU0sbUJBQW1CLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsSUFBSSxFQUFFLENBQUM7UUFDcEUsTUFBTSxZQUFZLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxlQUFlLElBQUksRUFBRSxDQUFDO1FBRXZELElBQUksQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO1lBQ3pCLE9BQU8sQ0FBQyxJQUFJLENBQUMsMkRBQTJELENBQUMsQ0FBQztRQUM1RSxDQUFDO1FBQ0QsSUFBSSxDQUFDLFlBQVksRUFBRSxD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SCxNQUFNLG1CQUFtQixHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQ2pFLG1CQUFtQixDQUFDLFNBQVMsQ0FBQyxRQUFRLEVBQUUsc0JBQXNCLEVBQUU7WUFDOUQsVUFBVSxFQUFFLGFBQWE7WUFDekIsaUJBQWlCLEVBQUU7Z0JBQ2pCLHNDQUFzQyxFQUFFLElBQUk7YUFDN0M7U0FDRixDQUFDLENBQUM7UUFFSCxNQUFNLDBCQUEwQixHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUNyRCxxQkFBcUIsQ0FDdEIsQ0FBQztRQUNGLDBCQUEwQixDQUFDLFNBQVMsQ0FDbEMsTUFBTSxFQUNOLDZCQUE2QixFQUM3QjtZQUNFLFVBQVUsRUFBRSxhQUFhO1NBQzFCLENBQ0YsQ0FBQztJQUNKLENBQUM7Q0FDRjtBQTN4QkQsNENBMnhCQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBsb2dzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sb2dzJztcbmltcG9ydCAqIGFzIHNxcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc3FzJztcbmltcG9ydCAqIGFzIGxhbWJkYUV2ZW50U291cmNlcyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhLWV2ZW50LXNvdXJjZXMnO1xuaW1wb3J0ICogYXMgYXBpZ2F0ZXdheSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtYXBpZ2F0ZXdheSc7XG5pbXBvcnQgKiBhcyBhcGlnYXRld2F5djIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXl2Mic7XG5pbXBvcnQgKiBhcyBhcGlnYXRld2F5djJJbnRlZ3JhdGlvbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXl2Mi1pbnRlZ3JhdGlvbnMnO1xuaW1wb3J0ICogYXMgZHluYW1vZGIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWR5bmFtb2RiJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgKiBhcyBkb3RlbnYgZnJvbSAnZG90ZW52JztcblxuLy8gTG9hZCBlbnZpcm9ubWVudCB2YXJpYWJsZXMgZnJvbSAuZW52IGZpbGVcbmRvdGVudi5jb25maWcoeyBwYXRoOiBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLmVudicpIH0pO1xuXG5leHBvcnQgY2xhc3MgVmlyYWxWaWRlb3NTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzPzogY2RrLlN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIC8vIEdldCBBUEkga2V5cyB3aXRoIGZhbGxiYWNrc1xuICAgIGNvbnN0IHJ1bndheUFwaUtleSA9IHByb2Nlc3MuZW52LlJVTldBWV9BUElfS0VZIHx8ICcnO1xuICAgIGNvbnN0IG9wZW5haUFwaUtleSA9IHByb2Nlc3MuZW52Lk9QRU5BSV9BUElfS0VZIHx8ICcnO1xuXG4gICAgY29uc3Qgd2Vic29ja2V0RG9tYWluTmFtZSA9IHByb2Nlc3MuZW52LldFQlNPQ0tFVF9ET01BSU5fTkFNRSB8fCAnJztcbiAgICBjb25zdCB3ZWJzb2NrZXRFbnYgPSBwcm9jZXNzLmVudi5XRUJTT0NLRVRfU1RBR0UgfHwgJyc7XG5cbiAgICBpZiAoIXdlYnNvY2tldERvbWFpbk5hbWUpIHtcbiAgICAgIGNvbnNvbGUud2Fybign4pqg77iPICBXRUJTT0NLRVRfRE9NQUlOX05BTUUgaXMgbm90IHNldC4gV2ViU29ja2V0IG1heSBmYWlsLicpO1xuICAgIH1cbiAgICBpZiAoIXdlYnNvY2tldEVudikge1xuICAgICAgY29uc29sZS53YXJuKCfimqDvuI8gIFdFQlNPQ0tFVF9TVEFHRSBpcyBub3Qgc2V0LiBXZWJTb2NrZXQgbWF5IGZhaWwuJyk7XG4gICAgfVxuXG4gICAgLy8gVmFsaWRhdGUgQVBJIGtleXNcbiAgICBpZiAoIXJ1bndheUFwaUtleSkge1xuICAgICAgY29uc29sZS53YXJuKCfimqDvuI8gIFJVTldBWV9BUElfS0VZIGlzIG5vdCBzZXQuIFZpZGVvIGdlbmVyYXRpb24gbWF5IGZhaWwuJyk7XG4gICAgfVxuICAgIGlmICghb3BlbmFpQXBpS2V5KSB7XG4gICAgICBjb25zb2xlLndhcm4oJ+KaoO+4jyAgT1BFTkFJX0FQSV9LRVkgaXMgbm90IHNldC4gVmlkZW8gZ2VuZXJhdGlvbiBtYXkgZmFpbC4nKTtcbiAgICB9XG5cbiAgICAvLyBTMyBCdWNrZXQgZm9yIHN0b3JpbmcgdmlkZW9zIGFuZCBhc3NldHNcbiAgICBjb25zdCB2aWRlb0J1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ1ZpZGVvQnVja2V0Jywge1xuICAgICAgYnVja2V0TmFtZTogYHZpcmFsLXZpZGVvcy0ke3RoaXMuYWNjb3VudH0tJHt0aGlzLnJlZ2lvbn1gLFxuICAgICAgdmVyc2lvbmVkOiB0cnVlLFxuICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksIC8vIEZvciBkZW1vIHB1cnBvc2VzXG4gICAgICBsaWZlY3ljbGVSdWxlczogW1xuICAgICAgICB7XG4gICAgICAgICAgaWQ6ICdEZWxldGVPbGRBc3NldHMnLFxuICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgbm9uY3VycmVudFZlcnNpb25FeHBpcmF0aW9uOiBjZGsuRHVyYXRpb24uZGF5cygxNSksXG4gICAgICAgICAgZXhwaXJhdGlvbjogY2RrLkR1cmF0aW9uLmRheXMoMzApLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIFMzIEJ1Y2tldCBmb3Igc3RvcmluZyB2aWRlbyBwYXJ0c1xuICAgIGNvbnN0IHZpZGVvUGFydHNCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICdWaWRlb1BhcnRzQnVja2V0Jywge1xuICAgICAgYnVja2V0TmFtZTogYHZpZGVvLXBhcnRzLSR7dGhpcy5hY2NvdW50fS0ke3RoaXMucmVnaW9ufWAsXG4gICAgICB2ZXJzaW9uZWQ6IHRydWUsXG4gICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsXG4gICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSwgLy8gRm9yIGRlbW8gcHVycG9zZXNcbiAgICAgIGxpZmVjeWNsZVJ1bGVzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogJ0RlbGV0ZU9sZFZpZGVvUGFydHMnLFxuICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgbm9uY3VycmVudFZlcnNpb25FeHBpcmF0aW9uOiBjZGsuRHVyYXRpb24uZGF5cygxNSksXG4gICAgICAgICAgZXhwaXJhdGlvbjogY2RrLkR1cmF0aW9uLmRheXMoMzApLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIFNRUyBRdWV1ZSBmb3IgdmlkZW8gZ2VuZXJhdGlvbiByZXF1ZXN0c1xuICAgIGNvbnN0IHZpZGVvUXVldWUgPSBuZXcgc3FzLlF1ZXVlKHRoaXMsICdWaWRlb0dlbmVyYXRpb25RdWV1ZScsIHtcbiAgICAgIHF1ZXVlTmFtZTogJ3ZpZGVvLWdlbmVyYXRpb24tcXVldWUnLFxuICAgICAgdmlzaWJpbGl0eVRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDE1KSwgLy8gTWF0Y2ggbGFtYmRhIHRpbWVvdXRcbiAgICAgIHJldGVudGlvblBlcmlvZDogY2RrLkR1cmF0aW9uLmRheXMoNCksXG4gICAgICBkZWFkTGV0dGVyUXVldWU6IHtcbiAgICAgICAgcXVldWU6IG5ldyBzcXMuUXVldWUodGhpcywgJ1ZpZGVvR2VuZXJhdGlvbkRMUScsIHtcbiAgICAgICAgICBxdWV1ZU5hbWU6ICd2aWRlby1nZW5lcmF0aW9uLWRscScsXG4gICAgICAgICAgcmV0ZW50aW9uUGVyaW9kOiBjZGsuRHVyYXRpb24uZGF5cygxNCksXG4gICAgICAgIH0pLFxuICAgICAgICBtYXhSZWNlaXZlQ291bnQ6IDMsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gRHluYW1vREIgVXNlcnMgVGFibGVcbiAgICBjb25zdCB1c2Vyc1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdVc2Vyc1RhYmxlJywge1xuICAgICAgdGFibGVOYW1lOiAndmlyYWwtdmlkZW9zLXVzZXJzJyxcbiAgICAgIHBhcnRpdGlvbktleToge1xuICAgICAgICBuYW1lOiAndXNlcklkJyxcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXG4gICAgICB9LFxuICAgICAgc29ydEtleToge1xuICAgICAgICBuYW1lOiAndXNlcm5hbWUnLFxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcbiAgICAgIH0sXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSwgLy8gRm9yIGRlbW8gcHVycG9zZXNcbiAgICAgIHBvaW50SW5UaW1lUmVjb3Zlcnk6IHRydWUsXG4gICAgfSk7XG5cbiAgICAvLyBEeW5hbW9EQiBXZWJTb2NrZXQgQ29ubmVjdGlvbnMgVGFibGVcbiAgICBjb25zdCB3ZWJzb2NrZXRDb25uZWN0aW9uc1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKFxuICAgICAgdGhpcyxcbiAgICAgICdXZWJTb2NrZXRDb25uZWN0aW9uc1RhYmxlJyxcbiAgICAgIHtcbiAgICAgICAgdGFibGVOYW1lOiAndmlyYWwtdmlkZW9zLXdlYnNvY2tldC1jb25uZWN0aW9ucycsXG4gICAgICAgIHBhcnRpdGlvbktleToge1xuICAgICAgICAgIG5hbWU6ICdjb25uZWN0aW9uSWQnLFxuICAgICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxuICAgICAgICB9LFxuICAgICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxuICAgICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLCAvLyBGb3IgZGVtbyBwdXJwb3Nlc1xuICAgICAgICB0aW1lVG9MaXZlQXR0cmlidXRlOiAndHRsJywgLy8gQXV0by1kZWxldGUgZXhwaXJlZCBjb25uZWN0aW9uc1xuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gQWRkIEdTSSBmb3IgdXNlcklkIGxvb2t1cHNcbiAgICB3ZWJzb2NrZXRDb25uZWN0aW9uc1RhYmxlLmFkZEdsb2JhbFNlY29uZGFyeUluZGV4KHtcbiAgICAgIGluZGV4TmFtZTogJ1VzZXJJZEluZGV4JyxcbiAgICAgIHBhcnRpdGlvbktleToge1xuICAgICAgICBuYW1lOiAndXNlcklkJyxcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXG4gICAgICB9LFxuICAgICAgcHJvamVjdGlvblR5cGU6IGR5bmFtb2RiLlByb2plY3Rpb25UeXBlLkFMTCxcbiAgICB9KTtcblxuICAgIC8vIEFkZCBHU0kgZm9yIHVzZXJuYW1lIGxvb2t1cHNcbiAgICB1c2Vyc1RhYmxlLmFkZEdsb2JhbFNlY29uZGFyeUluZGV4KHtcbiAgICAgIGluZGV4TmFtZTogJ1VzZXJuYW1lSW5kZXgnLFxuICAgICAgcGFydGl0aW9uS2V5OiB7XG4gICAgICAgIG5hbWU6ICd1c2VybmFtZScsXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxuICAgICAgfSxcbiAgICAgIHByb2plY3Rpb25UeXBlOiBkeW5hbW9kYi5Qcm9qZWN0aW9uVHlwZS5BTEwsXG4gICAgfSk7XG5cbiAgICAvLyBJQU0gUm9sZSBmb3IgTGFtYmRhXG4gICAgY29uc3QgbGFtYmRhUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnVmlkZW9HZW5lcmF0aW9uTGFtYmRhUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdsYW1iZGEuYW1hem9uYXdzLmNvbScpLFxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZShcbiAgICAgICAgICAnc2VydmljZS1yb2xlL0FXU0xhbWJkYUJhc2ljRXhlY3V0aW9uUm9sZScsXG4gICAgICAgICksXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gR3JhbnQgUzMgcGVybWlzc2lvbnMgdG8gTGFtYmRhXG4gICAgdmlkZW9CdWNrZXQuZ3JhbnRSZWFkV3JpdGUobGFtYmRhUm9sZSk7XG4gICAgdmlkZW9QYXJ0c0J1Y2tldC5ncmFudFJlYWRXcml0ZShsYW1iZGFSb2xlKTtcblxuICAgIC8vIEdyYW50IFNRUyBwZXJtaXNzaW9ucyB0byBMYW1iZGFcbiAgICB2aWRlb1F1ZXVlLmdyYW50U2VuZE1lc3NhZ2VzKGxhbWJkYVJvbGUpO1xuICAgIHZpZGVvUXVldWUuZ3JhbnRDb25zdW1lTWVzc2FnZXMobGFtYmRhUm9sZSk7XG5cbiAgICAvLyBHcmFudCBEeW5hbW9EQiBwZXJtaXNzaW9ucyB0byBMYW1iZGFcbiAgICB1c2Vyc1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShsYW1iZGFSb2xlKTtcbiAgICB3ZWJzb2NrZXRDb25uZWN0aW9uc1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShsYW1iZGFSb2xlKTtcblxuICAgIC8vIENyZWF0ZSBGRm1wZWcgTGFtYmRhIExheWVyXG4gICAgY29uc3QgZmZtcGVnTGF5ZXIgPSBuZXcgbGFtYmRhLkxheWVyVmVyc2lvbih0aGlzLCAnRkZtcGVnTGF5ZXInLCB7XG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXG4gICAgICAgIHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9sYXllcnMvZmZtcGVnLWxheWVyJyksXG4gICAgICApLFxuICAgICAgY29tcGF0aWJsZVJ1bnRpbWVzOiBbbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1hdLFxuICAgICAgZGVzY3JpcHRpb246ICdGRm1wZWcgYmluYXJpZXMgZm9yIHZpZGVvIHByb2Nlc3NpbmcnLFxuICAgICAgbGF5ZXJWZXJzaW9uTmFtZTogJ2ZmbXBlZy1sYXllcicsXG4gICAgfSk7XG5cbiAgICAvLyBMYW1iZGEgZnVuY3Rpb24gZm9yIHZpZGVvIGdlbmVyYXRpb24gKG5vdyB0cmlnZ2VyZWQgYnkgU1FTKVxuICAgIGNvbnN0IHZpZGVvR2VuZXJhdGlvbkxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24oXG4gICAgICB0aGlzLFxuICAgICAgJ1ZpZGVvR2VuZXJhdGlvbkxhbWJkYScsXG4gICAgICB7XG4gICAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxuICAgICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcbiAgICAgICAgICBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vZGlzdC92aWRlby1nZW5lcmF0aW9uJyksXG4gICAgICAgICksXG4gICAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDE1KSxcbiAgICAgICAgbWVtb3J5U2l6ZTogMzAwOCwgLy8gSW5jcmVhc2VkIGZvciB2aWRlbyBwcm9jZXNzaW5nXG4gICAgICAgIGxvZ0dyb3VwOiBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnVmlkZW9HZW5lcmF0aW9uTGFtYmRhTG9nR3JvdXAnLCB7XG4gICAgICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgICAgIH0pLFxuICAgICAgICBsYXllcnM6IFtmZm1wZWdMYXllcl0sXG4gICAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgICAgVklERU9fQlVDS0VUX05BTUU6IHZpZGVvQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICAgICAgVklERU9fUEFSVFNfQlVDS0VUX05BTUU6IHZpZGVvUGFydHNCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgICAgICBVU0VSU19UQUJMRV9OQU1FOiB1c2Vyc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgICBSVU5XQVlfQVBJX0tFWTogcnVud2F5QXBpS2V5LFxuICAgICAgICAgIE9QRU5BSV9BUElfS0VZOiBvcGVuYWlBcGlLZXksXG4gICAgICAgICAgVklERU9fUVVFVUVfVVJMOiB2aWRlb1F1ZXVlLnF1ZXVlVXJsLFxuICAgICAgICAgIFBBVEg6ICcvb3B0L2JpbjovdXNyL2xvY2FsL2JpbjovdXNyL2Jpbi86L2JpbicsXG4gICAgICAgICAgRk9OVENPTkZJR19QQVRIOiAnL29wdC9ldGMvZm9udHMnLFxuICAgICAgICAgIEZPTlRDT05GSUdfRklMRTogJy9vcHQvZXRjL2ZvbnRzL2ZvbnRzLmNvbmYnLFxuICAgICAgICAgIFdFQlNPQ0tFVF9ET01BSU5fTkFNRTogd2Vic29ja2V0RG9tYWluTmFtZSxcbiAgICAgICAgICBXRUJTT0NLRVRfU1RBR0U6IHdlYnNvY2tldEVudixcbiAgICAgICAgICBXRUJTT0NLRVRfQ09OTkVDVElPTlNfVEFCTEVfTkFNRTogd2Vic29ja2V0Q29ubmVjdGlvbnNUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBBZGQgU1FTIGV2ZW50IHNvdXJjZSB0byB2aWRlbyBnZW5lcmF0aW9uIGxhbWJkYVxuICAgIHZpZGVvR2VuZXJhdGlvbkxhbWJkYS5hZGRFdmVudFNvdXJjZShcbiAgICAgIG5ldyBsYW1iZGFFdmVudFNvdXJjZXMuU3FzRXZlbnRTb3VyY2UodmlkZW9RdWV1ZSwge1xuICAgICAgICBiYXRjaFNpemU6IDEsIC8vIFByb2Nlc3Mgb25lIG1lc3NhZ2UgYXQgYSB0aW1lXG4gICAgICAgIG1heEJhdGNoaW5nV2luZG93OiBjZGsuRHVyYXRpb24uc2Vjb25kcygwKSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICAvLyBMYW1iZGEgZnVuY3Rpb24gZm9yIHF1ZXVlIG1hbmFnZW1lbnQgKHJlY2VpdmVzIHJlcXVlc3RzIGFuZCBwdXRzIHRoZW0gaW4gU1FTKVxuICAgIGNvbnN0IGZ1bGxWaWRlb1F1ZXVlTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbihcbiAgICAgIHRoaXMsXG4gICAgICAnRnVsbFZpZGVvUXVldWVMYW1iZGEnLFxuICAgICAge1xuICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcbiAgICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXG4gICAgICAgICAgcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2Rpc3QvdmlkZW8tcXVldWUnKSxcbiAgICAgICAgKSxcbiAgICAgICAgcm9sZTogbGFtYmRhUm9sZSxcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMSksXG4gICAgICAgIG1lbW9yeVNpemU6IDEyOCxcbiAgICAgICAgbG9nR3JvdXA6IG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdGdWxsVmlkZW9RdWV1ZUxhbWJkYUxvZ0dyb3VwJywge1xuICAgICAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgICB9KSxcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICBWSURFT19RVUVVRV9VUkw6IHZpZGVvUXVldWUucXVldWVVcmwsXG4gICAgICAgICAgVVNFUlNfVEFCTEVfTkFNRTogdXNlcnNUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBDcmVhdGUgYSBzZXBhcmF0ZSByb2xlIGZvciBKV1QgYXV0aG9yaXplciB0byBhdm9pZCBjaXJjdWxhciBkZXBlbmRlbmNpZXNcbiAgICBjb25zdCBqd3RBdXRob3JpemVyUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnSldUQXV0aG9yaXplclJvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnbGFtYmRhLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoXG4gICAgICAgICAgJ3NlcnZpY2Utcm9sZS9BV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGUnLFxuICAgICAgICApLFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IER5bmFtb0RCIHBlcm1pc3Npb25zIHRvIEpXVCBhdXRob3JpemVyXG4gICAgdXNlcnNUYWJsZS5ncmFudFJlYWREYXRhKGp3dEF1dGhvcml6ZXJSb2xlKTtcblxuICAgIC8vIExhbWJkYSBmdW5jdGlvbiBmb3IgSldUIGF1dGhvcml6YXRpb25cbiAgICBjb25zdCBqd3RBdXRob3JpemVyTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbihcbiAgICAgIHRoaXMsXG4gICAgICAnSldUQXV0aG9yaXplckxhbWJkYScsXG4gICAgICB7XG4gICAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxuICAgICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcbiAgICAgICAgICBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vZGlzdC9qd3QtYXV0aG9yaXplcicpLFxuICAgICAgICApLFxuICAgICAgICByb2xlOiBqd3RBdXRob3JpemVyUm9sZSxcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgICBtZW1vcnlTaXplOiAxMjgsXG4gICAgICAgIGxvZ0dyb3VwOiBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnSldUQXV0aG9yaXplckxhbWJkYUxvZ0dyb3VwJywge1xuICAgICAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgICB9KSxcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICBORVhUX1BVQkxJQ19DT0dOSVRPX1VTRVJfUE9PTF9JRDpcbiAgICAgICAgICAgIHByb2Nlc3MuZW52Lk5FWFRfUFVCTElDX0NPR05JVE9fVVNFUl9QT09MX0lEIHx8ICcnLFxuICAgICAgICAgIE5FWFRfUFVCTElDX0NPR05JVE9fQ0xJRU5UX0lEOlxuICAgICAgICAgICAgcHJvY2Vzcy5lbnYuTkVYVF9QVUJMSUNfQ09HTklUT19DTElFTlRfSUQgfHwgJycsXG4gICAgICAgICAgTkVYVF9QVUJMSUNfQ09HTklUT19SRUdJT046XG4gICAgICAgICAgICBwcm9jZXNzLmVudi5ORVhUX1BVQkxJQ19DT0dOSVRPX1JFR0lPTiB8fCAndXMtZWFzdC0xJyxcbiAgICAgICAgICBVU0VSU19UQUJMRV9OQU1FOiB1c2Vyc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIExhbWJkYSBmdW5jdGlvbiBmb3IgZmV0Y2hpbmcgdmlkZW9zXG4gICAgY29uc3QgZmV0Y2hWaWRlb3NMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdGZXRjaFZpZGVvc0xhbWJkYScsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9kaXN0L2ZldGNoLXZpZGVvcycpKSxcbiAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcygxKSxcbiAgICAgIG1lbW9yeVNpemU6IDEyOCxcbiAgICAgIGxvZ0dyb3VwOiBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnRmV0Y2hWaWRlb3NMYW1iZGFMb2dHcm91cCcsIHtcbiAgICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgICB9KSxcblxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgVklERU9fQlVDS0VUX05BTUU6IHZpZGVvQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICAgIFZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FOiB2aWRlb1BhcnRzQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICAgIFVTRVJTX1RBQkxFX05BTUU6IHVzZXJzVGFibGUudGFibGVOYW1lLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIExhbWJkYSBmdW5jdGlvbiBmb3IgZmV0Y2hpbmcgcHJldmlldyBkYXRhXG4gICAgY29uc3QgZmV0Y2hQcmV2aWV3TGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnRmV0Y2hQcmV2aWV3TGFtYmRhJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXG4gICAgICAgIHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9kaXN0L2ZldGNoLXByZXZpZXcnKSxcbiAgICAgICksXG4gICAgICByb2xlOiBsYW1iZGFSb2xlLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMSksXG4gICAgICBtZW1vcnlTaXplOiAxMjgsXG4gICAgICBsb2dHcm91cDogbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ0ZldGNoUHJldmlld0xhbWJkYUxvZ0dyb3VwJywge1xuICAgICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSyxcbiAgICAgIH0pLFxuXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBTM19CVUNLRVRfTkFNRTogdmlkZW9QYXJ0c0J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgICBWSURFT19QQVJUU19CVUNLRVRfTkFNRTogdmlkZW9QYXJ0c0J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgICBVUkxfVFRMX1NFQ09ORFM6ICczNjAwJyxcbiAgICAgICAgTUFYX1NDRU5FUzogJzEwJyxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBMYW1iZGEgZnVuY3Rpb24gZm9yIHVzZXIgbWFuYWdlbWVudFxuICAgIGNvbnN0IGdldFVzZXJMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdHZXRVc2VyTGFtYmRhJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2Rpc3QvZ2V0LXVzZXInKSksXG4gICAgICByb2xlOiBsYW1iZGFSb2xlLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMSksXG4gICAgICBtZW1vcnlTaXplOiAxMjgsXG4gICAgICBsb2dHcm91cDogbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ0dldFVzZXJMYW1iZGFMb2dHcm91cCcsIHtcbiAgICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgICB9KSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFVTRVJTX1RBQkxFX05BTUU6IHVzZXJzVGFibGUudGFibGVOYW1lLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGNvbnN0IHVwc2VydFVzZXJMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdVcHNlcnRVc2VyTGFtYmRhJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2Rpc3QvdXBzZXJ0LXVzZXInKSksXG4gICAgICByb2xlOiBsYW1iZGFSb2xlLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMSksXG4gICAgICBtZW1vcnlTaXplOiAxMjgsXG4gICAgICBsb2dHcm91cDogbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ1Vwc2VydFVzZXJMYW1iZGFMb2dHcm91cCcsIHtcbiAgICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgICB9KSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFVTRVJTX1RBQkxFX05BTUU6IHVzZXJzVGFibGUudGFibGVOYW1lLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIExhbWJkYSBmdW5jdGlvbiBmb3IgZGVsZXRpbmcgdmlkZW9zXG4gICAgY29uc3QgZGVsZXRlVmlkZW9MYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdEZWxldGVWaWRlb0xhbWJkYScsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9kaXN0L2RlbGV0ZS12aWRlbycpKSxcbiAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcygxKSxcbiAgICAgIG1lbW9yeVNpemU6IDEyOCxcbiAgICAgIGxvZ0dyb3VwOiBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnRGVsZXRlVmlkZW9MYW1iZGFMb2dHcm91cCcsIHtcbiAgICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgICB9KSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFZJREVPX0JVQ0tFVF9OQU1FOiB2aWRlb0J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIExhbWJkYSBmdW5jdGlvbiBmb3IgZ2VuZXJhdGluZyBhdWRpbyBuYXJyYXRpb25cbiAgICBjb25zdCBnZW5lcmF0ZUF1ZGlvU3VidGl0bGVMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKFxuICAgICAgdGhpcyxcbiAgICAgICdHZW5lcmF0ZUF1ZGlvU3VidGl0bGVMYW1iZGEnLFxuICAgICAge1xuICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcbiAgICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXG4gICAgICAgICAgcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2Rpc3QvZ2VuZXJhdGUtYXVkaW8tc3VidGl0bGUnKSxcbiAgICAgICAgKSxcbiAgICAgICAgcm9sZTogbGFtYmRhUm9sZSxcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICAgIG1lbW9yeVNpemU6IDUxMixcbiAgICAgICAgbG9nR3JvdXA6IG5ldyBsb2dzLkxvZ0dyb3VwKFxuICAgICAgICAgIHRoaXMsXG4gICAgICAgICAgJ0dlbmVyYXRlQXVkaW9TdWJ0aXRsZUxhbWJkYUxvZ0dyb3VwJyxcbiAgICAgICAgICB7XG4gICAgICAgICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSyxcbiAgICAgICAgICB9LFxuICAgICAgICApLFxuICAgICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAgIE9QRU5BSV9BUElfS0VZOiBvcGVuYWlBcGlLZXksXG4gICAgICAgICAgVklERU9fUEFSVFNfQlVDS0VUX05BTUU6IHZpZGVvUGFydHNCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgICAgICBXRUJTT0NLRVRfRE9NQUlOX05BTUU6IHdlYnNvY2tldERvbWFpbk5hbWUsXG4gICAgICAgICAgV0VCU09DS0VUX1NUQUdFOiB3ZWJzb2NrZXRFbnYsXG4gICAgICAgICAgV0VCU09DS0VUX0NPTk5FQ1RJT05TX1RBQkxFX05BTUU6IHdlYnNvY2tldENvbm5lY3Rpb25zVGFibGUudGFibGVOYW1lLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gTGFtYmRhIGZ1bmN0aW9uIGZvciBnZW5lcmF0aW5nIGltYWdlc1xuICAgIGNvbnN0IGdlbmVyYXRlSW1hZ2VMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKFxuICAgICAgdGhpcyxcbiAgICAgICdHZW5lcmF0ZUltYWdlTGFtYmRhJyxcbiAgICAgIHtcbiAgICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXG4gICAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFxuICAgICAgICAgIHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9kaXN0L2dlbmVyYXRlLWltYWdlJyksXG4gICAgICAgICksXG4gICAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgICBtZW1vcnlTaXplOiA1MTIsXG4gICAgICAgIGxvZ0dyb3VwOiBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnR2VuZXJhdGVJbWFnZUxhbWJkYUxvZ0dyb3VwJywge1xuICAgICAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgICB9KSxcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICBSVU5XQVlfQVBJX0tFWTogcnVud2F5QXBpS2V5LFxuICAgICAgICAgIFZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FOiB2aWRlb1BhcnRzQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICAgICAgV0VCU09DS0VUX0RPTUFJTl9OQU1FOiB3ZWJzb2NrZXREb21haW5OYW1lLFxuICAgICAgICAgIFdFQlNPQ0tFVF9TVEFHRTogd2Vic29ja2V0RW52LFxuICAgICAgICAgIFdFQlNPQ0tFVF9DT05ORUNUSU9OU19UQUJMRV9OQU1FOiB3ZWJzb2NrZXRDb25uZWN0aW9uc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIExhbWJkYSBmdW5jdGlvbiBmb3Igc2F2aW5nIGltYWdlc1xuICAgIGNvbnN0IHNhdmVJbWFnZUxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1NhdmVJbWFnZUxhbWJkYScsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9kaXN0L3NhdmUtaW1hZ2UnKSksXG4gICAgICByb2xlOiBsYW1iZGFSb2xlLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMiksXG4gICAgICBtZW1vcnlTaXplOiA1MTIsXG4gICAgICBsb2dHcm91cDogbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ1NhdmVJbWFnZUxhbWJkYUxvZ0dyb3VwJywge1xuICAgICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSyxcbiAgICAgIH0pLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgVklERU9fUEFSVFNfQlVDS0VUX05BTUU6IHZpZGVvUGFydHNCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgICAgV0VCU09DS0VUX0RPTUFJTl9OQU1FOiB3ZWJzb2NrZXREb21haW5OYW1lLFxuICAgICAgICBXRUJTT0NLRVRfU1RBR0U6IHdlYnNvY2tldEVudixcbiAgICAgICAgV0VCU09DS0VUX0NPTk5FQ1RJT05TX1RBQkxFX05BTUU6IHdlYnNvY2tldENvbm5lY3Rpb25zVGFibGUudGFibGVOYW1lLFxuICAgICAgICBWSURFT19RVUVVRV9VUkw6IHZpZGVvUXVldWUucXVldWVVcmwsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQVBJIEdhdGV3YXkgUkVTVCBBUElcbiAgICBjb25zdCBhcGkgPSBuZXcgYXBpZ2F0ZXdheS5SZXN0QXBpKHRoaXMsICdWaWRlb0dlbmVyYXRpb25BcGknLCB7XG4gICAgICByZXN0QXBpTmFtZTogJ1ZpZGVvIEdlbmVyYXRpb24gQVBJJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVBJIGZvciB2aWRlbyBnZW5lcmF0aW9uIHJlcXVlc3RzJyxcbiAgICAgIGRlZmF1bHRDb3JzUHJlZmxpZ2h0T3B0aW9uczoge1xuICAgICAgICBhbGxvd09yaWdpbnM6IGFwaWdhdGV3YXkuQ29ycy5BTExfT1JJR0lOUyxcbiAgICAgICAgYWxsb3dNZXRob2RzOiBhcGlnYXRld2F5LkNvcnMuQUxMX01FVEhPRFMsXG4gICAgICAgIGFsbG93SGVhZGVyczogWydDb250ZW50LVR5cGUnLCAnQXV0aG9yaXphdGlvbiddLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIExhbWJkYSBpbnRlZ3JhdGlvbiBmb3IgdGhlIHF1ZXVlIG1hbmFnZXJcbiAgICBjb25zdCBxdWV1ZU1hbmFnZXJJbnRlZ3JhdGlvbiA9IG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKFxuICAgICAgZnVsbFZpZGVvUXVldWVMYW1iZGEsXG4gICAgICB7XG4gICAgICAgIHJlcXVlc3RUZW1wbGF0ZXM6IHtcbiAgICAgICAgICAnYXBwbGljYXRpb24vanNvbic6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIGJvZHk6IFwiJHV0aWwuZXNjYXBlSmF2YVNjcmlwdCgkaW5wdXQuanNvbignJCcpKVwiLFxuICAgICAgICAgIH0pLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gSldUIEF1dGhvcml6ZXJcbiAgICBjb25zdCBqd3RBdXRob3JpemVyID0gbmV3IGFwaWdhdGV3YXkuVG9rZW5BdXRob3JpemVyKFxuICAgICAgdGhpcyxcbiAgICAgICdKV1RBdXRob3JpemVyJyxcbiAgICAgIHtcbiAgICAgICAgaGFuZGxlcjogand0QXV0aG9yaXplckxhbWJkYSxcbiAgICAgICAgaWRlbnRpdHlTb3VyY2U6ICdtZXRob2QucmVxdWVzdC5oZWFkZXIuQXV0aG9yaXphdGlvbicsXG4gICAgICAgIGF1dGhvcml6ZXJOYW1lOiAnSldUQXV0aG9yaXplcicsXG4gICAgICAgIC8vIERpc2FibGUgY2FjaGluZyBjb21wbGV0ZWx5IGZvciBkZWJ1Z2dpbmdcbiAgICAgICAgcmVzdWx0c0NhY2hlVHRsOiBjZGsuRHVyYXRpb24uc2Vjb25kcygwKSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIExhbWJkYSBpbnRlZ3JhdGlvbiBmb3IgZmV0Y2hpbmcgdmlkZW9zXG4gICAgY29uc3QgZmV0Y2hWaWRlb3NJbnRlZ3JhdGlvbiA9IG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKFxuICAgICAgZmV0Y2hWaWRlb3NMYW1iZGEsXG4gICAgICB7XG4gICAgICAgIHJlcXVlc3RUZW1wbGF0ZXM6IHtcbiAgICAgICAgICAnYXBwbGljYXRpb24vanNvbic6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIGJvZHk6IFwiJHV0aWwuZXNjYXBlSmF2YVNjcmlwdCgkaW5wdXQuanNvbignJCcpKVwiLFxuICAgICAgICAgIH0pLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gTGFtYmRhIGludGVncmF0aW9uIGZvciBmZXRjaGluZyBwcmV2aWV3IGRhdGFcbiAgICBjb25zdCBmZXRjaFByZXZpZXdJbnRlZ3JhdGlvbiA9IG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKFxuICAgICAgZmV0Y2hQcmV2aWV3TGFtYmRhLFxuICAgICAge1xuICAgICAgICByZXF1ZXN0VGVtcGxhdGVzOiB7XG4gICAgICAgICAgJ2FwcGxpY2F0aW9uL2pzb24nOiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBxdWVyeVN0cmluZ1BhcmFtZXRlcnM6IHtcbiAgICAgICAgICAgICAgdGltZXN0YW1wOiBcIiRpbnB1dC5wYXJhbXMoJ3RpbWVzdGFtcCcpXCIsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0pLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gTGFtYmRhIGludGVncmF0aW9uIGZvciBnZXQgdXNlclxuICAgIGNvbnN0IGdldFVzZXJJbnRlZ3JhdGlvbiA9IG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGdldFVzZXJMYW1iZGEsIHtcbiAgICAgIHJlcXVlc3RUZW1wbGF0ZXM6IHtcbiAgICAgICAgJ2FwcGxpY2F0aW9uL2pzb24nOiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgcXVlcnlTdHJpbmdQYXJhbWV0ZXJzOiB7XG4gICAgICAgICAgICB1c2VySWQ6IFwiJGlucHV0LnBhcmFtcygndXNlcklkJylcIixcbiAgICAgICAgICB9LFxuICAgICAgICB9KSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBMYW1iZGEgaW50ZWdyYXRpb24gZm9yIHVwc2VydCB1c2VyXG4gICAgY29uc3QgdXBzZXJ0VXNlckludGVncmF0aW9uID0gbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oXG4gICAgICB1cHNlcnRVc2VyTGFtYmRhLFxuICAgICAge1xuICAgICAgICByZXF1ZXN0VGVtcGxhdGVzOiB7XG4gICAgICAgICAgJ2FwcGxpY2F0aW9uL2pzb24nOiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBib2R5OiBcIiR1dGlsLmVzY2FwZUphdmFTY3JpcHQoJGlucHV0Lmpzb24oJyQnKSlcIixcbiAgICAgICAgICB9KSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIExhbWJkYSBpbnRlZ3JhdGlvbiBmb3IgZGVsZXRpbmcgdmlkZW9zXG4gICAgY29uc3QgZGVsZXRlVmlkZW9JbnRlZ3JhdGlvbiA9IG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKFxuICAgICAgZGVsZXRlVmlkZW9MYW1iZGEsXG4gICAgICB7XG4gICAgICAgIHJlcXVlc3RUZW1wbGF0ZXM6IHtcbiAgICAgICAgICAnYXBwbGljYXRpb24vanNvbic6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIHF1ZXJ5U3RyaW5nUGFyYW1ldGVyczoge1xuICAgICAgICAgICAgICB0aW1lc3RhbXA6IFwiJGlucHV0LnBhcmFtcygndGltZXN0YW1wJylcIixcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSksXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBXZWJTb2NrZXQgTGFtYmRhIEZ1bmN0aW9uc1xuICAgIGNvbnN0IHdlYnNvY2tldENvbm5lY3RMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKFxuICAgICAgdGhpcyxcbiAgICAgICdXZWJTb2NrZXRDb25uZWN0TGFtYmRhJyxcbiAgICAgIHtcbiAgICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXG4gICAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFxuICAgICAgICAgIHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9kaXN0L3dlYnNvY2tldC1jb25uZWN0JyksXG4gICAgICAgICksXG4gICAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgICAgbWVtb3J5U2l6ZTogMTI4LFxuICAgICAgICBsb2dHcm91cDogbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ1dlYlNvY2tldENvbm5lY3RMYW1iZGFMb2dHcm91cCcsIHtcbiAgICAgICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSyxcbiAgICAgICAgfSksXG4gICAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgICAgV0VCU09DS0VUX0NPTk5FQ1RJT05TX1RBQkxFX05BTUU6IHdlYnNvY2tldENvbm5lY3Rpb25zVGFibGUudGFibGVOYW1lLFxuICAgICAgICAgIFVTRVJTX1RBQkxFX05BTUU6IHVzZXJzVGFibGUudGFibGVOYW1lLFxuICAgICAgICAgIENPR05JVE9fVVNFUl9QT09MX0lEOlxuICAgICAgICAgICAgcHJvY2Vzcy5lbnYuTkVYVF9QVUJMSUNfQ09HTklUT19VU0VSX1BPT0xfSUQgfHwgJycsXG4gICAgICAgICAgQ09HTklUT19DTElFTlRfSUQ6IHByb2Nlc3MuZW52Lk5FWFRfUFVCTElDX0NPR05JVE9fQ0xJRU5UX0lEIHx8ICcnLFxuICAgICAgICAgIENPR05JVE9fUkVHSU9OOiBwcm9jZXNzLmVudi5ORVhUX1BVQkxJQ19DT0dOSVRPX1JFR0lPTiB8fCAndXMtZWFzdC0xJyxcbiAgICAgICAgICBKV1RfQVVUSE9SSVpFUl9MQU1CREFfQVJOOiBqd3RBdXRob3JpemVyTGFtYmRhLmZ1bmN0aW9uQXJuLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gR3JhbnQgV2ViU29ja2V0IGNvbm5lY3QgbGFtYmRhIHBlcm1pc3Npb24gdG8gaW52b2tlIEpXVCBhdXRob3JpemVyXG4gICAgLy8gQWRkIHBlcm1pc3Npb24gZGlyZWN0bHkgdG8gdGhlIGxhbWJkYSByb2xlIHRvIGF2b2lkIGNpcmN1bGFyIGRlcGVuZGVuY3lcbiAgICBsYW1iZGFSb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFsnbGFtYmRhOkludm9rZUZ1bmN0aW9uJ10sXG4gICAgICAgIHJlc291cmNlczogW2p3dEF1dGhvcml6ZXJMYW1iZGEuZnVuY3Rpb25Bcm5dLFxuICAgICAgfSksXG4gICAgKTtcblxuICAgIGNvbnN0IHdlYnNvY2tldERpc2Nvbm5lY3RMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKFxuICAgICAgdGhpcyxcbiAgICAgICdXZWJTb2NrZXREaXNjb25uZWN0TGFtYmRhJyxcbiAgICAgIHtcbiAgICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXG4gICAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFxuICAgICAgICAgIHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9kaXN0L3dlYnNvY2tldC1kaXNjb25uZWN0JyksXG4gICAgICAgICksXG4gICAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgICAgbWVtb3J5U2l6ZTogMTI4LFxuICAgICAgICBsb2dHcm91cDogbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ1dlYlNvY2tldERpc2Nvbm5lY3RMYW1iZGFMb2dHcm91cCcsIHtcbiAgICAgICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSyxcbiAgICAgICAgfSksXG4gICAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgICAgV0VCU09DS0VUX0NPTk5FQ1RJT05TX1RBQkxFX05BTUU6IHdlYnNvY2tldENvbm5lY3Rpb25zVGFibGUudGFibGVOYW1lLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgY29uc3Qgd2Vic29ja2V0TWVzc2FnZUxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24oXG4gICAgICB0aGlzLFxuICAgICAgJ1dlYlNvY2tldE1lc3NhZ2VMYW1iZGEnLFxuICAgICAge1xuICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcbiAgICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXG4gICAgICAgICAgcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2Rpc3Qvd2Vic29ja2V0LW1lc3NhZ2UnKSxcbiAgICAgICAgKSxcbiAgICAgICAgcm9sZTogbGFtYmRhUm9sZSxcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgICBtZW1vcnlTaXplOiAxMjgsXG4gICAgICAgIGxvZ0dyb3VwOiBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnV2ViU29ja2V0TWVzc2FnZUxhbWJkYUxvZ0dyb3VwJywge1xuICAgICAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgICB9KSxcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICBXRUJTT0NLRVRfQ09OTkVDVElPTlNfVEFCTEVfTkFNRTogd2Vic29ja2V0Q29ubmVjdGlvbnNUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgICAgVVNFUlNfVEFCTEVfTkFNRTogdXNlcnNUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBXZWJTb2NrZXQgYnJvYWRjYXN0IGxhbWJkYSBmb3IgYnJvYWRjYXN0aW5nIG1lc3NhZ2VzIHRvIGFsbCBjb25uZWN0ZWQgY2xpZW50c1xuICAgIGNvbnN0IHdlYnNvY2tldEJyb2FkY2FzdExhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24oXG4gICAgICB0aGlzLFxuICAgICAgJ1dlYlNvY2tldEJyb2FkY2FzdExhbWJkYScsXG4gICAgICB7XG4gICAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxuICAgICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcbiAgICAgICAgICBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vZGlzdC93ZWJzb2NrZXQtYnJvYWRjYXN0JyksXG4gICAgICAgICksXG4gICAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgICAgbWVtb3J5U2l6ZTogMTI4LFxuICAgICAgICBsb2dHcm91cDogbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ1dlYlNvY2tldEJyb2FkY2FzdExhbWJkYUxvZ0dyb3VwJywge1xuICAgICAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgICB9KSxcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICBXRUJTT0NLRVRfQ09OTkVDVElPTlNfVEFCTEVfTkFNRTogd2Vic29ja2V0Q29ubmVjdGlvbnNUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBXZWJTb2NrZXQgQVBJIEdhdGV3YXkgdjJcbiAgICBjb25zdCB3ZWJzb2NrZXRBcGkgPSBuZXcgYXBpZ2F0ZXdheXYyLldlYlNvY2tldEFwaSh0aGlzLCAnV2ViU29ja2V0QXBpJywge1xuICAgICAgYXBpTmFtZTogJ1ZpcmFsIFZpZGVvcyBXZWJTb2NrZXQgQVBJJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnV2ViU29ja2V0IEFQSSBmb3IgcmVhbC10aW1lIHZpZGVvIGdlbmVyYXRpb24gdXBkYXRlcycsXG4gICAgICBjb25uZWN0Um91dGVPcHRpb25zOiB7XG4gICAgICAgIGludGVncmF0aW9uOiBuZXcgYXBpZ2F0ZXdheXYySW50ZWdyYXRpb25zLldlYlNvY2tldExhbWJkYUludGVncmF0aW9uKFxuICAgICAgICAgICdDb25uZWN0SGFuZGxlcicsXG4gICAgICAgICAgd2Vic29ja2V0Q29ubmVjdExhbWJkYSxcbiAgICAgICAgKSxcbiAgICAgIH0sXG4gICAgICBkaXNjb25uZWN0Um91dGVPcHRpb25zOiB7XG4gICAgICAgIGludGVncmF0aW9uOiBuZXcgYXBpZ2F0ZXdheXYySW50ZWdyYXRpb25zLldlYlNvY2tldExhbWJkYUludGVncmF0aW9uKFxuICAgICAgICAgICdEaXNjb25uZWN0SGFuZGxlcicsXG4gICAgICAgICAgd2Vic29ja2V0RGlzY29ubmVjdExhbWJkYSxcbiAgICAgICAgKSxcbiAgICAgIH0sXG4gICAgICBkZWZhdWx0Um91dGVPcHRpb25zOiB7XG4gICAgICAgIGludGVncmF0aW9uOiBuZXcgYXBpZ2F0ZXdheXYySW50ZWdyYXRpb25zLldlYlNvY2tldExhbWJkYUludGVncmF0aW9uKFxuICAgICAgICAgICdNZXNzYWdlSGFuZGxlcicsXG4gICAgICAgICAgd2Vic29ja2V0TWVzc2FnZUxhbWJkYSxcbiAgICAgICAgKSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBjb25zdCB3ZWJzb2NrZXRTdGFnZSA9IG5ldyBhcGlnYXRld2F5djIuV2ViU29ja2V0U3RhZ2UoXG4gICAgICB0aGlzLFxuICAgICAgJ1dlYlNvY2tldFN0YWdlJyxcbiAgICAgIHtcbiAgICAgICAgd2ViU29ja2V0QXBpOiB3ZWJzb2NrZXRBcGksXG4gICAgICAgIHN0YWdlTmFtZTogJ3Byb2QnLFxuICAgICAgICBhdXRvRGVwbG95OiB0cnVlLFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gR3JhbnQgV2ViU29ja2V0IEFQSSBwZXJtaXNzaW9ucyB0byBMYW1iZGEgZnVuY3Rpb25zXG4gICAgbGFtYmRhUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbJ2V4ZWN1dGUtYXBpOk1hbmFnZUNvbm5lY3Rpb25zJ10sXG4gICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgIGBhcm46YXdzOmV4ZWN1dGUtYXBpOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fToke3dlYnNvY2tldEFwaS5hcGlJZH0vKmAsXG4gICAgICAgIF0sXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgLy8gTGFtYmRhIGludGVncmF0aW9uIGZvciBnZW5lcmF0aW5nIGF1ZGlvIGFuZCBzdWJ0aXRsZXNcbiAgICBjb25zdCBnZW5lcmF0ZUF1ZGlvU3VidGl0bGVJbnRlZ3JhdGlvbiA9IG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKFxuICAgICAgZ2VuZXJhdGVBdWRpb1N1YnRpdGxlTGFtYmRhLFxuICAgICAge1xuICAgICAgICByZXF1ZXN0VGVtcGxhdGVzOiB7XG4gICAgICAgICAgJ2FwcGxpY2F0aW9uL2pzb24nOiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBib2R5OiBcIiR1dGlsLmVzY2FwZUphdmFTY3JpcHQoJGlucHV0Lmpzb24oJyQnKSlcIixcbiAgICAgICAgICB9KSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIExhbWJkYSBpbnRlZ3JhdGlvbiBmb3IgZ2VuZXJhdGluZyBpbWFnZXNcbiAgICBjb25zdCBnZW5lcmF0ZUltYWdlSW50ZWdyYXRpb24gPSBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihcbiAgICAgIGdlbmVyYXRlSW1hZ2VMYW1iZGEsXG4gICAgICB7XG4gICAgICAgIHJlcXVlc3RUZW1wbGF0ZXM6IHtcbiAgICAgICAgICAnYXBwbGljYXRpb24vanNvbic6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIGJvZHk6IFwiJHV0aWwuZXNjYXBlSmF2YVNjcmlwdCgkaW5wdXQuanNvbignJCcpKVwiLFxuICAgICAgICAgIH0pLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gTGFtYmRhIGludGVncmF0aW9uIGZvciBzYXZpbmcgaW1hZ2VzXG4gICAgY29uc3Qgc2F2ZUltYWdlSW50ZWdyYXRpb24gPSBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihcbiAgICAgIHNhdmVJbWFnZUxhbWJkYSxcbiAgICAgIHtcbiAgICAgICAgcmVxdWVzdFRlbXBsYXRlczoge1xuICAgICAgICAgICdhcHBsaWNhdGlvbi9qc29uJzogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgYm9keTogXCIkdXRpbC5lc2NhcGVKYXZhU2NyaXB0KCRpbnB1dC5qc29uKCckJykpXCIsXG4gICAgICAgICAgfSksXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBMYW1iZGEgaW50ZWdyYXRpb24gZm9yIFdlYlNvY2tldCBicm9hZGNhc3RpbmdcbiAgICBjb25zdCB3ZWJzb2NrZXRCcm9hZGNhc3RJbnRlZ3JhdGlvbiA9IG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKFxuICAgICAgd2Vic29ja2V0QnJvYWRjYXN0TGFtYmRhLFxuICAgICAge1xuICAgICAgICByZXF1ZXN0VGVtcGxhdGVzOiB7XG4gICAgICAgICAgJ2FwcGxpY2F0aW9uL2pzb24nOiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBib2R5OiBcIiR1dGlsLmVzY2FwZUphdmFTY3JpcHQoJGlucHV0Lmpzb24oJyQnKSlcIixcbiAgICAgICAgICB9KSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIENyZWF0ZSBBUEkgcmVzb3VyY2VzIGFuZCBtZXRob2RzIHdpdGggSldUIGF1dGhvcml6YXRpb25cbiAgICBjb25zdCB2aWRlb1Jlc291cmNlID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ2dlbmVyYXRlLXZpZGVvJyk7XG4gICAgdmlkZW9SZXNvdXJjZS5hZGRNZXRob2QoJ1BPU1QnLCBxdWV1ZU1hbmFnZXJJbnRlZ3JhdGlvbiwge1xuICAgICAgYXV0aG9yaXplcjogand0QXV0aG9yaXplcixcbiAgICB9KTtcblxuICAgIGNvbnN0IGZldGNoVmlkZW9zUmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZSgnZmV0Y2gtdmlkZW9zJyk7XG4gICAgZmV0Y2hWaWRlb3NSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIGZldGNoVmlkZW9zSW50ZWdyYXRpb24sIHtcbiAgICAgIGF1dGhvcml6ZXI6IGp3dEF1dGhvcml6ZXIsXG4gICAgfSk7XG5cbiAgICBjb25zdCBmZXRjaFByZXZpZXdSZXNvdXJjZSA9IGFwaS5yb290LmFkZFJlc291cmNlKCdmZXRjaC1wcmV2aWV3Jyk7XG4gICAgZmV0Y2hQcmV2aWV3UmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBmZXRjaFByZXZpZXdJbnRlZ3JhdGlvbiwge1xuICAgICAgYXV0aG9yaXplcjogand0QXV0aG9yaXplcixcbiAgICAgIHJlcXVlc3RQYXJhbWV0ZXJzOiB7XG4gICAgICAgICdtZXRob2QucmVxdWVzdC5xdWVyeXN0cmluZy50aW1lc3RhbXAnOiB0cnVlLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGNvbnN0IGdlbmVyYXRlQXVkaW9TdWJ0aXRsZVJlc291cmNlID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoXG4gICAgICAnZ2VuZXJhdGUtYXVkaW8tc3VidGl0bGUnLFxuICAgICk7XG4gICAgZ2VuZXJhdGVBdWRpb1N1YnRpdGxlUmVzb3VyY2UuYWRkTWV0aG9kKFxuICAgICAgJ1BPU1QnLFxuICAgICAgZ2VuZXJhdGVBdWRpb1N1YnRpdGxlSW50ZWdyYXRpb24sXG4gICAgICB7XG4gICAgICAgIGF1dGhvcml6ZXI6IGp3dEF1dGhvcml6ZXIsXG4gICAgICB9LFxuICAgICk7XG5cbiAgICBjb25zdCBnZW5lcmF0ZUltYWdlUmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZSgnZ2VuZXJhdGUtaW1hZ2UnKTtcbiAgICBnZW5lcmF0ZUltYWdlUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgZ2VuZXJhdGVJbWFnZUludGVncmF0aW9uLCB7XG4gICAgICBhdXRob3JpemVyOiBqd3RBdXRob3JpemVyLFxuICAgIH0pO1xuXG4gICAgY29uc3Qgc2F2ZUltYWdlUmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZSgnc2F2ZS1pbWFnZScpO1xuICAgIHNhdmVJbWFnZVJlc291cmNlLmFkZE1ldGhvZCgnUE9TVCcsIHNhdmVJbWFnZUludGVncmF0aW9uLCB7XG4gICAgICBhdXRob3JpemVyOiBqd3RBdXRob3JpemVyLFxuICAgIH0pO1xuXG4gICAgY29uc3QgdXNlck1hbmFnZW1lbnRSZXNvdXJjZSA9IGFwaS5yb290LmFkZFJlc291cmNlKCd1c2VyJyk7XG4gICAgdXNlck1hbmFnZW1lbnRSZXNvdXJjZS5hZGRNZXRob2QoJ1BPU1QnLCB1cHNlcnRVc2VySW50ZWdyYXRpb24sIHtcbiAgICAgIGF1dGhvcml6ZXI6IGp3dEF1dGhvcml6ZXIsXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgR0VUIG1ldGhvZCB3aXRoIHF1ZXJ5IHBhcmFtZXRlcnNcbiAgICB1c2VyTWFuYWdlbWVudFJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgZ2V0VXNlckludGVncmF0aW9uLCB7XG4gICAgICBhdXRob3JpemVyOiBqd3RBdXRob3JpemVyLFxuICAgICAgcmVxdWVzdFBhcmFtZXRlcnM6IHtcbiAgICAgICAgJ21ldGhvZC5yZXF1ZXN0LnF1ZXJ5c3RyaW5nLnVzZXJJZCc6IHRydWUsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgY29uc3QgZGVsZXRlVmlkZW9SZXNvdXJjZSA9IGFwaS5yb290LmFkZFJlc291cmNlKCdkZWxldGUtdmlkZW8nKTtcbiAgICBkZWxldGVWaWRlb1Jlc291cmNlLmFkZE1ldGhvZCgnREVMRVRFJywgZGVsZXRlVmlkZW9JbnRlZ3JhdGlvbiwge1xuICAgICAgYXV0aG9yaXplcjogand0QXV0aG9yaXplcixcbiAgICAgIHJlcXVlc3RQYXJhbWV0ZXJzOiB7XG4gICAgICAgICdtZXRob2QucmVxdWVzdC5xdWVyeXN0cmluZy50aW1lc3RhbXAnOiB0cnVlLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGNvbnN0IHdlYnNvY2tldEJyb2FkY2FzdFJlc291cmNlID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoXG4gICAgICAnd2Vic29ja2V0LWJyb2FkY2FzdCcsXG4gICAgKTtcbiAgICB3ZWJzb2NrZXRCcm9hZGNhc3RSZXNvdXJjZS5hZGRNZXRob2QoXG4gICAgICAnUE9TVCcsXG4gICAgICB3ZWJzb2NrZXRCcm9hZGNhc3RJbnRlZ3JhdGlvbixcbiAgICAgIHtcbiAgICAgICAgYXV0aG9yaXplcjogand0QXV0aG9yaXplcixcbiAgICAgIH0sXG4gICAgKTtcbiAgfVxufVxuIl19