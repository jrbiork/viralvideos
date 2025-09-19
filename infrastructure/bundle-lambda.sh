#!/bin/bash

echo "📦 Bundling Lambda functions with esbuild..."

ESBUILD_FLAGS="--bundle --platform=node --target=node20 --minify --tree-shaking=true --legal-comments=none --define:process.env.NODE_ENV='\"production\"' --external:aws-sdk --format=cjs"

# Bundle video-generation lambda
echo "📦 Bundling video-generation lambda..."
npx esbuild lambda/video-generation/index.ts \
  $ESBUILD_FLAGS \
  --outfile=dist/video-generation/index.js

# Copy node_modules for video-generation lambda (needed for fluent-ffmpeg)
echo "📦 Copying node_modules for video-generation lambda..."
cp -r lambda/node_modules dist/video-generation/

# Note: generate-audio-subtitle functionality is part of video-generation lambda

# Bundle generate-image lambda
echo "📦 Bundling generate-image lambda..."
npx esbuild lambda/generate-image/index.ts \
  $ESBUILD_FLAGS \
  --outfile=dist/generate-image/index.js

# Copy node_modules for generate-image lambda
echo "📦 Copying node_modules for generate-image lambda..."
cp -r lambda/node_modules dist/generate-image/

# Bundle animate-image lambda
echo "📦 Bundling animate-image lambda..."
npx esbuild lambda/animate-image/index.ts \
  $ESBUILD_FLAGS \
  --outfile=dist/animate-image/index.js

# Copy node_modules for animate-image lambda
echo "📦 Copying node_modules for animate-image lambda..."
cp -r lambda/node_modules dist/animate-image/

# Bundle video-queue lambda
echo "📦 Bundling video-queue lambda..."
npx esbuild lambda/video-queue/index.ts \
  $ESBUILD_FLAGS \
  --outfile=dist/video-queue/index.js

# Bundle fetch-videos lambda
echo "📦 Bundling fetch-videos lambda..."
npx esbuild lambda/fetch-videos/index.ts \
  $ESBUILD_FLAGS \
  --outfile=dist/fetch-videos/index.js

# Bundle fetch-preview lambda
echo "📦 Bundling fetch-preview lambda..."
npx esbuild lambda/fetch-preview/index.ts \
  $ESBUILD_FLAGS \
  --outfile=dist/fetch-preview/index.js

# Bundle get-user lambda
echo "📦 Bundling get-user lambda..."
npx esbuild lambda/get-user/index.ts \
  $ESBUILD_FLAGS \
  --outfile=dist/get-user/index.js

# Bundle upsert-user lambda
echo "📦 Bundling upsert-user lambda..."
npx esbuild lambda/upsert-user/index.ts \
  $ESBUILD_FLAGS \
  --outfile=dist/upsert-user/index.js

# Bundle delete-video lambda
echo "📦 Bundling delete-video lambda..."
npx esbuild lambda/delete-video/index.ts \
  $ESBUILD_FLAGS \
  --outfile=dist/delete-video/index.js

# Bundle jwt-authorizer lambda
echo "📦 Bundling jwt-authorizer lambda..."
npx esbuild lambda/jwt-authorizer/index.ts \
  $ESBUILD_FLAGS \
  --outfile=dist/jwt-authorizer/index.js

# Bundle websocket-connect lambda
echo "📦 Bundling websocket-connect lambda..."
npx esbuild lambda/websocket-connect/index.ts \
  $ESBUILD_FLAGS \
  --outfile=dist/websocket-connect/index.js

# Bundle websocket-disconnect lambda
echo "📦 Bundling websocket-disconnect lambda..."
npx esbuild lambda/websocket-disconnect/index.ts \
  $ESBUILD_FLAGS \
  --outfile=dist/websocket-disconnect/index.js

# Bundle websocket-message lambda
echo "📦 Bundling websocket-message lambda..."
npx esbuild lambda/websocket-message/index.ts \
  $ESBUILD_FLAGS \
  --outfile=dist/websocket-message/index.js

# Bundle websocket-broadcast lambda
echo "📦 Bundling websocket-broadcast lambda..."
npx esbuild lambda/websocket-broadcast/index.ts \
  $ESBUILD_FLAGS \
  --outfile=dist/websocket-broadcast/index.js

# Bundle share-resolve lambda
echo "📦 Bundling share-resolve lambda..."
npx esbuild lambda/share-resolve/index.ts \
  $ESBUILD_FLAGS \
  --outfile=dist/share-resolve/index.js

echo "✅ Lambda bundling completed!"
