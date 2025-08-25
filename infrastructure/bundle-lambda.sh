#!/bin/bash

echo "📦 Bundling Lambda functions with esbuild..."

# Bundle video-generation lambda
echo "📦 Bundling video-generation lambda..."
npx esbuild lambda/video-generation/index.ts \
  --bundle \
  --platform=node \
  --target=node20 \
  --external:aws-sdk \
  --external:fluent-ffmpeg \
  --outfile=dist/video-generation/index.js \
  --format=cjs

# Bundle generate-audio-subtitle lambda
echo "📦 Bundling generate-audio-subtitle lambda..."
npx esbuild lambda/generate-audio-subtitle/index.ts \
  --bundle \
  --platform=node \
  --target=node20 \
  --external:aws-sdk \
  --external:fluent-ffmpeg \
  --outfile=dist/generate-audio-subtitle/index.js \
  --format=cjs

# Bundle full-video-queue lambda
echo "📦 Bundling full-video-queue lambda..."
npx esbuild lambda/full-video-queue/index.ts \
  --bundle \
  --platform=node \
  --target=node20 \
  --external:aws-sdk \
  --outfile=dist/full-video-queue/index.js \
  --format=cjs

# Bundle fetch-videos lambda
echo "📦 Bundling fetch-videos lambda..."
npx esbuild lambda/fetch-videos/index.ts \
  --bundle \
  --platform=node \
  --target=node20 \
  --external:aws-sdk \
  --outfile=dist/fetch-videos/index.js \
  --format=cjs

# Bundle get-user lambda
echo "📦 Bundling get-user lambda..."
npx esbuild lambda/get-user/index.ts \
  --bundle \
  --platform=node \
  --target=node20 \
  --external:aws-sdk \
  --outfile=dist/get-user/index.js \
  --format=cjs

# Bundle upsert-user lambda
echo "📦 Bundling upsert-user lambda..."
npx esbuild lambda/upsert-user/index.ts \
  --bundle \
  --platform=node \
  --target=node20 \
  --external:aws-sdk \
  --outfile=dist/upsert-user/index.js \
  --format=cjs

# Bundle delete-video lambda
echo "📦 Bundling delete-video lambda..."
npx esbuild lambda/delete-video/index.ts \
  --bundle \
  --platform=node \
  --target=node20 \
  --external:aws-sdk \
  --outfile=dist/delete-video/index.js \
  --format=cjs

# Bundle jwt-authorizer lambda
echo "📦 Bundling jwt-authorizer lambda..."
npx esbuild lambda/jwt-authorizer/index.ts \
  --bundle \
  --platform=node \
  --target=node20 \
  --external:aws-sdk \
  --outfile=dist/jwt-authorizer/index.js \
  --format=cjs

# Bundle websocket-connect lambda
echo "📦 Bundling websocket-connect lambda..."
npx esbuild lambda/websocket-connect/index.ts \
  --bundle \
  --platform=node \
  --target=node20 \
  --external:aws-sdk \
  --outfile=dist/websocket-connect/index.js \
  --format=cjs

# Bundle websocket-disconnect lambda
echo "📦 Bundling websocket-disconnect lambda..."
npx esbuild lambda/websocket-disconnect/index.ts \
  --bundle \
  --platform=node \
  --target=node20 \
  --external:aws-sdk \
  --outfile=dist/websocket-disconnect/index.js \
  --format=cjs

# Bundle websocket-message lambda
echo "📦 Bundling websocket-message lambda..."
npx esbuild lambda/websocket-message/index.ts \
  --bundle \
  --platform=node \
  --target=node20 \
  --external:aws-sdk \
  --outfile=dist/websocket-message/index.js \
  --format=cjs

# Bundle websocket-broadcast lambda
echo "📦 Bundling websocket-broadcast lambda..."
npx esbuild lambda/websocket-broadcast/index.ts \
  --bundle \
  --platform=node \
  --target=node20 \
  --external:aws-sdk \
  --outfile=dist/websocket-broadcast/index.js \
  --format=cjs

echo "✅ Lambda bundling completed!"
