#!/bin/bash

echo "📦 Packaging Lambda functions..."

# Create deployment directories
mkdir -p dist/video-generation
mkdir -p dist/queue-manager
mkdir -p dist/fetch-videos
mkdir -p dist/jwt-authorizer
mkdir -p dist/get-user
mkdir -p dist/upsert-user

# Copy built JavaScript files
echo "📋 Copying video-generation files..."
cp lambda/video-generation/*.js dist/video-generation/
cp -r lambda/video-generation/util dist/video-generation/
cp lambda/package.json dist/video-generation/

echo "📋 Copying queue-manager files..."
cp lambda/queue-manager/*.js dist/queue-manager/
cp lambda/package.json dist/queue-manager/

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



# Install production dependencies in each directory
echo "📦 Installing dependencies for video-generation..."
cd dist/video-generation
npm install --production
cd ../..

echo "📦 Installing dependencies for queue-manager..."
cd dist/queue-manager
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



echo "✅ Lambda packaging completed!"
echo "📁 Deployment packages created in dist/ directory"
