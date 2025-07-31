#!/bin/bash

# Deploy script for Viral Videos infrastructure
# This script copies environment variables from the root .env.local to infrastructure/.env

set -e

echo "🚀 Starting deployment..."

# Check if we're in the infrastructure directory
if [ ! -f "package.json" ] || [ ! -f "lib/viral-videos-stack.ts" ]; then
    echo "❌ Error: Please run this script from the infrastructure directory"
    exit 1
fi

# Copy environment variables from root .env.local to infrastructure/.env
if [ -f "../.env.local" ]; then
    echo "📋 Copying environment variables from ../.env.local to .env..."
    
    # Create .env file with only the API keys needed for Lambda
    cat > .env << EOF
# API Keys for Lambda environment variables
# Copied from ../.env.local on $(date)

EOF
    
    # Extract API keys from .env.local
    if grep -q "RUNWAY_API_KEY" ../.env.local; then
        grep "RUNWAY_API_KEY" ../.env.local >> .env
    else
        echo "RUNWAY_API_KEY=your_runway_api_key_here" >> .env
    fi
    
    if grep -q "OPENAI_API_KEY" ../.env.local; then
        grep "OPENAI_API_KEY" ../.env.local >> .env
    else
        echo "OPENAI_API_KEY=your_openai_api_key_here" >> .env
    fi
    
    echo "✅ Environment variables copied successfully"
else
    echo "⚠️  Warning: ../.env.local not found. Creating template .env file..."
    cat > .env << EOF
# API Keys for Lambda environment variables
# Please add your actual API keys here

RUNWAY_API_KEY=your_runway_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
EOF
fi

# Build the project
echo "🔨 Building TypeScript..."
npm run build

# Install and build Lambda dependencies
echo "📦 Installing Lambda dependencies..."
cd lambda/video-generation
npm install
../../node_modules/.bin/tsc
cd ../..
echo "✅ Lambda dependencies installed and built"

# Deploy the stack
echo "🚀 Deploying CDK stack..."
npm run deploy

# Clean up temporary files (if any)
echo "🧹 Cleaning up temporary files..."
# Remove any temporary files if needed
echo "✅ Cleanup complete"

echo "✅ Deployment complete!"
echo ""
echo "📋 Next steps:"
echo "1. Update your Next.js app to use the new Lambda ARN"
echo "2. Test the video generation functionality" 