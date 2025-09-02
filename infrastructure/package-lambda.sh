#!/bin/bash

echo "📦 Packaging Lambda functions..."

# Create deployment directories
mkdir -p dist/video-generation
mkdir -p dist/video-queue
mkdir -p dist/fetch-videos
mkdir -p dist/jwt-authorizer
mkdir -p dist/get-user
mkdir -p dist/upsert-user
mkdir -p dist/generate-audio-subtitle
mkdir -p dist/generate-image
mkdir -p dist/animate-image
mkdir -p dist/save-image
mkdir -p dist/fetch-preview

mkdir -p dist/delete-video
mkdir -p dist/websocket-connect
mkdir -p dist/websocket-disconnect
mkdir -p dist/websocket-message
mkdir -p dist/websocket-broadcast

# Copy built JavaScript files from dist directory
echo "📋 Copying video-generation files..."
cp lambda/dist/video-generation/*.js dist/video-generation/
cp -r lambda/dist/video-generation/util dist/video-generation/ 2>/dev/null || true
cp lambda/package.json dist/video-generation/



echo "📋 Copying video-queue files..."
cp lambda/dist/video-queue/*.js dist/video-queue/
cp lambda/package.json dist/video-queue/

echo "📋 Copying fetch-videos files..."
cp lambda/dist/fetch-videos/*.js dist/fetch-videos/
cp lambda/package.json dist/fetch-videos/

echo "📋 Copying jwt-authorizer files..."
cp lambda/dist/jwt-authorizer/*.js dist/jwt-authorizer/
cp lambda/package.json dist/jwt-authorizer/

echo "📋 Copying get-user files..."
cp lambda/dist/get-user/*.js dist/get-user/

echo "📋 Copying upsert-user files..."
cp lambda/dist/upsert-user/*.js dist/upsert-user/

echo "📋 Copying generate-audio-subtitle files..."
cp lambda/dist/generate-audio-subtitle/*.js dist/generate-audio-subtitle/

echo "📋 Copying generate-image files..."
cp lambda/dist/generate-image/*.js dist/generate-image/

echo "📋 Copying animate-image files..."
cp lambda/dist/animate-image/*.js dist/animate-image/

echo "📋 Copying save-image files..."
cp lambda/dist/save-image/*.js dist/save-image/

echo "📋 Copying fetch-preview files..."
cp lambda/dist/fetch-preview/*.js dist/fetch-preview/
cp lambda/package.json dist/fetch-preview/



echo "📋 Copying delete-video files..."
cp lambda/dist/delete-video/*.js dist/delete-video/

echo "📋 Copying websocket-connect files..."
cp lambda/dist/websocket-connect/*.js dist/websocket-connect/

echo "📋 Copying websocket-disconnect files..."
cp lambda/dist/websocket-disconnect/*.js dist/websocket-disconnect/

echo "📋 Copying websocket-message files..."
cp lambda/dist/websocket-message/*.js dist/websocket-message/

echo "📋 Copying websocket-broadcast files..."
cp lambda/dist/websocket-broadcast/*.js dist/websocket-broadcast/



# Install production dependencies in each directory
echo "📦 Installing dependencies for video-generation..."
cd dist/video-generation
cp ../../lambda/package.json .
npm install --production
cd ../..

echo "📦 Installing dependencies for video-queue..."
cd dist/video-queue
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

echo "📦 Installing dependencies for generate-audio-subtitle..."
cd dist/generate-audio-subtitle
cp ../../lambda/package.json .
npm install --production
cd ../..

echo "📦 Installing dependencies for generate-image..."
cd dist/generate-image
cp ../../lambda/package.json .
npm install --production
cd ../..

echo "📦 Installing dependencies for animate-image..."
cd dist/animate-image
cp ../../lambda/package.json .
npm install --production
cd ../..

echo "📦 Installing dependencies for save-image..."
cd dist/save-image
cp ../../lambda/package.json .
npm install --production
cd ../..

echo "📦 Installing dependencies for fetch-preview..."
cd dist/fetch-preview
cp ../../lambda/package.json .
npm install --production
cd ../..

echo "📦 Installing dependencies for delete-video..."
cd dist/delete-video
cp ../../lambda/package.json .
npm install --production
cd ../..

echo "📦 Installing dependencies for websocket-connect..."
cd dist/websocket-connect
cp ../../lambda/package.json .
npm install --production
cd ../..

echo "📦 Installing dependencies for websocket-disconnect..."
cd dist/websocket-disconnect
cp ../../lambda/package.json .
npm install --production
cd ../..

echo "📦 Installing dependencies for websocket-message..."
cd dist/websocket-message
cp ../../lambda/package.json .
npm install --production
cd ../..

echo "📦 Installing dependencies for websocket-broadcast..."
cd dist/websocket-broadcast
cp ../../lambda/package.json .
npm install --production
cd ../..



echo "✅ Lambda packaging completed!"
echo "📁 Deployment packages created in dist/ directory"
