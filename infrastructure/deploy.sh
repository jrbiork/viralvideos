#!/bin/bash

set -e

echo "🚀 Starting full deployment of Viral Videos infrastructure..."

# Check if we're in the right directory
if [ ! -f "cdk.json" ]; then
    echo "❌ Error: cdk.json not found. Please run this script from the infrastructure directory."
    exit 1
fi

# Check if AWS credentials are configured
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ AWS credentials not configured. Please run 'aws configure' first."
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build the TypeScript code
echo "🔨 Building TypeScript..."
npm run build

# Build all Lambda functions
echo "🔨 Building Lambda functions..."
./build-lambda.sh

# Package Lambda functions
echo "📦 Packaging Lambda functions..."
./package-lambda.sh

# Deploy the stack
echo "🚀 Deploying CDK stack..."
npx cdk deploy --require-approval never

# Get the outputs
echo "📋 Getting stack outputs..."
aws cloudformation describe-stacks --stack-name ViralVideosStack --query 'Stacks[0].Outputs' --output table

echo "✅ Deployment completed!"
echo ""
echo "📝 Next steps:"
echo "1. Update your .env file with the API Gateway URL from the CDK outputs"
echo "2. Test the new user management API Gateway endpoint"
echo "3. Verify that user creation/updates work through the API Gateway"
echo "4. The video generation is now asynchronous - videos will be queued and processed in the background"
echo "5. Check the CloudWatch logs for the lambda functions to monitor processing"
echo ""
echo "🔗 Useful commands:"
echo "- View logs: aws logs tail /aws/lambda/ViralVideosStack-VideoGenerationLambda --follow"
echo "- View queue: aws sqs get-queue-attributes --queue-url https://sqs.us-east-1.amazonaws.com/YOUR_ACCOUNT/video-generation-queue"
echo "- Check user management logs: aws logs tail /aws/lambda/ViralVideosStack-UserManagementLambda --follow" 