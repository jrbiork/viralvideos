import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
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

    // Create FFmpeg Lambda Layer
    const ffmpegLayer = new lambda.LayerVersion(this, 'FFmpegLayer', {
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../lambda/ffmpeg-layer'),
      ),
      compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
      description: 'FFmpeg binaries for video processing',
      layerVersionName: 'ffmpeg-layer',
    });

    // Lambda function for video generation
    const videoGenerationLambda = new lambda.Function(
      this,
      'VideoGenerationLambda',
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'index.handler',
        code: lambda.Code.fromAsset(
          path.join(__dirname, '../lambda/video-generation'),
        ),
        role: lambdaRole,
        timeout: cdk.Duration.minutes(15),
        memorySize: 3008, // Increased for video processing
        layers: [ffmpegLayer],
        environment: {
          VIDEO_BUCKET_NAME: videoBucket.bucketName,
          VIDEO_PARTS_BUCKET_NAME: videoPartsBucket.bucketName,
          RUNWAY_API_KEY: runwayApiKey,
          OPENAI_API_KEY: openaiApiKey,
          PATH: '/opt/bin:/usr/local/bin:/usr/bin/:/bin',
          FONTCONFIG_PATH: '/opt/etc/fonts',
          FONTCONFIG_FILE: '/opt/etc/fonts/fonts.conf',
        },
      },
    );

    // CloudWatch Log Group for Lambda
    new logs.LogGroup(this, 'VideoGenerationLogGroup', {
      logGroupName: `/aws/lambda/${videoGenerationLambda.functionName}`,
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
  }
}
