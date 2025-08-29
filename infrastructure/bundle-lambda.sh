#!/bin/bash

echo "📦 Bundling Lambda functions with esbuild..."

ESBUILD_FLAGS="--bundle --platform=node --target=node20 --minify --tree-shaking=true --legal-comments=none --define:process.env.NODE_ENV='\"production\"' --external:aws-sdk --format=cjs"

# Bundle video-generation lambda
echo "📦 Bundling video-generation lambda..."
npx esbuild lambda/video-generation/index.ts \
  $ESBUILD_FLAGS \
  --external:fluent-ffmpeg \
  --outfile=dist/video-generation/index.js

# Bundle generate-audio-subtitle lambda
echo "📦 Bundling generate-audio-subtitle lambda..."
npx esbuild lambda/generate-audio-subtitle/index.ts \
  $ESBUILD_FLAGS \
  --external:fluent-ffmpeg \
  --outfile=dist/generate-audio-subtitle/index.js

# Bundle full-video-queue lambda
echo "📦 Bundling full-video-queue lambda..."
npx esbuild lambda/full-video-queue/index.ts \
  $ESBUILD_FLAGS \
  --outfile=dist/full-video-queue/index.js

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

echo "✅ Lambda bundling completed!"
