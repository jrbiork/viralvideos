#!/bin/bash

echo "🔨 Building Lambda functions..."

# Build all lambdas using the main lambda build script
echo "📦 Building all lambdas..."
cd lambda
npm run build
cd ..

echo "✅ Lambda build completed!"
