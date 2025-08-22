#!/bin/bash

echo "📦 Packaging Lambda functions..."

# Create deployment directories
mkdir -p dist/video-generation
mkdir -p dist/full-video-queue
mkdir -p dist/fetch-videos
mkdir -p dist/jwt-authorizer
mkdir -p dist/get-user
mkdir -p dist/upsert-user
mkdir -p dist/generate-story-breakdown
mkdir -p dist/generate-audio
mkdir -p dist/generate-images
mkdir -p dist/fetch-data-preview

# Copy built JavaScript files
echo "📋 Copying video-generation files..."
cp lambda/video-generation/*.js dist/video-generation/
cp -r lambda/video-generation/util dist/video-generation/
cp lambda/package.json dist/video-generation/

echo "📋 Copying full-video-queue files..."
cp lambda/full-video-queue/*.js dist/full-video-queue/
cp lambda/package.json dist/full-video-queue/

echo "📋 Copying fetch-videos files..."
cp lambda/fetch-videos/*.js dist/fetch-videos/
cp lambda/package.json dist/fetch-videos/

echo "📋 Copying jwt-authorizer files..."
cp lambda/jwt-authorizer/*.js dist/jwt-authorizer/
cp lambda/package.json dist/jwt-authorizer/

echo "📋 Copying get-user files..."
cp lambda/get-user/*.js dist/get-user/

echo "📋 Copying upsert-user files..."
cp lambda/upsert-user/*.js dist/upsert-user/

echo "📋 Copying generate-story-breakdown files..."
cp lambda/generate-story-breakdown/*.js dist/generate-story-breakdown/
cp -r lambda/generate-story-breakdown/util dist/generate-story-breakdown/

echo "📋 Copying generate-audio files..."
cp lambda/generate-audio/*.js dist/generate-audio/
cp -r lambda/generate-audio/util dist/generate-audio/

echo "📋 Copying generate-images files..."
cp lambda/generate-images/*.js dist/generate-images/

echo "📋 Copying fetch-data-preview files..."
cp lambda/fetch-data-preview/*.js dist/fetch-data-preview/



# Install production dependencies in each directory
echo "📦 Installing dependencies for video-generation..."
cd dist/video-generation
npm install --production
cd ../..

echo "📦 Installing dependencies for full-video-queue..."
cd dist/full-video-queue
npm install --production
cd ../..

echo "📦 Installing dependencies for fetch-videos..."
cd dist/fetch-videos
npm install --production
cd ../..

echo "📦 Installing dependencies for jwt-authorizer..."
cd dist/jwt-authorizer
npm install --production
cd ../..

echo "📦 Installing dependencies for get-user..."
cd dist/get-user
cp ../../lambda/package.json .
npm install --production
cd ../..

echo "📦 Installing dependencies for upsert-user..."
cd dist/upsert-user
cp ../../lambda/package.json .
npm install --production
cd ../..

echo "📦 Installing dependencies for generate-story-breakdown..."
cd dist/generate-story-breakdown
cp ../../lambda/package.json .
npm install --production
cd ../..

echo "📦 Installing dependencies for generate-audio..."
cd dist/generate-audio
cp ../../lambda/package.json .
npm install --production
cd ../..

echo "📦 Installing dependencies for generate-images..."
cd dist/generate-images
cp ../../lambda/package.json .
npm install --production
cd ../..

echo "📦 Installing dependencies for fetch-data-preview..."
cd dist/fetch-data-preview
cp ../../lambda/package.json .
npm install --production
cd ../..



echo "✅ Lambda packaging completed!"
echo "📁 Deployment packages created in dist/ directory"
