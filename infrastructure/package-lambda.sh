#!/bin/bash

echo "📦 Packaging Lambda functions..."

# Create deployment directories
mkdir -p dist/video-generation
mkdir -p dist/queue-manager

# Copy built JavaScript files
echo "📋 Copying video-generation files..."
cp lambda/video-generation/*.js dist/video-generation/
cp -r lambda/video-generation/util dist/video-generation/
cp lambda/package.json dist/video-generation/

echo "📋 Copying queue-manager files..."
cp lambda/queue-manager/*.js dist/queue-manager/
cp lambda/package.json dist/queue-manager/

# Install production dependencies in each directory
echo "📦 Installing dependencies for video-generation..."
cd dist/video-generation
npm install --production
cd ../..

echo "📦 Installing dependencies for queue-manager..."
cd dist/queue-manager
npm install --production
cd ../..

echo "✅ Lambda packaging completed!"
echo "📁 Deployment packages created in dist/ directory"
