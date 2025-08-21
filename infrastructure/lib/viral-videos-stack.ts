import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
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

    // Create FFmpeg Lambda Layer
    const ffmpegLayer = new lambda.LayerVersion(this, 'FFmpegLayer', {
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../lambda/ffmpeg-layer'),
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
          path.join(__dirname, '../dist/full-video-queue'),
        ),
        role: lambdaRole,
        timeout: cdk.Duration.minutes(1),
        memorySize: 128,
        environment: {
          VIDEO_QUEUE_URL: videoQueue.queueUrl,
          USERS_TABLE_NAME: usersTable.tableName,
        },
      },
    );

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
        role: lambdaRole,
        timeout: cdk.Duration.seconds(30),
        memorySize: 128,
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
      environment: {
        VIDEO_BUCKET_NAME: videoBucket.bucketName,
        VIDEO_PARTS_BUCKET_NAME: videoPartsBucket.bucketName,
        USERS_TABLE_NAME: usersTable.tableName,
      },
    });

    // Lambda function for fetching scripts
    const fetchScriptLambda = new lambda.Function(this, 'FetchScriptLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../dist/fetch-script')),
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

    // Lambda function for generating story breakdowns
    const generateStoryBreakdownLambda = new lambda.Function(
      this,
      'GenerateStoryBreakdownLambda',
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'index.handler',
        code: lambda.Code.fromAsset(
          path.join(__dirname, '../dist/generate-story-breakdown'),
        ),
        role: lambdaRole,
        timeout: cdk.Duration.minutes(2),
        memorySize: 256,
        environment: {
          OPENAI_API_KEY: openaiApiKey,
        },
      },
    );

    // Lambda function for generating audio narration
    const generateAudioLambda = new lambda.Function(
      this,
      'GenerateAudioLambda',
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'index.handler',
        code: lambda.Code.fromAsset(
          path.join(__dirname, '../dist/generate-audio'),
        ),
        role: lambdaRole,
        timeout: cdk.Duration.minutes(5),
        memorySize: 512,
        environment: {
          OPENAI_API_KEY: openaiApiKey,
          VIDEO_PARTS_BUCKET_NAME: videoPartsBucket.bucketName,
        },
      },
    );

    // Lambda function for generating images
    const generateImagesLambda = new lambda.Function(
      this,
      'GenerateImagesLambda',
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'index.handler',
        code: lambda.Code.fromAsset(
          path.join(__dirname, '../dist/generate-images'),
        ),
        role: lambdaRole,
        timeout: cdk.Duration.minutes(10),
        memorySize: 1024,
        environment: {
          RUNWAY_API_KEY: runwayApiKey,
          VIDEO_PARTS_BUCKET_NAME: videoPartsBucket.bucketName,
        },
      },
    );

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

    // Lambda integration for fetching scripts
    const fetchScriptIntegration = new apigateway.LambdaIntegration(
      fetchScriptLambda,
      {
        requestTemplates: {
          'application/json': JSON.stringify({
            body: "$util.escapeJavaScript($input.json('$'))",
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

    // Lambda integration for generating story breakdowns
    const generateStoryBreakdownIntegration = new apigateway.LambdaIntegration(
      generateStoryBreakdownLambda,
      {
        requestTemplates: {
          'application/json': JSON.stringify({
            body: "$util.escapeJavaScript($input.json('$'))",
          }),
        },
      },
    );

    // Lambda integration for generating audio narration
    const generateAudioIntegration = new apigateway.LambdaIntegration(
      generateAudioLambda,
      {
        requestTemplates: {
          'application/json': JSON.stringify({
            body: "$util.escapeJavaScript($input.json('$'))",
          }),
        },
      },
    );

    // Lambda integration for generating images
    const generateImagesIntegration = new apigateway.LambdaIntegration(
      generateImagesLambda,
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

    const fetchScriptResource = api.root.addResource('fetch-script');
    fetchScriptResource.addMethod('GET', fetchScriptIntegration, {
      authorizer: jwtAuthorizer,
    });

    const generateStoryBreakdownResource = api.root.addResource(
      'generate-story-breakdown',
    );
    generateStoryBreakdownResource.addMethod(
      'POST',
      generateStoryBreakdownIntegration,
      {
        authorizer: jwtAuthorizer,
      },
    );

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

    new logs.LogGroup(this, 'FetchScriptLogGroup', {
      logGroupName: `/aws/lambda/${fetchScriptLambda.functionName}`,
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
