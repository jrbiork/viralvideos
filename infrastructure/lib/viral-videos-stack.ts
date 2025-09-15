import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '../.env') });

export class ViralVideosStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
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
    const websocketConnectionsTable = new dynamodb.Table(
      this,
      'WebSocketConnectionsTable',
      {
        tableName: 'viral-videos-websocket-connections',
        partitionKey: {
          name: 'connectionId',
          type: dynamodb.AttributeType.STRING,
        },
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        removalPolicy: cdk.RemovalPolicy.DESTROY, // For demo purposes
        timeToLiveAttribute: 'ttl', // Auto-delete expired connections
      },
    );

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
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole',
        ),
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
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../layers/ffmpeg-layer'),
      ),
      compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
      description: 'FFmpeg binaries for video processing',
      layerVersionName: 'ffmpeg-layer',
    });

    // Lambda function for video generation (now triggered by SQS)
    const videoGenerationLambda = new lambda.Function(
      this,
      'VideoGenerationLambda',
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'index.handler',
        code: lambda.Code.fromAsset(
          path.join(__dirname, '../dist/video-generation'),
        ),
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
      },
    );

    // Add SQS event source to video generation lambda
    videoGenerationLambda.addEventSource(
      new lambdaEventSources.SqsEventSource(videoQueue, {
        batchSize: 1, // Process one message at a time
        maxBatchingWindow: cdk.Duration.seconds(0),
      }),
    );

    // Lambda function for queue management (receives requests and puts them in SQS)
    const fullVideoQueueLambda = new lambda.Function(
      this,
      'FullVideoQueueLambda',
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'index.handler',
        code: lambda.Code.fromAsset(
          path.join(__dirname, '../dist/video-queue'),
        ),
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
      },
    );

    // Create a separate role for JWT authorizer to avoid circular dependencies
    const jwtAuthorizerRole = new iam.Role(this, 'JWTAuthorizerRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole',
        ),
      ],
    });

    // Grant DynamoDB permissions to JWT authorizer
    usersTable.grantReadData(jwtAuthorizerRole);

    // Lambda function for JWT authorization
    const jwtAuthorizerLambda = new lambda.Function(
      this,
      'JWTAuthorizerLambda',
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'index.handler',
        code: lambda.Code.fromAsset(
          path.join(__dirname, '../dist/jwt-authorizer'),
        ),
        role: jwtAuthorizerRole,
        timeout: cdk.Duration.seconds(30),
        memorySize: 128,
        logGroup: new logs.LogGroup(this, 'JWTAuthorizerLambdaLogGroup', {
          retention: logs.RetentionDays.ONE_WEEK,
        }),
        environment: {
          NEXT_PUBLIC_COGNITO_USER_POOL_ID:
            process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || '',
          NEXT_PUBLIC_COGNITO_CLIENT_ID:
            process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || '',
          NEXT_PUBLIC_COGNITO_REGION:
            process.env.NEXT_PUBLIC_COGNITO_REGION || 'us-east-1',
          USERS_TABLE_NAME: usersTable.tableName,
        },
      },
    );

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
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../dist/fetch-preview'),
      ),
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
    const generateAudioSubtitleLambda = new lambda.Function(
      this,
      'GenerateAudioSubtitleLambda',
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'index.handler',
        code: lambda.Code.fromAsset(
          path.join(__dirname, '../dist/generate-audio-subtitle'),
        ),
        role: lambdaRole,
        timeout: cdk.Duration.minutes(5),
        memorySize: 512,
        logGroup: new logs.LogGroup(
          this,
          'GenerateAudioSubtitleLambdaLogGroup',
          {
            retention: logs.RetentionDays.ONE_WEEK,
          },
        ),
        environment: {
          OPENAI_API_KEY: openaiApiKey,
          VIDEO_PARTS_BUCKET_NAME: videoPartsBucket.bucketName,
          WEBSOCKET_DOMAIN_NAME: websocketDomainName,
          WEBSOCKET_STAGE: websocketEnv,
          WEBSOCKET_CONNECTIONS_TABLE_NAME: websocketConnectionsTable.tableName,
        },
      },
    );

    // Lambda function for generating images
    const generateImageLambda = new lambda.Function(
      this,
      'GenerateImageLambda',
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'index.handler',
        code: lambda.Code.fromAsset(
          path.join(__dirname, '../dist/generate-image'),
        ),
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
      },
    );

    // Lambda function for animating an image into video
    const animateImageLambda = new lambda.Function(this, 'AnimateImageLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../dist/animate-image'),
      ),
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
    const queueManagerIntegration = new apigateway.LambdaIntegration(
      fullVideoQueueLambda,
      {
        requestTemplates: {
          'application/json': JSON.stringify({
            body: "$util.escapeJavaScript($input.json('$'))",
          }),
        },
      },
    );

    // JWT Authorizer
    const jwtAuthorizer = new apigateway.TokenAuthorizer(
      this,
      'JWTAuthorizer',
      {
        handler: jwtAuthorizerLambda,
        identitySource: 'method.request.header.Authorization',
        authorizerName: 'JWTAuthorizer',
        // Disable caching completely for debugging
        resultsCacheTtl: cdk.Duration.seconds(0),
      },
    );

    // Lambda integration for fetching videos
    const fetchVideosIntegration = new apigateway.LambdaIntegration(
      fetchVideosLambda,
      {
        requestTemplates: {
          'application/json': JSON.stringify({
            body: "$util.escapeJavaScript($input.json('$'))",
          }),
        },
      },
    );

    // Lambda integration for fetching preview data
    const fetchPreviewIntegration = new apigateway.LambdaIntegration(
      fetchPreviewLambda,
      {
        requestTemplates: {
          'application/json': JSON.stringify({
            queryStringParameters: {
              timestamp: "$input.params('timestamp')",
            },
          }),
        },
      },
    );

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
    const upsertUserIntegration = new apigateway.LambdaIntegration(
      upsertUserLambda,
      {
        requestTemplates: {
          'application/json': JSON.stringify({
            body: "$util.escapeJavaScript($input.json('$'))",
          }),
        },
      },
    );

    // Lambda integration for deleting videos
    const deleteVideoIntegration = new apigateway.LambdaIntegration(
      deleteVideoLambda,
      {
        requestTemplates: {
          'application/json': JSON.stringify({
            queryStringParameters: {
              timestamp: "$input.params('timestamp')",
            },
          }),
        },
      },
    );

    // WebSocket Lambda Functions
    const websocketConnectLambda = new lambda.Function(
      this,
      'WebSocketConnectLambda',
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'index.handler',
        code: lambda.Code.fromAsset(
          path.join(__dirname, '../dist/websocket-connect'),
        ),
        role: lambdaRole,
        timeout: cdk.Duration.seconds(30),
        memorySize: 128,
        logGroup: new logs.LogGroup(this, 'WebSocketConnectLambdaLogGroup', {
          retention: logs.RetentionDays.ONE_WEEK,
        }),
        environment: {
          WEBSOCKET_CONNECTIONS_TABLE_NAME: websocketConnectionsTable.tableName,
          USERS_TABLE_NAME: usersTable.tableName,
          COGNITO_USER_POOL_ID:
            process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || '',
          COGNITO_CLIENT_ID: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || '',
          COGNITO_REGION: process.env.NEXT_PUBLIC_COGNITO_REGION || 'us-east-1',
          JWT_AUTHORIZER_LAMBDA_ARN: jwtAuthorizerLambda.functionArn,
        },
      },
    );

    // Grant WebSocket connect lambda permission to invoke JWT authorizer
    // Add permission directly to the lambda role to avoid circular dependency
    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['lambda:InvokeFunction'],
        resources: [jwtAuthorizerLambda.functionArn],
      }),
    );

    const websocketDisconnectLambda = new lambda.Function(
      this,
      'WebSocketDisconnectLambda',
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'index.handler',
        code: lambda.Code.fromAsset(
          path.join(__dirname, '../dist/websocket-disconnect'),
        ),
        role: lambdaRole,
        timeout: cdk.Duration.seconds(30),
        memorySize: 128,
        logGroup: new logs.LogGroup(this, 'WebSocketDisconnectLambdaLogGroup', {
          retention: logs.RetentionDays.ONE_WEEK,
        }),
        environment: {
          WEBSOCKET_CONNECTIONS_TABLE_NAME: websocketConnectionsTable.tableName,
        },
      },
    );

    const websocketMessageLambda = new lambda.Function(
      this,
      'WebSocketMessageLambda',
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'index.handler',
        code: lambda.Code.fromAsset(
          path.join(__dirname, '../dist/websocket-message'),
        ),
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
      },
    );

    // WebSocket broadcast lambda for broadcasting messages to all connected clients
    const websocketBroadcastLambda = new lambda.Function(
      this,
      'WebSocketBroadcastLambda',
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'index.handler',
        code: lambda.Code.fromAsset(
          path.join(__dirname, '../dist/websocket-broadcast'),
        ),
        role: lambdaRole,
        timeout: cdk.Duration.seconds(30),
        memorySize: 128,
        logGroup: new logs.LogGroup(this, 'WebSocketBroadcastLambdaLogGroup', {
          retention: logs.RetentionDays.ONE_WEEK,
        }),
        environment: {
          WEBSOCKET_CONNECTIONS_TABLE_NAME: websocketConnectionsTable.tableName,
        },
      },
    );

    // WebSocket API Gateway v2
    const websocketApi = new apigatewayv2.WebSocketApi(this, 'WebSocketApi', {
      apiName: 'Viral Videos WebSocket API',
      description: 'WebSocket API for real-time video generation updates',
      connectRouteOptions: {
        integration: new apigatewayv2Integrations.WebSocketLambdaIntegration(
          'ConnectHandler',
          websocketConnectLambda,
        ),
      },
      disconnectRouteOptions: {
        integration: new apigatewayv2Integrations.WebSocketLambdaIntegration(
          'DisconnectHandler',
          websocketDisconnectLambda,
        ),
      },
      defaultRouteOptions: {
        integration: new apigatewayv2Integrations.WebSocketLambdaIntegration(
          'MessageHandler',
          websocketMessageLambda,
        ),
      },
    });

    const websocketStage = new apigatewayv2.WebSocketStage(
      this,
      'WebSocketStage',
      {
        webSocketApi: websocketApi,
        stageName: 'prod',
        autoDeploy: true,
      },
    );

    // Grant WebSocket API permissions to Lambda functions
    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['execute-api:ManageConnections'],
        resources: [
          `arn:aws:execute-api:${this.region}:${this.account}:${websocketApi.apiId}/*`,
        ],
      }),
    );

    // Lambda integration for generating audio and subtitles
    const generateAudioSubtitleIntegration = new apigateway.LambdaIntegration(
      generateAudioSubtitleLambda,
      {
        requestTemplates: {
          'application/json': JSON.stringify({
            body: "$util.escapeJavaScript($input.json('$'))",
          }),
        },
      },
    );

    // Lambda integration for generating images
    const generateImageIntegration = new apigateway.LambdaIntegration(
      generateImageLambda,
      {
        requestTemplates: {
          'application/json': JSON.stringify({
            body: "$util.escapeJavaScript($input.json('$'))",
          }),
        },
      },
    );

    // Lambda integration for saving images
    const saveImageIntegration = new apigateway.LambdaIntegration(
      saveImageLambda,
      {
        requestTemplates: {
          'application/json': JSON.stringify({
            body: "$util.escapeJavaScript($input.json('$'))",
          }),
        },
      },
    );

    // Lambda integration for WebSocket broadcasting
    const websocketBroadcastIntegration = new apigateway.LambdaIntegration(
      websocketBroadcastLambda,
      {
        requestTemplates: {
          'application/json': JSON.stringify({
            body: "$util.escapeJavaScript($input.json('$'))",
          }),
        },
      },
    );

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

    const generateAudioSubtitleResource = api.root.addResource(
      'generate-audio-subtitle',
    );
    generateAudioSubtitleResource.addMethod(
      'POST',
      generateAudioSubtitleIntegration,
      {
        authorizer: jwtAuthorizer,
      },
    );

    const generateImageResource = api.root.addResource('generate-image');
    generateImageResource.addMethod('POST', generateImageIntegration, {
      authorizer: jwtAuthorizer,
    });

    // Lambda integration for animate-image
    const animateImageIntegration = new apigateway.LambdaIntegration(
      animateImageLambda,
      {
        requestTemplates: {
          'application/json': JSON.stringify({
            body: "$util.escapeJavaScript($input.json('$'))",
            queryString: '$input.params().querystring',
          }),
        },
      },
    );

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

    const websocketBroadcastResource = api.root.addResource(
      'websocket-broadcast',
    );
    websocketBroadcastResource.addMethod(
      'POST',
      websocketBroadcastIntegration,
      {
        authorizer: jwtAuthorizer,
      },
    );
  }
}
