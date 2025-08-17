#!/bin/bash

echo "🔨 Building Lambda functions..."

# Build video-generation Lambda
echo "📦 Building video-generation..."
cd lambda/video-generation
npm run build
cd ../..

# Build queue-manager Lambda
echo "📦 Building queue-manager..."
cd lambda/queue-manager
npm run build
cd ../..

# Build fetch-videos Lambda
echo "📦 Building fetch-videos..."
cd lambda/fetch-videos
npm run build
cd ../..

# Build jwt-authorizer Lambda
echo "📦 Building jwt-authorizer..."
cd lambda/jwt-authorizer
npm run build
cd ../..

# Build get-user Lambda
echo "📦 Building get-user..."
cd lambda/get-user
npm run build
cd ../..

# Build upsert-user Lambda
echo "📦 Building upsert-user..."
cd lambda/upsert-user
npm run build
cd ../..

echo "✅ Lambda build completed!"
