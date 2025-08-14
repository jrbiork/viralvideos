#!/bin/bash

# Deploy API Gateway Infrastructure
echo "🚀 Deploying API Gateway infrastructure..."

# Navigate to infrastructure directory
cd "$(dirname "$0")"

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found in infrastructure directory"
    echo "Please copy env.template to .env and configure your AWS credentials"
    exit 1
fi

# Load environment variables
source .env

# Build the Lambda functions
echo "🔨 Building Lambda functions..."
npm run build

# Deploy the stack
echo "📦 Deploying CDK stack..."
npx cdk deploy --require-approval never

# Get the API Gateway URL from the outputs
echo "🔍 Getting API Gateway URL..."
API_GATEWAY_URL=$(aws cloudformation describe-stacks \
    --stack-name ViralVideosStack \
    --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayUrl`].OutputValue' \
    --output text)

echo "✅ API Gateway URL: $API_GATEWAY_URL"

# Update the .env file with the API Gateway URL
if [ -f ../../.env ]; then
    echo "📝 Updating .env file with API Gateway URL..."
    if grep -q "API_GATEWAY_URL" ../../.env; then
        # Update existing line
        sed -i.bak "s|API_GATEWAY_URL=.*|API_GATEWAY_URL=$API_GATEWAY_URL|" ../../.env
    else
        # Add new line
        echo "API_GATEWAY_URL=$API_GATEWAY_URL" >> ../../.env
    fi
    echo "✅ Updated .env file"
else
    echo "⚠️  .env file not found in root directory. Please manually add:"
    echo "API_GATEWAY_URL=$API_GATEWAY_URL"
fi

echo "🎉 API Gateway deployment complete!"
echo "📋 Next steps:"
echo "1. Update your .env file with the API Gateway URL above"
echo "2. Restart your Next.js development server"
echo "3. Test the video generation endpoint"
