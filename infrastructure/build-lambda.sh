#!/bin/bash

echo "🔨 Building Lambda functions..."

# Build video-generation Lambda
echo "📦 Building video-generation..."
cd lambda/video-generation
npm run build
cd ../..

# Build full-video-queue Lambda
echo "📦 Building full-video-queue..."
cd lambda/full-video-queue
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

# Build generate-story-breakdown Lambda
echo "📦 Building generate-story-breakdown..."
cd lambda/generate-story-breakdown
npm run build
cd ../..

# Build generate-audio-subtitle Lambda
echo "📦 Building generate-audio-subtitle..."
cd lambda/generate-audio-subtitle
npm run build
cd ../..

# Build generate-images Lambda
echo "📦 Building generate-images..."
cd lambda/generate-images
npm run build
cd ../..

# Build fetch-data-preview Lambda
echo "📦 Building fetch-data-preview..."
cd lambda/fetch-data-preview
npm run build
cd ../..

# Build delete-video Lambda
echo "📦 Building delete-video..."
cd lambda/delete-video
npm run build
cd ../..

echo "✅ Lambda build completed!"
