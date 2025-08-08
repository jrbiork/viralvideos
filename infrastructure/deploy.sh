#!/bin/bash

# Deploy the updated infrastructure with SQS queue and new lambda functions

echo "🚀 Starting deployment of Viral Videos infrastructure..."

# Check if AWS credentials are configured
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ AWS credentials not configured. Please run 'aws configure' first."
    exit 1
fi

# Navigate to infrastructure directory
cd infrastructure

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build the TypeScript code
echo "🔨 Building TypeScript..."
npm run build

# Package Lambda functions
echo "📦 Packaging Lambda functions..."
./package-lambda.sh

# Deploy the stack
echo "☁️ Deploying to AWS..."
npx cdk deploy --require-approval never

# Get the outputs
echo "📋 Getting stack outputs..."
aws cloudformation describe-stacks --stack-name ViralVideosStack --query 'Stacks[0].Outputs' --output table

echo "✅ Deployment completed!"
echo ""
echo "📝 Next steps:"
echo "1. Update your .env file with the new QUEUE_MANAGER_LAMBDA_ARN"
echo "2. The video generation is now asynchronous - videos will be queued and processed in the background"
echo "3. Check the CloudWatch logs for the lambda functions to monitor processing"
echo ""
echo "🔗 Useful commands:"
echo "- View logs: aws logs tail /aws/lambda/ViralVideosStack-VideoGenerationLambda --follow"
echo "- View queue: aws sqs get-queue-attributes --queue-url https://sqs.us-east-1.amazonaws.com/YOUR_ACCOUNT/video-generation-queue" 