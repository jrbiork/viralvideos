"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ViralVideosStack = void 0;
const cdk = require("aws-cdk-lib");
const s3 = require("aws-cdk-lib/aws-s3");
const lambda = require("aws-cdk-lib/aws-lambda");
const iam = require("aws-cdk-lib/aws-iam");
const logs = require("aws-cdk-lib/aws-logs");
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
        // IAM Role for Lambda
        const lambdaRole = new iam.Role(this, 'VideoGenerationLambdaRole', {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
            ],
        });
        // Grant S3 permissions to Lambda
        videoBucket.grantReadWrite(lambdaRole);
        // Lambda function for video generation
        const videoGenerationLambda = new lambda.Function(this, 'VideoGenerationLambda', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/video-generation')),
            role: lambdaRole,
            timeout: cdk.Duration.minutes(15),
            memorySize: 1024,
            environment: {
                VIDEO_BUCKET_NAME: videoBucket.bucketName,
                RUNWAY_API_KEY: runwayApiKey,
                OPENAI_API_KEY: openaiApiKey,
            },
        });
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
exports.ViralVideosStack = ViralVideosStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlyYWwtdmlkZW9zLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidmlyYWwtdmlkZW9zLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG1DQUFtQztBQUVuQyx5Q0FBeUM7QUFDekMsaURBQWlEO0FBQ2pELDJDQUEyQztBQUMzQyw2Q0FBNkM7QUFDN0MsNkJBQTZCO0FBQzdCLGlDQUFpQztBQUVqQyw0Q0FBNEM7QUFDNUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxTQUFTLENBQUMsRUFBRSxDQUFDLENBQUM7QUFFekQsTUFBYSxnQkFBaUIsU0FBUSxHQUFHLENBQUMsS0FBSztJQUM3QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXNCO1FBQzlELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLDhCQUE4QjtRQUM5QixNQUFNLFlBQVksR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWMsSUFBSSxFQUFFLENBQUM7UUFDdEQsTUFBTSxZQUFZLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLElBQUksRUFBRSxDQUFDO1FBRXRELG9CQUFvQjtRQUNwQixJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDbEIsT0FBTyxDQUFDLElBQUksQ0FBQywyREFBMkQsQ0FBQyxDQUFDO1FBQzVFLENBQUM7UUFDRCxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDbEIsT0FBTyxDQUFDLElBQUksQ0FBQywyREFBMkQsQ0FBQyxDQUFDO1FBQzVFLENBQUM7UUFFRCwwQ0FBMEM7UUFDMUMsTUFBTSxXQUFXLEdBQUcsSUFBSSxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxhQUFhLEVBQUU7WUFDckQsVUFBVSxFQUFFLGdCQUFnQixJQUFJLENBQUMsT0FBTyxJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUU7WUFDekQsU0FBUyxFQUFFLElBQUk7WUFDZixVQUFVLEVBQUUsRUFBRSxDQUFDLGdCQUFnQixDQUFDLFVBQVU7WUFDMUMsaUJBQWlCLEVBQUUsRUFBRSxDQUFDLGlCQUFpQixDQUFDLFNBQVM7WUFDakQsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsT0FBTyxFQUFFLG9CQUFvQjtZQUM5RCxjQUFjLEVBQUU7Z0JBQ2Q7b0JBQ0UsRUFBRSxFQUFFLGlCQUFpQjtvQkFDckIsT0FBTyxFQUFFLElBQUk7b0JBQ2IsMkJBQTJCLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO29CQUNqRCxVQUFVLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO2lCQUNsQzthQUNGO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsc0JBQXNCO1FBQ3RCLE1BQU0sVUFBVSxHQUFHLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsMkJBQTJCLEVBQUU7WUFDakUsU0FBUyxFQUFFLElBQUksR0FBRyxDQUFDLGdCQUFnQixDQUFDLHNCQUFzQixDQUFDO1lBQzNELGVBQWUsRUFBRTtnQkFDZixHQUFHLENBQUMsYUFBYSxDQUFDLHdCQUF3QixDQUN4QywwQ0FBMEMsQ0FDM0M7YUFDRjtTQUNGLENBQUMsQ0FBQztRQUVILGlDQUFpQztRQUNqQyxXQUFXLENBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBRXZDLHVDQUF1QztRQUN2QyxNQUFNLHFCQUFxQixHQUFHLElBQUksTUFBTSxDQUFDLFFBQVEsQ0FDL0MsSUFBSSxFQUNKLHVCQUF1QixFQUN2QjtZQUNFLE9BQU8sRUFBRSxNQUFNLENBQUMsT0FBTyxDQUFDLFdBQVc7WUFDbkMsT0FBTyxFQUFFLGVBQWU7WUFDeEIsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUN6QixJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSw0QkFBNEIsQ0FBQyxDQUNuRDtZQUNELElBQUksRUFBRSxVQUFVO1lBQ2hCLE9BQU8sRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDakMsVUFBVSxFQUFFLElBQUk7WUFDaEIsV0FBVyxFQUFFO2dCQUNYLGlCQUFpQixFQUFFLFdBQVcsQ0FBQyxVQUFVO2dCQUN6QyxjQUFjLEVBQUUsWUFBWTtnQkFDNUIsY0FBYyxFQUFFLFlBQVk7YUFDN0I7U0FDRixDQUNGLENBQUM7UUFFRixrQ0FBa0M7UUFDbEMsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSx5QkFBeUIsRUFBRTtZQUNqRCxZQUFZLEVBQUUsZUFBZSxxQkFBcUIsQ0FBQyxZQUFZLEVBQUU7WUFDakUsU0FBUyxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsUUFBUTtZQUN0QyxhQUFhLEVBQUUsR0FBRyxDQUFDLGFBQWEsQ0FBQyxPQUFPO1NBQ3pDLENBQUMsQ0FBQztRQUVILFVBQVU7UUFDVixJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGlCQUFpQixFQUFFO1lBQ3pDLEtBQUssRUFBRSxXQUFXLENBQUMsVUFBVTtZQUM3QixXQUFXLEVBQUUsOEJBQThCO1NBQzVDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsMEJBQTBCLEVBQUU7WUFDbEQsS0FBSyxFQUFFLHFCQUFxQixDQUFDLFdBQVc7WUFDeEMsV0FBVyxFQUFFLDBDQUEwQztTQUN4RCxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLDJCQUEyQixFQUFFO1lBQ25ELEtBQUssRUFBRSxxQkFBcUIsQ0FBQyxZQUFZO1lBQ3pDLFdBQVcsRUFBRSwyQ0FBMkM7U0FDekQsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBMUZELDRDQTBGQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBsb2dzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sb2dzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgKiBhcyBkb3RlbnYgZnJvbSAnZG90ZW52JztcblxuLy8gTG9hZCBlbnZpcm9ubWVudCB2YXJpYWJsZXMgZnJvbSAuZW52IGZpbGVcbmRvdGVudi5jb25maWcoeyBwYXRoOiBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLmVudicpIH0pO1xuXG5leHBvcnQgY2xhc3MgVmlyYWxWaWRlb3NTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzPzogY2RrLlN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIC8vIEdldCBBUEkga2V5cyB3aXRoIGZhbGxiYWNrc1xuICAgIGNvbnN0IHJ1bndheUFwaUtleSA9IHByb2Nlc3MuZW52LlJVTldBWV9BUElfS0VZIHx8ICcnO1xuICAgIGNvbnN0IG9wZW5haUFwaUtleSA9IHByb2Nlc3MuZW52Lk9QRU5BSV9BUElfS0VZIHx8ICcnO1xuXG4gICAgLy8gVmFsaWRhdGUgQVBJIGtleXNcbiAgICBpZiAoIXJ1bndheUFwaUtleSkge1xuICAgICAgY29uc29sZS53YXJuKCfimqDvuI8gIFJVTldBWV9BUElfS0VZIGlzIG5vdCBzZXQuIFZpZGVvIGdlbmVyYXRpb24gbWF5IGZhaWwuJyk7XG4gICAgfVxuICAgIGlmICghb3BlbmFpQXBpS2V5KSB7XG4gICAgICBjb25zb2xlLndhcm4oJ+KaoO+4jyAgT1BFTkFJX0FQSV9LRVkgaXMgbm90IHNldC4gVmlkZW8gZ2VuZXJhdGlvbiBtYXkgZmFpbC4nKTtcbiAgICB9XG5cbiAgICAvLyBTMyBCdWNrZXQgZm9yIHN0b3JpbmcgdmlkZW9zIGFuZCBhc3NldHNcbiAgICBjb25zdCB2aWRlb0J1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ1ZpZGVvQnVja2V0Jywge1xuICAgICAgYnVja2V0TmFtZTogYHZpcmFsLXZpZGVvcy0ke3RoaXMuYWNjb3VudH0tJHt0aGlzLnJlZ2lvbn1gLFxuICAgICAgdmVyc2lvbmVkOiB0cnVlLFxuICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksIC8vIEZvciBkZW1vIHB1cnBvc2VzXG4gICAgICBsaWZlY3ljbGVSdWxlczogW1xuICAgICAgICB7XG4gICAgICAgICAgaWQ6ICdEZWxldGVPbGRBc3NldHMnLFxuICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgbm9uY3VycmVudFZlcnNpb25FeHBpcmF0aW9uOiBjZGsuRHVyYXRpb24uZGF5cyg3KSxcbiAgICAgICAgICBleHBpcmF0aW9uOiBjZGsuRHVyYXRpb24uZGF5cygzMCksXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gSUFNIFJvbGUgZm9yIExhbWJkYVxuICAgIGNvbnN0IGxhbWJkYVJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ1ZpZGVvR2VuZXJhdGlvbkxhbWJkYVJvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnbGFtYmRhLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoXG4gICAgICAgICAgJ3NlcnZpY2Utcm9sZS9BV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGUnLFxuICAgICAgICApLFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IFMzIHBlcm1pc3Npb25zIHRvIExhbWJkYVxuICAgIHZpZGVvQnVja2V0LmdyYW50UmVhZFdyaXRlKGxhbWJkYVJvbGUpO1xuXG4gICAgLy8gTGFtYmRhIGZ1bmN0aW9uIGZvciB2aWRlbyBnZW5lcmF0aW9uXG4gICAgY29uc3QgdmlkZW9HZW5lcmF0aW9uTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbihcbiAgICAgIHRoaXMsXG4gICAgICAnVmlkZW9HZW5lcmF0aW9uTGFtYmRhJyxcbiAgICAgIHtcbiAgICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXG4gICAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFxuICAgICAgICAgIHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9sYW1iZGEvdmlkZW8tZ2VuZXJhdGlvbicpLFxuICAgICAgICApLFxuICAgICAgICByb2xlOiBsYW1iZGFSb2xlLFxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcygxNSksXG4gICAgICAgIG1lbW9yeVNpemU6IDEwMjQsXG4gICAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgICAgVklERU9fQlVDS0VUX05BTUU6IHZpZGVvQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICAgICAgUlVOV0FZX0FQSV9LRVk6IHJ1bndheUFwaUtleSxcbiAgICAgICAgICBPUEVOQUlfQVBJX0tFWTogb3BlbmFpQXBpS2V5LFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gQ2xvdWRXYXRjaCBMb2cgR3JvdXAgZm9yIExhbWJkYVxuICAgIG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdWaWRlb0dlbmVyYXRpb25Mb2dHcm91cCcsIHtcbiAgICAgIGxvZ0dyb3VwTmFtZTogYC9hd3MvbGFtYmRhLyR7dmlkZW9HZW5lcmF0aW9uTGFtYmRhLmZ1bmN0aW9uTmFtZX1gLFxuICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgIH0pO1xuXG4gICAgLy8gT3V0cHV0c1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdWaWRlb0J1Y2tldE5hbWUnLCB7XG4gICAgICB2YWx1ZTogdmlkZW9CdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUzMgQnVja2V0IGZvciBzdG9yaW5nIHZpZGVvcycsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVmlkZW9HZW5lcmF0aW9uTGFtYmRhQXJuJywge1xuICAgICAgdmFsdWU6IHZpZGVvR2VuZXJhdGlvbkxhbWJkYS5mdW5jdGlvbkFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnTGFtYmRhIGZ1bmN0aW9uIEFSTiBmb3IgdmlkZW8gZ2VuZXJhdGlvbicsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVmlkZW9HZW5lcmF0aW9uTGFtYmRhTmFtZScsIHtcbiAgICAgIHZhbHVlOiB2aWRlb0dlbmVyYXRpb25MYW1iZGEuZnVuY3Rpb25OYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdMYW1iZGEgZnVuY3Rpb24gbmFtZSBmb3IgdmlkZW8gZ2VuZXJhdGlvbicsXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==