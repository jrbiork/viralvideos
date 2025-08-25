#!/bin/bash

set -e

echo "🚀 Starting video-generation lambda deployment..."

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

# Build all lambdas (which includes video-generation)
echo "🔨 Building all lambdas..."
cd lambda
npm run build
cd ..

# Create deployment directory for video-generation
echo "📦 Packaging video-generation Lambda..."
mkdir -p dist/video-generation

# Copy built JavaScript files from dist directory
echo "📋 Copying video-generation files..."
cp lambda/dist/video-generation/*.js dist/video-generation/
cp -r lambda/dist/video-generation/util dist/video-generation/ 2>/dev/null || true
cp lambda/package.json dist/video-generation/

# Install production dependencies
echo "📦 Installing dependencies for video-generation..."
cd dist/video-generation
npm install --production
cd ../..

# Deploy only the video-generation lambda
echo "🚀 Deploying video-generation lambda..."
npx cdk deploy --require-approval never --context lambda=video-generation

echo "✅ Video-generation lambda deployment completed!"
echo ""
echo "📝 Next steps:"
echo "1. The video-generation lambda has been updated with the new blur and zoom effects"
echo "2. Test video generation to see the new visual effects"
echo "3. Check CloudWatch logs for any issues: aws logs tail /aws/lambda/ViralVideosStack-VideoGenerationLambda --follow"
echo ""
echo "🔗 Useful commands:"
echo "- View logs: aws logs tail /aws/lambda/ViralVideosStack-VideoGenerationLambda --follow"
echo "- Test video generation through the web interface"
echo "- Monitor SQS queue: aws sqs get-queue-attributes --queue-url https://sqs.us-east-1.amazonaws.com/YOUR_ACCOUNT/video-generation-queue"
